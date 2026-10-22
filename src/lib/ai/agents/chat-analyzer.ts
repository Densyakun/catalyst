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
  insight_update: {
    title: string;
    content: string;
  } | null;
  reinvestigate_keywords: string[];
  source_action: {
    type: 'import_keyword' | 'import_all' | 'process';
    keywords: string[];
    prompt: string | null;
  } | null;
}

interface EditingInsightContext {
  id: string;
  title: string;
  content: string;
}

/**
 * チャットメッセージを分析し、返答と情報抽出を行う
 */
export async function analyzeChatMessage(
  messages: ChatMessage[],
  userMessage: string,
  existingProblems?: string[],
  existingResources?: string[],
  editingInsight?: EditingInsightContext | null,
  sourceNames?: string[],
): Promise<ChatAnalysis> {
  const history = messages
    .slice(-20)
    .map((m) => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`)
    .join('\n');

  const existingContext = [
    existingProblems?.length ? `【既知の課題】\n${existingProblems.join('\n')}` : '',
    existingResources?.length ? `【既知のリソース】\n${existingResources.join('\n')}` : '',
    sourceNames?.length ? `【登録済みソース（ドキュメント）】\n${sourceNames.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const insightContext = editingInsight
    ? `\n【編集中のインサイト】\nタイトル: ${editingInsight.title}\n内容: ${editingInsight.content}\n\nユーザーがこのインサイトを修正したい場合、insight_updateに修正後のタイトルと内容を出力せよ。`
    : '';

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
      insight_update: z.object({
        title: z.string(),
        content: z.string(),
      }).nullable().describe('編集中のインサイトがある場合、ユーザーの指示に基づいた修正後の内容。編集中でない場合はnull'),
      reinvestigate_keywords: z.array(z.string()).describe('ユーザーがドキュメントの再調査を求めている場合、検索すべきキーワード。求めていない場合は空配列'),
      source_action: z.object({
        type: z.enum(['import_keyword', 'import_all', 'process']).describe('import_keyword: キーワードでDriveからドキュメントをインポート, import_all: 全ドキュメントを読み込み, process: 登録済みソースに対してプロンプトで処理'),
        keywords: z.array(z.string()).describe('import_keywordの場合の検索キーワード。processの場合は対象ソース名（空なら全ソース）'),
        prompt: z.string().nullable().describe('processの場合、ソースに対する処理指示（例: 課題をまとめて）。import系の場合はnull'),
      }).nullable().describe('ソース（ドキュメント）操作。ユーザーがドキュメントの追加・読み込み・処理を指示した場合に出力。指示がない場合はnull'),
    }),
    prompt: `Katalyse 情報収集エージェント。ユーザーとの対話を通じて、課題・リソース・情報を自然に収集せよ。

【原則】
1. ユーザーの話を傾聴し、適切なフォローアップ質問をする
2. 課題に限定せず、リソース（持っているもの・できること）も積極的に聞き出す
3. 既知の情報と重複するものは抽出しない
4. 強制的に情報を引き出そうとせず、自然な会話を心がける
5. 返答は簡潔に（3文以内）
6. ユーザーが「もっと調べて」「ドキュメントを確認して」「関連情報を探して」等と言った場合、reinvestigate_keywordsに検索キーワードを出力する
7. 編集中のインサイトがある場合、ユーザーの修正指示に応じてinsight_updateを出力する
8. ソース操作の判定:
   - 「○○に関するドキュメントを取り込んで」「○○のドキュメントを追加して」→ source_action: {type: 'import_keyword', keywords: ['○○'], prompt: null}
   - 「全てのドキュメントを読み込んで」「ドキュメントを全件取り込んで」→ source_action: {type: 'import_all', keywords: [], prompt: null}
   - 「ドキュメントから課題をまとめて」「ソースの内容を分析して」→ source_action: {type: 'process', keywords: [], prompt: '課題をまとめて'}
   - 「○○のドキュメントから要点を抽出して」→ source_action: {type: 'process', keywords: ['○○'], prompt: '要点を抽出して'}
   - ソース操作でない場合 → source_action: null

【会話履歴】
${history || 'なし'}

【新しいメッセージ】
ユーザー: ${userMessage}

${existingContext}${insightContext}
`,
  });

  return object;
}
