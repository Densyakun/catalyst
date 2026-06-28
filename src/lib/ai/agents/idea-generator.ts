import { generateObjectForRole } from '@/lib/ai/call';
import { z } from 'zod';

interface GeneratedIdea {
  title: string;
  description: string;
  approach: string;
  estimated_cost: { time: string; money: number };
  is_social: boolean;
  category: string;
  auto_proceed: boolean;
}

/**
 * 目星をつけた情報からアイデアを生成
 */
export async function generateIdeas(
  markedProblems: { description: string; urgency: string }[],
  markedResources: { name: string; type: string; description: string }[],
  additionalContext?: string,
): Promise<GeneratedIdea[]> {
  const problemsText = markedProblems
    .map((p, i) => `${i + 1}. [${p.urgency}] ${p.description}`)
    .join('\n');

  const resourcesText = markedResources
    .map((r, i) => `${i + 1}. [${r.type}] ${r.name}: ${r.description}`)
    .join('\n');

  const { object } = await generateObjectForRole<{ ideas: GeneratedIdea[] }>('solving', {
    schema: z.object({
      ideas: z.array(z.object({
        title: z.string().describe('アイデアのタイトル'),
        description: z.string().describe('アイデアの説明'),
        approach: z.string().describe('具体的なアプローチ'),
        estimated_cost: z.object({
          time: z.string().describe('推定所要時間'),
          money: z.number().describe('推定コスト（円）'),
        }),
        is_social: z.boolean().describe('社会課題か（複数人に恩恵があるか）'),
        category: z.string().describe('カテゴリ'),
        auto_proceed: z.boolean().describe('自動実行可能か（低コスト・低リスク）'),
      })).min(1).max(5),
    }),
    prompt: `Catalyst アイデア生成エージェント。目星をつけた課題とリソースから、実行可能なアイデアを生成せよ。

【原則】
1. 課題とリソースの組み合わせから実現可能なアイデアを提案する
2. 各アイデアのコスト（LLM使用量等の実コスト）を正確に推定する
3. 社会課題（複数人に恩恵があるもの）は is_social = true とする
4. 自動実行可能なもの（5分以内、¥0、取り消し可能）は auto_proceed = true
5. 大規模なアイデアも恐れず提案する（タスク分割で対応する）

【課題一覧】
${problemsText || 'なし'}

【リソース一覧】
${resourcesText || 'なし'}

${additionalContext ? `【追加コンテキスト】\n${additionalContext}` : ''}
`,
  });

  return object.ideas;
}
