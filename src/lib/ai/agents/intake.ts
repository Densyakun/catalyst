import { generateObjectForRole } from '@/lib/ai/call';
import { z } from 'zod';
import { IntakeStep, StructuredProblem } from '@/lib/types/ai';

export interface UserContext {
  pastSessions?: {
    answers: { question: string; answer: string }[];
    completedAt: string;
  }[];
  pastProblems?: {
    context: string;
    symptoms: string;
    goal: string;
    tags: string[];
    status: string;
  }[];
  activitySummary?: {
    visitCount: number;
    previousClicks: number;
  };
}

/**
 * Intake Agent: 次のステップ（質問または結果）を決定します
 * 過去の会話履歴やユーザーデータを活用して、より適切な質問を生成します
 */
export async function getNextIntakeStep(
  answers: { question: string, answer: string }[],
  userContext?: UserContext
): Promise<IntakeStep> {
  const history = answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');

  const pastSessionsContext = userContext?.pastSessions?.length
    ? `\n【過去の診断セッション】\n${userContext.pastSessions.map((s, i) =>
        `--- セッション${i + 1} (${s.completedAt}) ---\n${s.answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n')}`
      ).join('\n\n')}`
    : '';

  const pastProblemsContext = userContext?.pastProblems?.length
    ? `\n【過去の課題】\n${userContext.pastProblems.map((p, i) =>
        `--- 課題${i + 1} ---\n文脈: ${p.context}\n症状: ${p.symptoms}\nゴール: ${p.goal}\nタグ: ${p.tags.join(', ')}\n状態: ${p.status}`
      ).join('\n\n')}`
    : '';

  const activityContext = userContext?.activitySummary
    ? `\n【ユーザー活動】\n訪問回数: ${userContext.activitySummary.visitCount}\nアクション実行回数: ${userContext.activitySummary.previousClicks}`
    : '';

  const { object } = await generateObjectForRole<IntakeStep>('structuring', {
    schema: z.object({
      type: z.enum(['question', 'result']).describe('ステップ種別'),
      question: z.string().describe('質問文（resultの場合は空文字）'),
      options: z.array(z.string()).describe('選択肢（resultの場合は空配列）'),
      is_final: z.boolean().describe('終了フラグ'),
    }),
    prompt: `Catalyst Intakeエージェント。ユーザーの課題を特定せよ。
【憲法】
1. ナビゲーション: 具体的選択肢で迷わせない。
2. 自由度: 必ず「その他」を含めるか促す。
3. 本音: 誘導せず生の声を引き出す。
4. 過去の文脈活用: 過去の診断や課題を参考に、重複を避け、深掘りすべき点を特定せよ。

【出力例】
{
  "type": "question",
  "question": "領域は？",
  "options": ["仕事", "生活", "人間関係", "その他"],
  "is_final": false
}

【現在の対話履歴】
${history || 'なし'}
${pastSessionsContext}
${pastProblemsContext}
${activityContext}
`,
  });

  return object;
}

/**
 * 最終的な構造化（複数の課題に分解可能）
 * 過去の会話履歴やユーザーデータを活用して、より適切な構造化を行います
 */
export async function structureProblem(
  answers: { question: string, answer: string }[],
  userContext?: UserContext
): Promise<StructuredProblem[]> {
  const history = answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');

  const pastSessionsContext = userContext?.pastSessions?.length
    ? `\n【過去の診断セッション】\n${userContext.pastSessions.map((s, i) =>
        `--- セッション${i + 1} (${s.completedAt}) ---\n${s.answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n')}`
      ).join('\n\n')}`
    : '';

  const pastProblemsContext = userContext?.pastProblems?.length
    ? `\n【過去の課題】\n${userContext.pastProblems.map((p, i) =>
        `--- 課題${i + 1} ---\n文脈: ${p.context}\n症状: ${p.symptoms}\nゴール: ${p.goal}\nタグ: ${p.tags.join(', ')}\n状態: ${p.status}`
      ).join('\n\n')}`
    : '';

  const activityContext = userContext?.activitySummary
    ? `\n【ユーザー活動】\n訪問回数: ${userContext.activitySummary.visitCount}\nアクション実行回数: ${userContext.activitySummary.previousClicks}`
    : '';

  const { object } = await generateObjectForRole<{ problems: StructuredProblem[] }>('structuring', {
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
    prompt: `対話履歴から課題を構造化せよ。過去の課題との関連性や変化を考慮すること。

【算出指針(personal_priority)】
0.0-1.0の範囲で。緊急性、影響度、本人の意志を考慮。
過去の課題が未解決で関連する場合は重要度を上げること。

【現在の対話履歴】
${history}
${pastSessionsContext}
${pastProblemsContext}
${activityContext}
`,
  });

  return object.problems.map(p => ({
    ...p,
    social_impact: 0,
    priority_score: 0,
    status: 'unsolved' as const,
  }));
}
