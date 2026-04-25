import { generateObjectWithFallback } from '@/lib/ai/call';
import { models } from '@/lib/ai/models';
import { z } from 'zod';
import { IntakeStep, StructuredProblem } from '@/lib/types/ai';

/**
 * Intake Agent: 次のステップ（質問または結果）を決定します
 */
export async function getNextIntakeStep(answers: { question: string, answer: string }[]): Promise<IntakeStep> {
  // 直近5件の履歴のみを保持してトークンを節約
  const recentAnswers = answers.slice(-5);
  const history = recentAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');

  const { object } = await generateObjectWithFallback<IntakeStep>({
    schema: z.object({
      type: z.enum(['question', 'result']).describe('ステップ種別'),
      question: z.string().optional().describe('質問文'),
      options: z.array(z.string()).optional().describe('選択肢'),
      is_final: z.boolean().describe('終了フラグ'),
    }),
    prompt: `Catalyst Intakeエージェント。ユーザーの課題を特定せよ。
【憲法】
1. ナビゲーション: 具体的選択肢で迷わせない。
2. 自由度: 必ず「その他」を含めるか促す。
3. 本音: 誘導せず生の声を引き出す。

【出力例】
{
  "type": "question",
  "question": "領域は？",
  "options": ["仕事", "生活", "人間関係", "その他"],
  "is_final": false
}

【履歴(直近5件)】
${history || 'なし'}
`,
  }, models.structuring as any);

  return object;
}

/**
 * 最終的な構造化（複数の課題に分解可能）
 */
export async function structureProblem(answers: { question: string, answer: string }[]): Promise<StructuredProblem[]> {
  // トークン節約のため全回答を使用（通常は3-5問なので問題ないが念のため制限）
  const history = answers.slice(-10).map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');

  const { object } = await generateObjectWithFallback<{ problems: StructuredProblem[] }>({
    schema: z.object({
      problems: z.array(z.object({
        context: z.string().describe('文脈'),
        symptoms: z.string().describe('症状'),
        constraints: z.string().describe('制約'),
        goal: z.string().describe('ゴール'),
        severity: z.number().min(1).max(10).describe('深刻度'),
        frequency: z.string().describe('頻度'),
        tags: z.array(z.string()).describe('タグ'),
        personal_priority: z.number().describe('個人重要度(0-1)'),
      })).min(1),
    }),
    prompt: `対話履歴から課題を構造化せよ。

【算出指針(personal_priority)】
0.0-1.0の範囲で。緊急性、影響度、本人の意志を考慮。

【対話履歴】
${history}
`,
  }, models.structuring as any);

  return object.problems.map(p => ({
    ...p,
    social_impact: 0,   // 後続の処理で算出
    priority_score: 0,  // 後続の処理で算出
    status: 'unsolved' as const,
  }));
}
