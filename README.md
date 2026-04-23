# Catalyst - AI 課題解決プラットフォーム

Catalystは、ユーザーの抱える不透明な課題をAIが構造化し、具体的なアクションへと変換するプラットフォームです。
「考える → 行動する → 振り返る」のサイクルを回すことで、目標達成を支援します。

## 主な機能

- **課題の構造化**: 曖昧な悩みを整理し、重要度や頻度を分析。
- **解決策の提案**: 推奨アクション、リスク、コストを提示。
- **データ永続化**: Supabase (PostgreSQL) を利用した進捗管理。
- **プレミアムデザイン**: ダークモードを基調としたモダンなUI。

## AI モデルの自動選択とフォールバック

Catalyst は、設定された環境変数（APIキー）を検知し、タスクの性質（構造化 or 解決提案）に合わせて最適な AI を自動的に選択します。

- **スコアリングによる最適化**: 各モデルのコスト・速度・推論能力を数値化し、現在利用可能なモデルの中から最も「コスパ」の良い順序で実行します。
- **自動フォールバック**: 特定のモデルが高負荷などでエラーを返した場合、即座に次に最適なモデルへ自動で切り替えて再試行します。
- **ハイブリッド構成**: 複数のプロバイダー（Google, OpenAI, Anthropic）のキーを設定することで、特定のベンダーに依存しない安定した動作が可能です。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local` ファイルを作成し、利用可能な AI のキーを少なくとも1つ設定してください。

- `GOOGLE_GENERATIVE_AI_API_KEY`: (推奨) 無料枠が広く、構造化に最適。
- `ANTHROPIC_API_KEY`: (推奨) 高度な解決策の提案に最適。
- `OPENAI_API_KEY`: 汎用的な利用に。
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon Key

### 3. データベースの構築

[Supabase](https://supabase.com/) の SQL Editor を使用して、付属の SQL スクリプトを実行してください。
（スクリプトの内容は `supabase_schema.sql` として提供されています）

## 起動方法

開発サーバーを起動します：

```bash
npm run dev
# または
bun dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

## 技術スタック

- **Framework**: Next.js (App Router)
- **Styling**: Vanilla CSS / CSS Variables / Framer Motion
- **Database**: Supabase (PostgreSQL)
- **AI**: Vercel AI SDK / OpenAI (GPT-4o-mini)
- **Icons**: Lucide React
