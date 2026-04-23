import { generateObject } from 'ai';
import { models } from '@/lib/ai/models';
import { z } from 'zod';

/**
 * Intake & Structuring Agent
 * ユーザーの入力内容を構造化された Problem オブジェクトに変換します
 */
export async function structureProblem(userInput: string) {
  const { object } = await generateObject({
    model: models.structuring,
    schema: z.object({
      context: z.string().describe('課題のバックグラウンドや文脈'),
      symptoms: z.string().describe('具体的に起きている困りごと'),
      constraints: z.string().describe('制限事項や不可能なこと'),
      goal: z.string().describe('最終的にどうなりたいか'),
      severity: z.number().min(1).max(10).describe('1(低)-10(高)の深刻度'),
      frequency: z.string().describe('発生頻度の推定'),
      tags: z.array(z.string()).describe('ドメインを特定するタグ'),
    }),
    prompt: `あなたは Catalyst システムの Intake エージェントです。
あなたの役割は、ユーザーの曖昧な「悩み」を、将来の社会課題解決の基盤となる「構造化された意思決定データ」へ変換することです。

【入力内容】
${userInput}

【構造化のガイドライン】
1. ユーザーが「何を課題とすべきか分からない」状態であることを前提に、背後にある根本的な不満やニーズを抽出してください。
2. 収集するデータは、将来的に他のユーザーの類似課題とクラスタリングしたり、社会の資産として活用したりすることを念頭に置いてください。
3. 特に「何に損を感じているか」「どのような制約が行動を阻害しているか」を明確にしてください。
`,
  });

  // 優先度の簡易計算 (impact x feasibility を想定)
  // ここでは初期値として severity をベースに計算
  // 優先度の簡易計算
  const priority = Math.round(object.severity * 1.5);

  return {
    ...object,
    priority,
    status: 'unsolved' as const,
  };
}
