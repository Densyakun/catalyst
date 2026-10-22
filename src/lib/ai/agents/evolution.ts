import { generateObjectForRole } from '@/lib/ai/call';
import { z } from 'zod';
import type { EvolutionSignals } from '@/lib/types/evolution';

/**
 * 現在のアプリ機能の棚卸し（AIが既存機能を再提案しないため）
 */
export const FEATURE_INVENTORY = `
- 診断ウィザード（分岐質問で課題を収集・構造化）
- チャット収集（会話から課題/リソース/興味を抽出）
- 自動インサイト（Google Docs等のソースから課題を自動検出）
- ソース管理（Google Driveのドキュメント取り込み・同期）
- 目星（関連情報のスコアリング）
- プロジェクト/タスク分解と自動実行
- リソース管理（時間・金・スキル・道具・つながり）
- コスト/残高・寄付プール
- 課題のクラスタリング（共通課題の可視化）
- フィードバック収集・自己進化提案（本機能）
`.trim();

const proposalSchema = z.object({
  title: z.string().describe('改善提案のタイトル（30字以内）'),
  category: z.enum(['feature', 'ux', 'bug', 'performance', 'content']).describe('改善カテゴリ'),
  rationale: z.string().describe('なぜ必要か。収集したシグナルに基づく根拠（2-3文）'),
  target_area: z.string().describe('対象の画面・機能'),
  proposed_change: z.string().describe('具体的な変更案（実装者が着手できる粒度）'),
  priority: z.number().min(0).max(1).describe('優先度（0-1）'),
  evidence: z.array(z.string()).describe('根拠となったユーザーの声・操作データの抜粋（最大3件）'),
});

export interface EvolutionAnalysis {
  summary: string;
  proposals: Array<z.infer<typeof proposalSchema>>;
}

/**
 * Evolution Agent:
 * ユーザーの不満・欲求・興味と操作データを分析し、
 * アプリ自体を改善する提案を生成する。
 */
export async function analyzeEvolution(signals: EvolutionSignals): Promise<EvolutionAnalysis> {
  const { object } = await generateObjectForRole<EvolutionAnalysis>('structuring', {
    schema: z.object({
      summary: z.string().describe('シグナル全体の要約（3文以内）'),
      proposals: z.array(proposalSchema).max(6).describe('アプリ改善の提案リスト'),
    }),
    prompt: `Katalyse Evolutionエージェント。ユーザーの不満・欲求・興味と実際の操作データから、アプリ自体の改善提案を生成せよ。

【使命】
- ユーザーが言語化していない摩擦を、操作データ（クリックされない/エラー/離脱）からも検出する
- 「不満の解消」と「欲求・興味に応える新機能」の両方を提案する
- 既存機能の再提案は禁止。既存機能の発展・改善のみ提案する

【既存機能（再提案禁止）】
${FEATURE_INVENTORY}

【収集シグナル】
- 不満・バグ: ${JSON.stringify(signals.complaints)}
- 欲求: ${JSON.stringify(signals.desires)}
- 興味: ${JSON.stringify(signals.interests)}
- 低満足/エラー: ${JSON.stringify(signals.lowSatisfaction)}
- 未解決の課題: ${JSON.stringify(signals.problems)}
- 停滞中のインサイト: ${JSON.stringify(signals.stuckInsights)}
- 最近の会話（ユーザー発言）: ${JSON.stringify(signals.messages)}
- 操作ログ集計（7日）: ${JSON.stringify(signals.activity)}
- 統計: ${JSON.stringify(signals.stats)}

【出力ルール】
- 提案は最大6件。根拠が弱いものは出さない
- priorityは「ユーザーへの影響 × 実装しやすさ」で0-1に設定
- evidenceには必ず実データ（ユーザーの声・操作の偏り）を引用する
`,
    maxOutputTokens: 3000,
  });

  return object;
}

const uiVariantSchema = z.object({
  name: z.string().describe('バリアント名（20字以内）'),
  description: z.string().describe('何を最適化したか（1文）'),
  code: z.string().describe('TSXコード。export function render(data) { return (...) } の形式'),
});

export type UIVariantDraft = z.infer<typeof uiVariantSchema>;

/**
 * UI最適化エージェント:
 * 領域（area）とシグナルから、動的UI（TSX）を生成する。
 * tsx-safe-eval で評価し、再デプロイなしでUIを差し替える。
 */
export async function generateUIVariant(params: {
  area: string;
  instruction?: string;
  signals?: EvolutionSignals;
}): Promise<UIVariantDraft> {
  const signalContext = params.signals
    ? `【シグナル】\n不満: ${JSON.stringify(params.signals.complaints)}\n欲求: ${JSON.stringify(params.signals.desires)}\n操作: ${JSON.stringify(params.signals.activity)}`
    : '';

  const { object } = await generateObjectForRole<UIVariantDraft>('structuring', {
    schema: uiVariantSchema,
    prompt: `Katalyse UI最適化エージェント。ダッシュボードの領域「${params.area}」を、ユーザーの状態に合わせて最適化するTSXを生成せよ。

【制約（厳守）】
- コードは必ず次の形式にする: export function render(data) { return ( ... ); }
- 使用できるタグ（コンポーネント）は以下のみ。それ以外のタグ・import・フックは禁止:
  <Card className?>, <Title text>, <Text>, <Badge>, <Button text href?>, <List items>, <Note>
- テンプレートリテラル（\` \`）は使用禁止。文字列連結は + を使う
- data には { problems: string[], insightCount: number, visitCount: number, topPriority: string } が渡される
- 見た目はダークテーマに馴染む簡潔な構成にする

【Props仕様】
- Card: children を内包。className 省略可
- Title: text="..."（または children）
- Button: text="...", href="..."（href省略でボタン）
- List: items={["...", "..."]}
- Note: children（補足文）

${params.instruction ? `【追加指示】\n${params.instruction}` : ''}
${signalContext}
`,
    maxOutputTokens: 2000,
  });

  return object;
}
