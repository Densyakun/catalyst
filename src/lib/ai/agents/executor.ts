import { generateObject, generateText } from 'ai';
import { generateObjectWithFallback, generateTextWithFallback } from '@/lib/ai/call';
import { models } from '@/lib/ai/models';
import { z } from 'zod';

/**
 * Executor Agent: アクションの具体的な実行内容やリサーチ結果を生成します
 */
export async function executeAction(action: any, problem: any) {
  const { object } = await generateObjectWithFallback({
    schema: z.object({
      summary: z.string().describe('リサーチ結果の要約'),
      details: z.array(z.object({
        title: z.string(),
        content: z.string(),
        link: z.string().optional()
      })).describe('具体的な情報（検索結果、価格、手順など）'),
      next_steps: z.array(z.string()).describe('ユーザーが次に取るべき具体的な行動'),
      advice: z.string().describe('後悔しないためのアドバイス'),
    }),
    prompt: `あなたは Catalyst システムの Executor エージェントです。
以下の「課題」に対して提案された「アクション」を具体化し、ユーザーが即座に意思決定できるように情報を整理してください。

【課題】
${problem.context} -> ${problem.goal}

【アクション】
${action.description}

【任務】
1. このアクションに関連する最新情報や、世の中の仕組み、解決手段をリサーチした体で、具体的なデータを提示してください。
2. ユーザーが「自分で検索」する必要がないほど、詳細な情報を網羅してください。
3. もし特定の製品やサービスに関するものであれば、そのメリット・デメリットを「損回避」の視点で分析してください。
`,
  }, models.primary as any);

  return object;
}

/**
 * チャット応答: アクションの実行中にユーザーからの質問に答えます
 */
export async function chatWithExecutor(message: string, context: any) {
  const { text } = await generateTextWithFallback({
    prompt: `あなたは Catalyst の Executor です。アクションの実行をサポートしています。
現在の文脈: ${JSON.stringify(context)}

ユーザーからの質問: ${message}

ユーザーの「考える負担」を減らし、行動を促すための具体的な回答を行ってください。
`,
  }, models.primary as any);

  return text;
}
