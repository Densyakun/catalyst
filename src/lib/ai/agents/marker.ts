import { generateObjectForRole } from '@/lib/ai/call';
import { z } from 'zod';

interface ScoringInput {
  id: string;
  type: string;
  description: string;
}

interface ScoringResult {
  item_id: string;
  relevance_score: number;
  reason: string;
}

/**
 * Layer 0: ルールベースの目星判定（コスト0）
 * カテゴリ一致・更新日時の鮮度・既存マークとの重複チェック
 */
export function ruleBasedMarking(
  items: ScoringInput[],
  targetCategory?: string,
): ScoringResult[] {
  return items.map((item) => {
    let score = 0.5; // ベーススコア

    // カテゴリ一致ボーナス
    if (targetCategory && item.description.includes(targetCategory)) {
      score += 0.3;
    }

    // 短い説明は情報量が少ない→低スコア
    if (item.description.length < 20) {
      score -= 0.2;
    }

    return {
      item_id: item.id,
      relevance_score: Math.max(0, Math.min(1, score)),
      reason: 'ルールベース判定',
    };
  });
}

/**
 * Layer 1: LLMスコアリング（軽量、¥0.5/件程度）
 * 関連度を0-1で判定
 */
export async function llmScoring(
  items: ScoringInput[],
  context: string,
): Promise<ScoringResult[]> {
  const itemsText = items
    .map((item, i) => `${i}: [${item.type}] ${item.description}`)
    .join('\n');

  const { object } = await generateObjectForRole<{ scores: { index: number; score: number; reason: string }[] }>('structuring', {
    schema: z.object({
      scores: z.array(z.object({
        index: z.number().describe('アイテムのインデックス'),
        score: z.number().min(0).max(1).describe('関連度スコア（0-1）'),
        reason: z.string().describe('判定理由（簡潔に）'),
      })),
    }),
    prompt: `以下のアイテムが、指定されたコンテキストにどの程度関連するかスコアリングせよ。

【コンテキスト】
${context}

【アイテム一覧】
${itemsText}

【基準】
0.0-0.3: 無関係
0.3-0.6: 間接的に関連
0.6-0.8: 直接関連
0.8-1.0: 非常に重要
`,
  });

  return object.scores.map((s) => ({
    item_id: items[s.index]?.id ?? '',
    relevance_score: s.score,
    reason: s.reason,
  }));
}
