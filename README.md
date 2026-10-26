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
   - `GITHUB_CODESPACES_TOKEN`（Codespaces の作成権限）
   - `CLOUD_GITHUB_REPO`（`owner/repo`）
   - `CLOUD_CRON_SECRET` / `CLOUD_RUNNER_TOKEN`
   - `OPENCODE_MODEL`（例: `opencode-go/deepseek-v4.1-flash`）
   - 必要に応じて `ADMIN_EMAILS` / `ADMIN_USER_IDS`
2. GitHub の Repository Settings → Codespaces → Secrets に以下を登録する
   - `CATALYST_APP_URL` / `CATALYST_CLOUD_RUNNER_TOKEN`
   - `OPENCODE_GO_API_KEY` / `OPENCODE_MODEL`
3. スケジューラ Worker をデプロイする
   ```bash
   cd workers/cloud-scheduler
   npx wrangler secret put CLOUD_APP_URL
   npx wrangler secret put CLOUD_CRON_SECRET
   cd ../..
   npm run deploy:scheduler
   ```

10分おきに `/api/cloud/cron` が実行され、アプリの GitHub Issue（`CLOUD_AUTO_ISSUE_LABEL` で絞り込み可能）がクラウド作業環境で解決されます。ユーザーは「クラウド」タブから任意の作業を依頼できます。実行時間とトークン使用量からクレジットが計算されます。

### AI脅威対策
- Issue 本文・コメント・リポジトリ内の文章は「信頼できないデータ」として扱い、プロンプト内で明確に区切ります。
- HTMLコメント・不可視文字・指示の上書き・秘密情報の読み出し・外部送信・依存追加・CI/エージェント設定変更などを検出したジョブは `blocked` にして自動実行を停止します。管理者は「クラウド」タブで内容を確認して承認・却下できます。
- 一般ユーザーの依頼は **OS ユーザーを分離したサンドボックス** で実行し、アプリ本体リポジトリ・GitHub トークン・ランナートークン・秘密情報にアクセスできないようにします。
- エージェントにはシェル実行・Web取得・外部ディレクトリ参照・サブエージェント・スキル読込を許可しません。ファイルの読み書きと検索のみです。
- 変更前に保護対象ファイル（CI、依存関係、エージェント設定、クラウド実装、環境変数など）と秘密情報を走査し、問題があれば push しません。
- `CLOUD_AUTO_PUSH` は既定で `true` です。安全検査（秘密情報・保護対象ファイル・差分サイズ・型チェック）を通過した変更だけをブランチとして push し、PR を作成します（マージは人間が行います）。`false` にすると push/PR せず、管理者の確認待ちで停止します。
- 実行中は「受付 / リポジトリ準備 / 作業環境の準備 / AIが実装中 / 変更を検証中 / 公開準備中」の進捗がジョブに記録されます。
- AI からの応答が `CLOUD_JOB_STALL_MINUTES`（既定 8 分）途絶えた場合は、時間切れを待たずに理由付きで終了します。
- ランナーが途中で落ちても、それまでのトークン使用量と失敗理由がジョブに残ります（`supabase_migration_v17.sql` を適用してください）。
- ランナーは Codespace 起動時に常駐し、異常終了した場合だけ自動で再起動します（`scripts/cloud-runner-supervisor.sh`）。
- 保護対象ファイル（CI、依存関係、エージェント設定、クラウド実装、環境変数など）の変更は常に停止します。必要な場合は人間が手動で対応してください。

### Codespace の再利用と停止
- 1つの Codespace を複数ジョブで使い回します。10分おきのチェックごとに新しい環境は作りません。
- 起動中の環境がある場合は、キューのジョブを同じ環境で順番に処理します。
- ジョブがなくなって `CLOUD_RUNNER_IDLE_MINUTES`（既定15分）経過すると停止します。10分間隔のチェックをまたいで再利用できるよう、少し長めの猶予を持たせています。
- 停止を早めたい場合は `CLOUD_RUNNER_IDLE_MINUTES` を短くしてください。ただしチェック間隔との関係で新しい Codespace が増える場合があります。
- 安全確認待ちの環境を管理者確認用に残す場合は `CLOUD_KEEP_REVIEW_CODESPACE=true` にします（既定 `false`。既定では残さず、キューが空になった後のアイドル時間で停止します）。
- アプリ課題の実行前には、前のジョブの変更を破棄して既定ブランチへ戻します（ジョブ間の混入防止）。
