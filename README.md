# Katalyse: 意思決定データ駆動型 自律進化インフラ

Katalyseは、個人の抱える不透明な課題をAIが構造化し、具体的なアクションへと変換し、最終的に社会課題の解決まで接続する「意思決定インフラ」です。

## 1. Katalyse 憲法 (The Constitution)

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

- **AI モデルの役割別割り当て**:
  - タスクの性質（構造化 vs 解決提案）に合わせてモデルを割り当て。
  - 単一の `OPENAI_API_KEY` と `OPENAI_BASE_URL` を使い、モデルは `OPENAI_MODEL_STRUCTURING` / `OPENAI_MODEL_SOLVING` で指定。
- **アイデアのオフライン保存・時間指定・後処理**:
  - LLM が使えない時でもアイデアを保存でき、`idea_inbox` にキューイング。
  - 処理予定日時を指定でき、アプリを開いた時・一定間隔で自動再処理。
- **目的別資金とコスト最適化**:
  - `fund_purposes` で目的ごとに寄付を管理し、`fund_transactions` に台帳を記録。
  - 目的資金 → ユーザー残高 → 寄付プールの順で資金源を推奨。
- **共有アイデアと協力**:
  - 自分のインサイトを共有アイデアとして公開。
  - 他ユーザーが資金・時間・スキルで支援でき、所有者へ通知。
- **資金・API/MCPリソースの安全な共有**:
  - 共有コードで特定の相手だけに公開。
  - 金額上限・利用回数・有効期限・権限を設定し、取消時は未使用資金を返金。
  - 利用履歴を監査ログへ記録し、エージェント/MCPからも認可APIを利用可能。
- **LLM ヘルスの自動検知**:
  - 全 LLM 呼び出しの成功率・JSON検証失敗率・レイテンシを `llm_calls` に記録。
  - 役割（構造化 / 解決提案）ごとに異常を検知し、モデル変更の改善提案を自己進化エンジンへ自動登録。
- **診断セッションの永続化**:
  - 診断の進捗をリアルタイムに保存し、中断してもいつでも再開可能。
- **エージェンティック UI (Self-Mutating UI)**:
  - `Clusterer Agent` が共通課題を特定した際、その課題に最適な「協力用UI（データ収集、署名、リソース共有等）」を自律的に設計・生成。

## 4. 技術スタック

