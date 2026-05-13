# Catalyst: 意思決定データ駆動型 自律進化インフラ

Catalystは、個人の抱える不透明な課題をAIが構造化し、具体的なアクションへと変換し、最終的に社会課題の解決まで接続する「意思決定インフラ」です。

## 1. Catalyst 憲法 (The Constitution)

各AIエージェントは、以下の3原則に基づいた「行動設計系」のプロンプトで動作します。

1. **ナビゲーション（迷わず選べるが、自分で決めたと思える）**
   - ユーザーの「考える負担」を極限まで減らしつつ、選択の自由を奪わず、本音（データの純度）を保護する。
2. **エンパワーメント（損を理解できるが、押し付けられない）**
   - 損失回避の心理に寄り添いリスクを提示するが、常に「逃げ道（代替案）」と「スモールステップ」を提供し、実行の勇気を与える。
3. **バリデーション（一人の問題が、自然に社会に繋がる）**
   - 「あなたは一人ではない」という共感（可視化）から始め、段階的に共通課題（クラスター）への協力と連帯へと導く。

## 2. 意思決定プロトコル (The 6-Step Protocol)

1. **収集 (Intake)**: 対話を通じて、課題の背景(Context)、症状(Symptoms)、制約(Constraints)を抽出。
2. **構造化 (Structuring)**: 収集データを重要度、頻度、タグ等に数値化し、意思決定データとして正規化。
3. **優先度決定 (Prioritizing)**: 複数の課題から、解決の緊急性とインパクトに基づいて着手すべき課題を特定。
4. **解決提案 (Solving)**: 推奨アクションと低コストな代替案を提示。リスクと期待利得を明示。
5. **実行支援 (Execution)**: 外部サービス連携や検索URL生成、リマインド設定等を通じて行動をトリガー。
6. **評価 (Evaluating)**: 実行結果と満足度を `outcomes` として記録し、将来の提案精度を向上（※開発中）。

## 3. 自律的インフラ機能 (Autonomous Features)

- **AI モデルの自律選択とフォールバック**: 
  - タスクの性質（構造化 vs 解決提案）に合わせて最適なモデル（Gemini, GPT, Claude等）を自動選択。
  - エラー検知時に即座に代替モデルへ切り替える「自己修復型プロバイダー冗長性」。
- **診断セッションの永続化**:
  - 診断の進捗をリアルタイムに保存し、中断してもいつでも再開可能。
- **エージェンティック UI (Self-Mutating UI)**:
  - `Clusterer Agent` が共通課題を特定した際、その課題に最適な「協力用UI（データ収集、署名、リソース共有等）」を自律的に設計・生成。

## 4. 技術スタック

- **Frontend**: Next.js (App Router), React, Framer Motion
- **Backend**: Next.js API Routes, Vercel
- **Database/Auth**: Supabase (PostgreSQL)
- **AI**: Vercel AI SDK (Google Generative AI, OpenAI, Anthropic)

## 5. セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.local` に API キーを設定してください。
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

### 3. データベースのセットアップ
1. **既存データのバックアップ (推奨)**
   > [!WARNING]
   > 本番データベースへのマイグレーション実行前に、必ず Supabase ダッシュボードより既存データのバックアップを取得してください。
2. `supabase_schema.sql`、`supabase_migration_v2.sql` を Supabase SQL Editor で順に実行します。
3. 今回のマルチ/シングルハイブリッド用の RLS を適用するため、`supabase_migration_rls.sql` を実行してください。

---

## 6. 家庭用（single）/ 公開用（multi）ハイブリッド運用

Catalyst は同一ソースコードで、個人・家庭で安全にクローズド利用する「家庭用（single）モード」と、パブリック SaaS として公開する「公開用（multi）モード」を安全に切り替えて運用できます。

### 1. 動作モードの切り替え (環境変数)
`.env.local` にて以下の変数を設定します。

