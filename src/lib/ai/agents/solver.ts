import { generateObjectWithFallback } from '@/lib/ai/call';
import { models } from '@/lib/ai/models';
import { z } from 'zod';
import { Problem } from '@/lib/types/schema';
import { ProposedAction } from '@/lib/types/ai';

/**
 * AIからの生の回答の型
 */
interface AISolverResponse {
  actions: {
    type: string;
    description: string;
    timeCost: string;
    moneyCost: number;
    expectedGain: string;
    risk: string;
    link?: string;
    reason: string;
  }[];
}

/**
 * Solver Agent
 * 構造化された課題に対して具体的な解決策（Action）を提案します
 */
export async function proposeActions(
  problem: Problem, 
  activitySummary?: { visitCount: number, previousClicks: number }
): Promise<ProposedAction[]> {
  const activityContext = activitySummary 
    ? `【ユーザーの行動履歴】
- この課題に関連する訪問回数: ${activitySummary.visitCount}回
- 過去の提案へのクリック回数: ${activitySummary.previousClicks}回
${activitySummary.visitCount > 3 && activitySummary.previousClicks === 0 ? '※ユーザーは興味を持っていますが、行動に移せていません。よりハードルの低い、確実な一歩を提案してください。' : ''}`
    : '';

  const { object } = await generateObjectWithFallback<AISolverResponse>({
    schema: z.object({
      actions: z.array(z.object({
        type: z.string().describe('種類'),
        description: z.string().describe('内容'),
        timeCost: z.string().describe('時間'),
        moneyCost: z.number().describe('金額'),
        expectedGain: z.string().describe('メリット'),
        risk: z.string().describe('リスク/損失'),
        link: z.string().optional().describe('URL'),
        reason: z.string().describe('理由'),
      })).min(1).max(3),
    }),
    prompt: `Catalyst Solverエージェント。実行へ誘導せよ。
【ルール】
1. 事実に基づき未解決時の損失を提示。
2. 推奨案+極低コスト案(スモールステップ)を提示。
3. 選択の自由を尊重し、納得感ある理由を添える。

【課題】
文脈: ${problem.context}
症状: ${problem.symptoms}
制約: ${problem.constraints}
目標: ${problem.goal}

${activityContext}
`,
  }, models.primary);

  return object.actions.map((action, index) => ({
    type: action.type,
    description: action.description,
    reason: action.reason,
    cost: {
      time: action.timeCost,
      money: action.moneyCost,
    },
    expectedGain: action.expectedGain,
    risk: action.risk,
    link: action.link,
    isRecommended: index === 0,
    problemId: problem.id || 'temp',
  }));
}
