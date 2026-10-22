import { generateObjectForRole } from '@/lib/ai/call';
import { z } from 'zod';

interface DecomposedTask {
  title: string;
  description: string;
  estimated_cost: number;
  execution_type: 'auto' | 'user' | 'hybrid';
  depends_on_indices: number[];
  sort_order: number;
}

interface DecompositionResult {
  tasks: DecomposedTask[];
  total_estimated_cost: number;
  is_social: boolean;
  estimated_beneficiaries: number | null;
}

/**
 * 課題をプロジェクト化し、適切な粒度のタスクに分割
 */
export async function decomposeIntoTasks(
  title: string,
  description: string,
  isSocial: boolean,
  availableResources?: { name: string; type: string; description: string }[],
): Promise<DecompositionResult> {
  const resourcesText = availableResources
    ?.map((r, i) => `${i + 1}. [${r.type}] ${r.name}: ${r.description}`)
    .join('\n');

  const { object } = await generateObjectForRole<DecompositionResult>('structuring', {
    schema: z.object({
      tasks: z.array(z.object({
        title: z.string().describe('タスク名'),
        description: z.string().describe('タスクの詳細説明'),
        estimated_cost: z.number().describe('推定コスト（円）- LLM API料金等'),
        execution_type: z.enum(['auto', 'user', 'hybrid']).describe('実行方法'),
        depends_on_indices: z.array(z.number()).describe('依存タスクのインデックス（0始まり）'),
        sort_order: z.number().describe('実行順序'),
      })).min(2).max(10),
      total_estimated_cost: z.number().describe('全タスクの合計推定コスト'),
      is_social: z.boolean().describe('社会課題か'),
      estimated_beneficiaries: z.number().nullable().describe('推定受益者数（社会課題の場合）'),
    }),
    prompt: `Katalyse プロジェクト分割エージェント。大規模な課題を実行可能なタスクに分割せよ。

【分割基準】
1タスク ≈ 1回のLLM呼び出しで完了可能な単位
- コストが明確（1回の呼び出し料金 ≈ タスクコスト）
- 成果物が明確（入力と出力が定義可能）
- 独立して評価可能（「できた/できてない」が判断可能）

【実行タイプ】
- auto: AIが自動で実行可能（情報収集、分析、文書作成等）
- user: ユーザーの行動が必要（対面の会話、物理的な作業等）
- hybrid: AIが準備し、ユーザーが確認/実行（提案書作成→ユーザーが送信等）

【課題】
タイトル: ${title}
説明: ${description}
種別: ${isSocial ? '社会課題' : '個人課題'}

${resourcesText ? `【利用可能なリソース】\n${resourcesText}` : ''}
`,
  });

  return object;
}

/**
 * タスクの規模を判定（分割が必要か）
 */
export async function assessScale(
  description: string,
): Promise<{ needs_decomposition: boolean; reason: string; estimated_task_count: number }> {
  const { object } = await generateObjectForRole<{
    needs_decomposition: boolean;
    reason: string;
    estimated_task_count: number;
  }>('structuring', {
    schema: z.object({
      needs_decomposition: z.boolean().describe('タスク分割が必要か'),
      reason: z.string().describe('判定理由'),
      estimated_task_count: z.number().describe('推定タスク数（分割不要なら1）'),
    }),
    prompt: `以下の課題が単一タスクで完了できるか、プロジェクトとして分割が必要かを判定せよ。

【分割が必要な基準】
- 複数の異なるステップが必要
- 推定コスト > ¥50
- 異なるスキル/ツールが必要
- 依存関係がある作業が含まれる

【課題】
${description}
`,
  });

  return object;
}