- **Frontend**: Next.js (App Router), React, Framer Motion
- **Backend**: Next.js API Routes, Vercel
- **Database/Auth**: Supabase (PostgreSQL)
- **AI**: Vercel AI SDK + OpenAI（OpenAI 互換エンドポイント対応）

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
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL_STRUCTURING=gpt-4o-mini  # 任意（未指定なら OPENAI_MODEL）
OPENAI_MODEL_SOLVING=gpt-4o-mini      # 任意（未指定なら OPENAI_MODEL）
```

### 3. データベースのセットアップ
`supabase_schema.sql` と `supabase_migration_v2.sql` 〜 `supabase_migration_v17.sql` を Supabase SQL Editor で順に実行してください。

## 6. クラウド作業（自動改善 + ユーザー依頼）

Cloudflare Workers 上では10分おきの Cron を直接持てないため、`workers/cloud-scheduler` を別 Worker としてデプロイします。

1. アプリ側の環境変数（Cloudflare の Variables and Secrets）を設定する
   - `GITHUB_CODESPACES_TOKEN`（リポジトリ操作用。`repo` スコープ。Codespaces も使う場合は `codespace` も付与）
   - `CLOUD_GITHUB_REPO`（`owner/repo`）
   - `CLOUD_CRON_SECRET` / `CLOUD_RUNNER_TOKEN`
   - `OPENCODE_MODEL`（例: `opencode-go/deepseek-v4.1-flash`）
   - 必要に応じて `ADMIN_EMAILS` / `ADMIN_USER_IDS`
2. GitHub の Repository Settings → Actions → General で
   「Allow GitHub Actions to create and approve pull requests」を有効にする
   （クラウドランナーは bootstrap で受け取った PAT で PR を作るため必須ではありませんが、
   有効にしておくと GitHub Actions のトークンだけでも PR を作れます）
3. Codespace で実行する場合のみ、Repository Settings → Codespaces → Secrets に以下を登録する
   - `CATALYST_APP_URL` / `CATALYST_CLOUD_RUNNER_TOKEN`
   - `OPENCODE_GO_API_KEY` / `OPENCODE_MODEL`
4. スケジューラ Worker をデプロイする
   ```bash
   cd workers/cloud-scheduler
   npx wrangler secret put CLOUD_APP_URL
   npx wrangler secret put CLOUD_CRON_SECRET
   cd ../..
   npm run deploy:scheduler
   ```

10分おきに `/api/cloud/cron` が実行され、アプリの GitHub Issue（`CLOUD_AUTO_ISSUE_LABEL` で絞り込み可能）がクラウド作業環境で解決されます。ユーザーは「クラウド」タブから任意の作業を依頼できます。実行時間とトークン使用量からクレジットが計算されます。

### 実行基盤（GitHub Actions / Codespaces）
- 既定（`CLOUD_EXECUTION_BACKEND=actions`）は **GitHub Actions** で実行します。パブリックリポジトリは実行時間が無料のため、Codespaces の予算上限に達していても作業を継続できます。
- アプリが `.github/workflows/cloud-job.yml` を `repository_dispatch` で起動し、リポジトリ変数 `KATALYST_APP_URL` を自動登録します。ランナーの認証情報と LLM 設定は、実行開始後にワークフロー実行IDを照合して `/api/cloud/agent/bootstrap` から渡します（リポジトリに保存しません）。
- `CLOUD_EXECUTION_BACKEND=auto` にすると Actions を優先し、開始できなかった場合だけ Codespace にフォールバックします。`codespaces` で従来動作になります。
- Codespace 作成が予算超過（HTTP 402）で拒否された場合は、理由をジョブに記録して無駄な起動を止めます。

### Cloudflare の PR ビルド（プレビュー）
PR ごとに Workers Builds が走る場合、既定の Preview コマンド `npx wrangler preview` は
プレビュー専用の変数・シークレット・リソースを要求します。未設定だと PR のチェックだけが失敗します。

`Workers & Pages` → `catalyst` → `Settings` → `Build` で次を設定してください。

| 項目 | 値 |
| --- | --- |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command（本番） | `npx wrangler deploy` |
| Preview command（PR） | `npx wrangler preview` または `npx wrangler versions upload` |

- `npx wrangler versions upload` を使う場合は `wrangler.jsonc` に `"preview_urls": true` を追加します。
  ただし Version URL は**本番の Supabase などのリソースを共有**するため、本番データを触ってよい場合だけにしてください。
- 本番データを分離したい場合は `wrangler preview` を使い、`Preview settings` にテスト用の
  Supabase とシークレットを登録します。
- プレビュー環境を用意しない場合は、`Settings` → `Build` で **Preview builds を無効化**してください。
  その場合でも、このリポジトリの `.github/workflows/ci.yml` が PR ごとに型チェックと
  `npm run build:cf` を実行します（public リポジトリは無料）。

### AI脅威対策
- Issue 本文・コメント・リポジトリ内の文章は「信頼できないデータ」として扱い、プロンプト内で明確に区切ります。
- HTMLコメント・不可視文字・指示の上書き・秘密情報の読み出し・外部送信・依存追加・CI/エージェント設定変更などを検出したジョブは `blocked` にして自動実行を停止します。管理者は「クラウド」タブで内容を確認して承認・却下できます。
- 一般ユーザーの依頼は **OS ユーザーを分離したサンドボックス** で実行し、アプリ本体リポジトリ・GitHub トークン・ランナートークン・秘密情報にアクセスできないようにします。
- エージェントにはシェル実行・Web取得・外部ディレクトリ参照・サブエージェント・スキル読込を許可しません。ファイルの読み書きと検索のみです。
- 変更前に保護対象ファイル（CI、依存関係、エージェント設定、クラウド実装、環境変数など）と秘密情報を走査します。
- `CLOUD_AUTO_PUSH` は既定で `true` です。安全検査（秘密情報・保護対象ファイル・差分サイズ・型チェック）を通過した変更だけをブランチとして push し、PR を作成します（マージは人間が行います）。`false` にすると push/PR せず、管理者の確認待ちで停止します。
- **実行設定に影響する**保護対象ファイル（`.github/`、`.devcontainer/`、`.opencode/`、`opencode.json`、`wrangler.*`、依存関係・lockfile、Dockerfile、`.env`、Supabase マイグレーションなど）は push しません。ブランチ上の設定で CI が動く事故を防ぐためです。
- 上記以外の保護対象ファイル（`src/lib/cloud/`、`src/app/api/cloud/`、`src/components/CloudPanel.tsx` など）を含む変更は、管理者が GitHub で確認できるよう **下書きPR（draft）** として公開します。自動マージはされません。
- 実行中は「受付 / リポジトリ準備 / 作業環境の準備 / AIが実装中 / 変更を検証中 / 公開準備中」の進捗がジョブに記録されます。
- AI からの応答が `CLOUD_JOB_STALL_MINUTES`（既定 8 分）途絶えた場合は、時間切れを待たずに理由付きで終了します。
- ランナーが途中で落ちても、それまでのトークン使用量と失敗理由がジョブに残ります（`supabase_migration_v17.sql` を適用してください）。
- ランナーは Codespace 起動時に常駐し、異常終了した場合だけ自動で再起動します（`scripts/cloud-runner-supervisor.sh`）。

### Codespace の再利用と停止
- 1つの Codespace を複数ジョブで使い回します。10分おきのチェックごとに新しい環境は作りません。
- 起動中の環境がある場合は、キューのジョブを同じ環境で順番に処理します。
- ジョブがなくなって `CLOUD_RUNNER_IDLE_MINUTES`（既定15分）経過すると停止します。10分間隔のチェックをまたいで再利用できるよう、少し長めの猶予を持たせています。
- 停止を早めたい場合は `CLOUD_RUNNER_IDLE_MINUTES` を短くしてください。ただしチェック間隔との関係で新しい Codespace が増える場合があります。
- 安全確認待ちの環境を管理者確認用に残す場合は `CLOUD_KEEP_REVIEW_CODESPACE=true` にします（既定 `false`。既定では残さず、キューが空になった後のアイドル時間で停止します）。
- アプリ課題の実行前には、前のジョブの変更を破棄して既定ブランチへ戻します（ジョブ間の混入防止）。
- 同じ Issue の自動実行は直近7日で `CLOUD_AUTO_MAX_ATTEMPTS`（既定2回）までです。上限に達した Issue は `blocked` になり、Codespace を起動しません。内容を確認して再実行する場合は、該当ジョブを承認するか `cloud_jobs` の該当行を整理してください。
- `CLOUD_AUTO_SKIP_LABELS`（既定 `wontfix,duplicate,question,discussion,invalid,stale`）に含まれるラベルの Issue は自動実装の対象外です。
- Codespace 作成後 `CLOUD_RUNNER_START_TIMEOUT_MINUTES`（既定15分）以内にランナーが接続しない場合は起動失敗として停止します。直近1時間の起動失敗が `CLOUD_MAX_START_FAILURES_PER_HOUR`（既定2回）に達すると、原因を修正するまで新規 Codespace の作成を止めます。
- アプリ課題が変更なし・型エラーなどで終了した場合は、管理者が保持を指定していない限り Codespace を即停止します（idle のまま残して次の課題で起動し続けるのを防ぐため）。

## 7. 決済（Stripe）とクレジット購入

ユーザーがクレジットを購入できるようにします。決済は Stripe Checkout にリダイレクトし、
Webhook で付与します。クレジットは残高（`user_balance`）に入り、任意で目的（`fund_purposes`）に紐付けられます。

### セットアップ
1. `supabase_migration_v18.sql` を適用する（`payments` / `stripe_events` / 付与・返金関数）。
2. Cloudflare の Variables and Secrets に登録する
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_CREDIT_PACKS`（例: `[{"id":"starter","label":"スターター","amount_jpy":500,"credits":400}]`）
   - 必要に応じて `BILLING_CREDITS_PER_YEN`（既定 `1`）
