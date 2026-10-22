import { generateObjectForRole } from '@/lib/ai/call';
import { z } from 'zod';
import type { ExtractedIntent, DiffData } from '@/lib/types/sources';

/**
 * Proactive Agent: 外部ソースのテキストから意図・課題を自動検出
 */
export async function extractIntents(
  content: string,
  existingProblems?: string[],
): Promise<{ summary: string; intents: ExtractedIntent[] }> {
  const existingContext = existingProblems?.length
    ? `\n【既存の課題（重複を避けること）】\n${existingProblems.join('\n')}`
    : '';

  const { object } = await generateObjectForRole<{
    summary: string;
    intents: ExtractedIntent[];
  }>('structuring', {
    schema: z.object({
      summary: z.string().describe('ドキュメント全体の要約（3文以内）'),
      intents: z.array(z.object({
        description: z.string().describe('検出された意図・課題の説明'),
        category: z.string().describe('カテゴリ（仕事, 生活, 趣味, 健康, 人間関係, 学習, お金, その他）'),
        urgency: z.enum(['low', 'medium', 'high']).describe('緊急度'),
        related_text: z.string().describe('関連するテキストの抜粋（原文のまま）'),
      })).describe('検出された意図・課題のリスト'),
    }),
    prompt: `Katalyse Proactiveエージェント。ユーザーのメモ・ドキュメントから、潜在的な課題や「やりたいこと」を自動検出せよ。

【原則】
1. ユーザーが明示的に書いていないが、文脈から推測される課題も検出する
2. 些細なメモでも、背後にある本質的な課題を見抜く
3. 既存の課題と重複するものは除外する
4. 情報を削除・無視してはならない。すべてのメモ内容を読み取ること

【ドキュメント内容】
${content}
${existingContext}
`,
  });

  return object;
}

/**
 * メモの整理提案を生成（diff形式）
 * 情報を削除せず、再構成・カテゴリ分け・補足のみ行う
 */
export async function generateMemoRewrite(
  originalContent: string,
): Promise<DiffData> {
  const { object } = await generateObjectForRole<{
    revised: string;
    change_descriptions: string[];
  }>('structuring', {
    schema: z.object({
      revised: z.string().describe('整理されたメモの全文'),
      change_descriptions: z.array(z.string()).describe('各変更の説明（ユーザーが理解できるように）'),
    }),
    prompt: `Katalyse Proactiveエージェント。ユーザーのメモを整理せよ。

【絶対ルール】
1. 情報を削除してはならない。すべての情報を保持すること
2. 再構成（並び替え、カテゴリ分け、見出し追加）のみ行う
3. 曖昧な箇所には補足を[ ]で追記する
4. 元の言葉遣いを尊重する

【整理方法】
- カテゴリ別にグループ化
- 優先度順に並び替え
- 期限がありそうなものにマークを付与
- 関連する項目をまとめる

【元のメモ】
${originalContent}
`,
  });

  const changes = computeLineDiff(originalContent, object.revised);

  return {
    changes,
    original_full: originalContent,
    revised_full: object.revised,
  };
}

/**
 * コスト推定: インサイトが自動実行可能かどうかを判定
 */
export async function estimateInsightCost(
  insightContent: string,
): Promise<{ time: string; money: number; auto_proceed: boolean }> {
  const { object } = await generateObjectForRole<{
    time: string;
    money: number;
    auto_proceed: boolean;
    reason: string;
  }>('structuring', {
    schema: z.object({
      time: z.string().describe('推定所要時間'),
      money: z.number().describe('推定コスト（円）'),
      auto_proceed: z.boolean().describe('自動実行可能か（コストが低い場合true）'),
      reason: z.string().describe('判定理由'),
    }),
    prompt: `以下のアクションのコストを推定し、自動実行可能かどうか判定せよ。

【自動実行の基準】
- 時間: 5分以内
- 金額: 0円
- リスク: 取り消し可能（情報の削除を伴わない）

上記すべてを満たす場合のみ auto_proceed = true とする。

【アクション内容】
${insightContent}
`,
  });

  return {
    time: object.time,
    money: object.money,
    auto_proceed: object.auto_proceed,
  };
}

/**
 * 行単位のdiff計算（簡易版）
 */
function computeLineDiff(
  original: string,
  revised: string,
): DiffData['changes'] {
  const origLines = original.split('\n');
  const revLines = revised.split('\n');
  const changes: DiffData['changes'] = [];

  const maxLen = Math.max(origLines.length, revLines.length);

  for (let i = 0; i < maxLen; i++) {
    const origLine = origLines[i] ?? '';
    const revLine = revLines[i] ?? '';

    if (origLine === revLine) {
      if (origLine) {
        changes.push({ type: 'unchanged', original: origLine, revised: revLine });
      }
    } else if (!origLine && revLine) {
      changes.push({ type: 'added', original: '', revised: revLine });
    } else if (origLine && !revLine) {
      changes.push({ type: 'removed', original: origLine, revised: '' });
    } else {
      changes.push({ type: 'modified', original: origLine, revised: revLine });
    }
  }

  return changes;
}