> [!NOTE]
> **デフォルト（環境変数未指定時）の挙動について**
> 既存の動作を壊さないために、環境変数が何も設定されていないプログラム上のデフォルトは **`multi`（公開用）モード** です。
> 一方、安全のために新規にコピーするテンプレート用ファイル **`.env.local.example` では、最初から `single`（家庭用）モードになる設定値が初期状態として記載されています**。

| 環境変数 | 設定値の例 | デフォルト値（未指定時） | 説明 |
| :--- | :--- | :--- | :--- |
| `APP_MODE` / `NEXT_PUBLIC_APP_MODE` | `single` \| `multi` | `multi` | アプリケーションの動作モード。`single` は家庭用、`multi` は公開用。 |
| `ENABLE_SIGNUP` / `NEXT_PUBLIC_ENABLE_SIGNUP` | `true` \| `false` | `true` (APP_MODEがmultiの場合)<br>`false` (APP_MODEがsingleの場合) | 一般のサインアップ（新規アカウント作成、匿名ログイン含む）を有効にするか。`single` では `false` 推奨。 |
| `DEFAULT_ADMIN_EMAIL` | `admin@example.com` | (なし) | 家庭用モード起動時に自動作成する管理者のメールアドレス。 |
| `DEFAULT_ADMIN_PASSWORD` | `your_secure_password` | (なし) | 家庭用モード起動時に自動作成する管理者のパスワード。 |
| `PUBLISH_SHARED_SECRET` | `any_long_random_string` | (なし) | インスタンス間での「公開申請」の認証に用いる、HS256 署名用の共有キー。 |
| `SUPABASE_SERVICE_ROLE_KEY` | `your_service_role_key` | (なし) | サーバーサイドのみで読み込まれる Supabase サービスロールキー。管理処理やデータ連携に使用します。**絶対にクライアントサイドに露出させないでください。** |


### 2. 初期管理者アカウントの自動作成 (家庭用専用)
家庭用（`single`）モードでデータベースにユーザーが一人も存在しない場合、以下のコマンドで環境変数に基づいた管理者アカウントを安全に自動作成できます：

```bash
npm run db:init-admin
```

> [!NOTE]
> スクリプトは内部的に `@next/env` を使って `.env.local` から安全に設定をロードし、Supabase Admin API を使って確認済みの管理者アカウントを作成します。

### 3. Row Level Security (RLS) による強固な保護
`supabase_migration_rls.sql` を適用することで、以下の保護が強制されます：
- **作成者（`created_by`）ベースの制御**: 全ての `problems`, `actions`, `outcomes` レコードは作成者本人のみに SELECT/INSERT/UPDATE/DELETE 権限が与えられます（`auth.uid() = created_by`）。
- **公開表示（`visibility = 'published'`）**: 公開インスタンスに登録され、`visibility` が `published` に設定されたレコードに限り、未ログインのパブリックユーザーに対しても SELECT（閲覧）のみが許可されます。
- **公開申請レビューキュー (`published_records`)**: 他の家庭用インスタンスから送られてきた公開申請データは、パブリックアクセスが完全に遮断された `published_records` に登録され、管理者（Service Role）のみがレビューできます。

### 4. インスタンス間の公開申請ワークフロー
1. **送信側（家庭用）**:
   ユーザーが特定の問題をエクスポートし、公開用インスタンスへ共有することを申請すると、アプリは `PUBLISH_SHARED_SECRET` で暗号署名された 5 分間有効な短期トークンを付与し、ターゲットの `/api/publish` へデータをセキュアに POST します。
2. **受信側（公開用）**:
   POST を受信すると、同じ `PUBLISH_SHARED_SECRET` を使って署名・有効期限を検証します。その後、自動スクリーニング（禁止ワード検出プレースホルダー）を実行し、機密情報の漏洩がないかを自動チェックした上で、`published_records` キューに `pending` または `rejected` の状態で保存します。