3. Stripe の Webhook に `https://<本番URL>/api/billing/stripe/webhook` を登録する
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
   - `charge.refunded`
4. ローカル確認は Stripe CLI で転送する
   ```bash
   stripe listen --forward-to localhost:3000/api/billing/stripe/webhook
   ```

### ユーザーと目的の紐付け
- 購入は必ず `payments.user_id` に紐付きます。
- 目的は **任意** です（すべてのユーザーが目的を持つわけではないため）。指定できるのは本人が所有する有効な目的だけです。
- 目的を指定した購入も、クレジットは残高に入ります。目的は購入履歴の分類（`payments.purpose_id`）として残ります。
  目的ごとの残高を分離したい場合は、目的資金からクラウド作業を支払う拡張を別途行います。

### レート設定（プレビュー・運営コストを含める）
- 本番とプレビューで DB を分けると、プレビュー側のコストは DB に記録できません。
  そのため、**販売レートに運営コストを含める**必要があります。次の2つで調整できます。
  - `BILLING_CREDITS_PER_YEN` を `1` 未満にする（例: `0.8`。1円で0.8クレジット）
  - `STRIPE_CREDIT_PACKS` の `credits` を金額より少なくする（例: ¥500 → 400クレジット）
- 既存ユーザーのクラウド利用には `CLOUD_CREDIT_OVERHEAD_PERCENT`（既定 `0`）を設定すると、
  実行時間・トークンから計算したクレジットに上乗せできます（例: `30` で +30%）。
- 実際の請求額（Portkey / opencode Zen）とクレジットの差は月次で確認し、レートを見直してください。

### セキュリティ
- Webhook は `Stripe-Signature` を HMAC-SHA256 で検証し、5分を超える古い署名は拒否します。
- 付与・返金は SQL 関数内で `FOR UPDATE` し、同じ決済を二重に反映しません。
- `payments` は本人のみ SELECT 可能（RLS）。付与・返金はサービスロールのみ実行できます。

