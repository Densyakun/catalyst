import { generateObjectForRole } from '@/lib/ai/call';
import { z } from 'zod';
import type { ChatMessage } from '@/lib/types/engine';

interface ChatAnalysis {
  reply: string;
  extracted_items: {
    problems: { description: string; category: string; urgency: 'low' | 'medium' | 'high' }[];
    resources: { name: string; type: string; description: string }[];
    info: string[];
  };
  suggested_title: string | null;
}

/**
 * チャットメッセージを分析し、返答と情報抽出を行う
 */
export async function analyzeChatMessage(
  messages: ChatMessage[],
  userMessage: string,
  existingProblems?: string[],
  existingResources?: string[],
): Promise<ChatAnalysis> {
  const history = messages
    .slice(-20) // 直近20件のみ
    .map((m) => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`)
    .join('\n');

  const existingContext = [
    existingProblems?.length ? `【既知の課題】\n${existingProblems.join('\n')}` : '',
    existingResources?.length ? `【既知のリソース】\n${existingResources.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const { object } = await generateObjectForRole<ChatAnalysis>('structuring', {
    schema: z.object({
      reply: z.string().describe('ユーザーへの返答。情報を引き出す質問を含めてよい'),
      extracted_items: z.object({
        problems: z.array(z.object({
          description: z.string(),
          category: z.string(),
          urgency: z.enum(['low', 'medium', 'high']),
        })).describe('会話から検出された新しい課題'),
        resources: z.array(z.object({
          name: z.string(),
          type: z.string().describe('time, money, skill, tool, connection のいずれか'),
          description: z.string(),
        })).describe('会話から検出されたリソース'),
        info: z.array(z.string()).describe('その他の有用な情報'),
      }),
      suggested_title: z.string().nullable().describe('会話のタイトル提案（最初の数メッセージ後に提案）'),
    }),
    prompt: `Catalyst 情報収集エージェント。ユーザーとの対話を通じて、課題・リソース・情報を自然に収集せよ。

【原則】
1. ユーザーの話を傾聴し、適切なフォローアップ質問をする
2. 課題に限定せず、リソース（持っているもの・できること）も積極的に聞き出す
3. 既知の情報と重複するものは抽出しない
4. 強制的に情報を引き出そうとせず、自然な会話を心がける
5. 返答は簡潔に（3文以内）

【会話履歴】
${history || 'なし'}

【新しいメッセージ】
ユーザー: ${userMessage}

${existingContext}
`,
  });

  return object;
}
