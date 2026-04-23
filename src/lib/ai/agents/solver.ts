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
export async function proposeActions(problem: Problem): Promise<ProposedAction[]> {
  const { object } = await generateObjectWithFallback<AISolverResponse>({
    schema: z.object({
      actions: z.array(z.object({
        type: z.string().describe('行動の種類（例：学習、購入、設定変更）'),
        description: z.string().describe('具体的なアクション内容'),
        timeCost: z.string().describe('予想される時間コスト'),
        moneyCost: z.number().describe('予想される金銭的コスト (円)'),
        expectedGain: z.string().describe('期待される効果やメリット'),
        risk: z.string().describe('想定されるリスク'),
        link: z.string().optional().describe('関連する参考リンクやツールのURL'),
        reason: z.string().describe('この解決策を提案する理由'),
      })).min(1).max(3),
    }),
    prompt: `あなたは Catalyst システムの Solver エージェントです。
このシステムの目的は、ユーザーの「考える」負担を極限まで減らし、「損を回避したい（後悔したくない）」という心理に応え、確実な「実行」へ誘導することです。

以下の課題に対して、具体的で実行可能な解決策を最大3つ提案してください。

【課題の詳細】
文脈: ${problem.context}
症状: ${problem.symptoms}
制約: ${problem.constraints}
ゴール: ${problem.goal}

【提案のルール】
1. 1つは最も推奨されるアクションとし、その他は代替案とします。
2. リンク(link)は、必ず有効なURLにしてください。特定のURLが不明な場合は、適切な検索キーワードを用いたGoogle検索URL（例: https://www.google.com/search?q=キーワード）を生成してください。
3. ユーザーが「これなら自分でもできる」「損をしない」と思えるような、心理的ハードルの低い提案を心がけてください。
4. もし適切な解決策が既存のサービスにない場合は、「代替案の作成（例：自分で小さなプロトタイプを作る、コミュニティで募集する）」など、未来を切り拓く提案を含めてください。
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
