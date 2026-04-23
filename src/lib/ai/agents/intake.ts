import { generateObjectWithFallback } from '@/lib/ai/call';
import { models } from '@/lib/ai/models';
import { z } from 'zod';
import { IntakeStep, StructuredProblem } from '@/lib/types/ai';

/**
 * Intake Agent: 次のステップ（質問または結果）を決定します
 */
export async function getNextIntakeStep(answers: { question: string, answer: string }[]): Promise<IntakeStep> {
  const history = answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');

  const { object } = await generateObjectWithFallback<IntakeStep>({
    schema: z.object({
      type: z.enum(['question', 'result']).describe('次のステップの種類'),
      question: z.string().optional().describe('次の質問内容（typeがquestionの場合）'),
      options: z.array(z.string()).optional().describe('ユーザーが選択しやすい回答の選択肢'),
      is_final: z.boolean().describe('これが最後の質問か、または結果に進むべきか'),
    }),
    prompt: `あなたは Catalyst システムの Intake エージェントです。
ユーザーの「考える負担」を減らしながら、課題を構造化するために必要な情報を収集してください。

【これまでの対話内容】
${history || 'まだ対話は始まっていません。'}

【ガイドライン】
1. ユーザーが「選ぶだけ」で済むように、適切な選択肢(options)を提示してください。
2. 質問は一度に1つ、合計3〜5問程度で課題の本質（context, symptoms, constraints, goal）を特定できるようにしてください。
3. すでに十分な情報が集まったと判断した場合は、type を 'result' にして終了してください。
4. ドメイン（ゲーム、家計など）に固執せず、ユーザーが抱えている「不満」や「損をしている感覚」に焦点を当ててください。
`,
  }, models.structuring as any);

  return object;
}

/**
 * 最終的な構造化（複数の課題に分解可能）
 */
export async function structureProblem(answers: { question: string, answer: string }[]): Promise<StructuredProblem[]> {
  const history = answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');

  const { object } = await generateObjectWithFallback<{ problems: StructuredProblem[] }>({
    schema: z.object({
      problems: z.array(z.object({
        context: z.string().describe('課題のバックグラウンドや文脈'),
        symptoms: z.string().describe('具体的に起きている困りごと'),
        constraints: z.string().describe('制限事項や不可能なこと'),
        goal: z.string().describe('最終的にどうなりたいか'),
        severity: z.number().min(1).max(10).describe('1(低)-10(高)の深刻度'),
        frequency: z.string().describe('発生頻度の推定'),
        tags: z.array(z.string()).describe('ドメインを特定するタグ'),
      })).min(1).describe('抽出された課題のリスト'),
    }),
    prompt: `以下の対話履歴から、課題を抽出して構造化データに変換してください。
ユーザーの入力に複数の異なる悩みや問題が含まれている場合は、それらを「解決可能な最小単位」に分解し、複数の課題として出力してください。

【対話履歴】
${history}
`,
  }, models.structuring as any);

  return object.problems.map(p => ({
    ...p,
    priority: Math.round(p.severity * 1.5),
    status: 'unsolved' as const,
  }));
}
