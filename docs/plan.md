課題処理の流れを共通化したMVP
※初期案のため現在は変更済み

アプリケーション開発要件（要件定義）

この文書は、提示された「課題を起点に、人とAIと行動を繋ぐ基盤の構築」という構想に基づき、最小実行可能製品（MVP）を開発するための具体的な要件を定義します。1. 共通プロトコル（ビジネスロジックの中核）

要件： 以下の6ステップを処理するバックエンドロジック（API）を構築すること。
ステップ | 機能概要 | データ項目（課題スキーマと連携）
① 収集 (Intake) | ユーザーからの課題情報（質問、自由記述）を収集し、初期のProblemデータを作成する。 | Problem.context, Problem.symptoms, Problem.constraintsなど
② 構造化 (Structuring) | 収集データをタグ化、数値化し、スキーマに則ったデータ形式に変換する。 | Problem.severity, Problem.frequency, 内部tags
③ 優先度決定 (Prioritizing) | 現在の未解決課題の中から、優先度の高いもの（1つ）を選定する。 | Problem.priority (計算結果)
④ 解決提案 (Solving) | 優先度の高い課題に対し、具体的な解決策（Action）を提案する。代替案も含む。 | Actionオブジェクト一式
⑤ 実行 (Execution) | 提案されたActionの実行を支援する（リンク提示、通知設定など）。 | Action.type, Action.linkなど
⑥ フィードバック (Evaluating) | 実行結果、満足度、不満を収集し、Outcomeとして記録する。 | Outcomeオブジェクト一式
2. データモデル要件（スキーマ定義）

要件： 以下の3つの主要なテーブル（またはコレクション）を定義し、永続化すること。
テーブル名 | フィールド群 | 型・制約 | 補足
problems | context, symptoms, constraints, goal, severity, frequency, priority, status (未解決/解決済) | JSON, String, Integer | 課題の定義
actions | problem_id (外部キー), type, cost (時間/金), expected_gain, risk, link, is_recommended | JSON, String, Decimal | 推奨される行動
outcomes | action_id (外部キー), did_execute, delta (改善量), satisfaction, complaint, feedback_date | Boolean, Decimal, Integer | 行動の結果と評価
データ設計の原則： コアなフィールドは共通とし、ドメイン固有の情報（例：ゲーム名、家計の費目）は柔軟なtagsフィールド（JSONまたは配列）として保持する。3. エージェント機能要件（役割分担）

要件： 共通プロトコルの各ステップに対応するマイクロサービス的な役割を果たすバックエンドモジュール（または関数）を開発すること。
エージェント名 | 担当プロトコルステップ | 主な入出力
Intake Agent | ① 収集 | 入力: ユーザー質問 / 出力: 初期Problem
Structuring Agent | ② 構造化 | 入力: 初期Problem / 出力: 構造化Problemとtags
Prioritizer | ③ 優先度決定 | 入力: 全Problems / 出力: 最優先Problem ID
Solver | ④ 解決提案 | 入力: 優先Problem / 出力: 1つ以上のActions
Executor | ⑤ 実行支援 | 入力: Action / 出力: リンク、通知設定APIコール
Evaluator | ⑥ フィードバック | 入力: ユーザーフィードバック / 出力: Outcomeデータ
4. ユーザーインターフェース（Webアプリ）要件

要件： ユーザーが「考える→やる→振り返る」を完結できる以下の5つの画面（SPA/Webアプリ）を実装すること。
画面名 | 主な機能（対応エージェント） | 詳細要件
1. ダッシュボード | 優先度提示 (Prioritizer) | - 現在の最重要課題（1つ）を大きく表示。- 推奨アクション（1つ）を表示し、実行画面へ誘導。
2. 診断画面 (Intake) | 課題収集 (Intake Agent) | - 分岐する質問フロー（ウィザード形式）を実装。- 自由記述フィールドを設ける。- データ送信でProblemの初期化をトリガー。
3. 結果画面 (Solver) | 提案表示 (Solver) | - 提案されたActionの内容、リスク、期待効果を表示。- 提案の根拠（理由）と代替案を表示。
4. 実行画面 (Executor) | 行動支援 (Executor) | - Actionを実行するためのワンタップボタン（外部リンク遷移、通知設定など）。
5. フィードバック画面 (Evaluator) | 結果記録 (Evaluator) | - 実行の有無、主観満足度、不満点を入力するフォーム。- Outcomeデータを永続化するAPIをコール。
5. 技術・実装要件（MVPフェーズ）
要件カテゴリ | 詳細 | 補足
フレームワーク | Next.js (フロントエンド、バックエンドAPI) | 迅速な開発とサーバーレスデプロイを考慮。
データベース | Supabase (PostgreSQL) | リアルタイムDB機能と認証機能の活用を検討。
API連携 | フェーズ1: リンク提示 | 外部ストア、記事などへの静的リンク提示に限定。
AI/ML | 初期はルールベース/シンプルなLLMプロンプト | 構造化、提案のロジックは段階的に高度化。
優先度計算 | priority = impact × feasibilityのシンプルなロジックを実装。 | ユーザーからの入力や構造化データから算出。


実装報告（自己進化エンジン v1）

・シグナル収集: 不満/欲求/興味の明示フィードバックと、訪問/クリック/離脱/エラーの自動収集（user_activity）を追加
・自己進化エージェント: 収集シグナルをAIが分析し、アプリ改善提案を生成（evolution_proposals）
・管理UI: 自己進化パネルで分析実行・承認/却下/実装済・実装バックログ出力
・動的UI最適化: tsx-safe-eval でAI生成TSXを安全評価し、再デプロイなしでダッシュボードUIを差し替え（ui_variants）
・DB: supabase_migration_v6.sql を追加

検証すべき点

・supabase_migration_v6.sql をSupabase SQL Editorで実行する必要があります
・未対応: CI/GitHub自動PR、本番デプロイ先の確定


実装報告（エージェント連携 v2）

・エージェントAPI: GET /api/agent/context（提案＋関連Catalystデータ）と POST /api/agent/report（状態更新＋ユーザー通知）を追加（Bearerトークン認証）
・双方向連携: エージェントが提案をGitHub Issue化し、PR結果をCatalystへ報告できるようにした
・ユーザー通知: user_notifications テーブル＋通知ベルを追加し、改善結果をユーザーへ報告
・提案にGitHub情報（Issue番号/URL、PR URL、外部状態）を保持し、自己進化パネルからIssueを開ける
・DB: supabase_migration_v7.sql を追加

検証すべき点

・supabase_migration_v7.sql をSupabase SQL Editorで実行する必要があります
・環境変数 AGENT_API_TOKEN と SUPABASE_SERVICE_ROLE_KEY の設定が必要です（後者はサーバー専用）


実装報告（エージェント連携 v3 / MCP・自己更新）

・MCPサーバー: scripts/catalyst-mcp.mjs（stdio）を追加。RESTの /api/agent/* をMCPツール（list_proposals / get_proposal_context / report_result）として公開。npm run mcp で起動
・Issueブリッジ: scripts/agent-issue-bridge.mjs と .github/workflows/catalyst-issue-bridge.yml を追加。承認済み提案をGITHUB_TOKENでIssue化し、CatalystへIssue番号を報告

検証すべき点

・GitHub ActionsのSecretsに CATALYST_BASE_URL と AGENT_API_TOKEN を設定
・opencode等のMCPクライアントに catalyst サーバーを登録（stdio: node scripts/catalyst-mcp.mjs）


実装報告（ユーザートークン認証 v4）

・ユーザーAPIトークン: user_api_tokens テーブルを追加。アプリ内「APIトークン」パネルで発行・失効（平文は発行時のみ表示、DBはハッシュ保存）
・エージェント/MCPは各ユーザーが発行したトークン(cat_...)で認証し、そのユーザーのデータのみ読み書き（スコープ制御）
・管理者トークン AGENT_API_TOKEN は任意化。全ユーザー横断時のみ ?user_id= を指定
・MCPサーバー/ブリッジの環境変数を CATALYST_TOKEN に変更
・DB: supabase_migration_v8.sql を追加

検証すべき点

・supabase_migration_v8.sql を実行する必要があります
・エージェント側に、アプリで発行した CATALYST_TOKEN を設定します


実装報告（実装ワークフロー雛形 v5）

・catalyst-implement.yml: ラベル catalyst:implement のIssueを opencode run --auto で実装し、GITHUB_TOKEN でPRを作成
・catalyst-report-merge.yml: PRマージ時に提案を implemented へ更新し、ユーザー通知
・catalyst-issue-bridge.yml: 承認済み提案をIssue自動作成
・補助スクリプト: scripts/catalyst-ci-report.mjs / catalyst-ci-pr.mjs / agent-issue-bridge.mjs
・GITHUB_TOKEN は GitHub Actions の標準トークンを使用（アプリの環境変数には置かない）

検証すべき点

・Actions Secrets: CATALYST_BASE_URL / CATALYST_TOKEN / OPENCODE_MODEL（必要に応じ OPENCODE_CONFIG_CONTENT やプロバイダキー）
・リポジトリ設定で「Allow GitHub Actions to create and approve pull requests」を有効化


実装報告（MCP公開・分離 v6）

・MCPをサーバー公開: /api/mcp（Streamable HTTP）。ユーザートークン(cat_...)で認証し、誰でも自分のAIエージェントから利用可能
・アプリ内に「MCPで使う」ガイドを追加（接続JSONと開始プロンプトをコピー可能）
・AGENT_API_TOKEN（管理者トークン）を廃止。認証はユーザートークンのみ
・イシュー起点のコード開発CI（GitHub Actions一式）と補助スクリプトを撤去し、自動化はMCPに接続するローカル側へ分離
・stdio MCPサーバー（scripts/catalyst-mcp.mjs）はセルフホスト用に維持

検証すべき点

・MCPは /api/mcp に Authorization: Bearer cat_... で接続
・Supabaseの service_role キーはサーバーにのみ設定


実装報告（Cloudflare対応準備 v7）

・Google連携を googleapis から fetch 直叩きへ変更（OAuth同意/トークン交換・リフレッシュ、Docs取得・書き戻し、Drive一覧）。node:https依存を排除し、googleapis依存を削除
・動的UI（tsx-safe-eval）をクライアント実行へ移行。ts-morph のメモリFSでブラウザ内コンパイル → evalSyntaxList で評価 → React描画。サーバーでのコンパイルを廃止
・/api/ui-variants は code のみ保存、GET /api/ui-variants/active を追加（コード＋描画データを返す）
・fs書き出し（backlog）を削除し、Markdownを返す方式に変更

検証すべき点

・ブラウザでの ts-morph/tsx-safe-eval バンドルサイズと動作を要確認
・Cloudflare向けの wrangler.jsonc / open-next.config.ts / npm scripts を追加予定


実装報告（Cloudflare設定投入 v8）

・@opennextjs/cloudflare 1.20.11 / wrangler 4.150.0 を導入。Next は 16.2.4 → 16.4.0 に更新（OpenNextが next>=16.3.8 を要求）
・wrangler.jsonc / open-next.config.ts を追加、package.json に preview / deploy / cf-typegen スクリプトを追加
・GitHub Actions（.github/workflows/deploy-cloudflare.yml）で main への push 時に OpenNext ビルド → Workers デプロイ → ランタイム秘密情報を `wrangler secret` で同期
・秘密情報は GitHub Secrets（CLOUDFLARE_API_TOKEN 等）と Cloudflare の Worker secrets に保存し、リポジトリには置かない

検証すべき点

・GitHub Secrets に CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID ほかを登録
・OpenNext の Turbopack 互換と初回ビルドを CI で確認


実装報告（Cloudflare Git接続へ一本化 v9）

・デプロイ方式を Cloudflare の Git リポジトリ接続（Workers Builds）に変更し、GitHub Actions のデプロイワークフローを削除
・wrangler.jsonc / open-next.config.ts / package.json scripts は維持（Workers Builds の Build/Deploy で利用）
・ビルド時・ランタイムの変数と秘密情報は Cloudflare ダッシュボードで管理（リポジトリには置かない）

検証すべき点

・Workers Builds の Build command: npx opennextjs-cloudflare build / Deploy command: npx wrangler deploy
・OpenNext は Turbopack 出力に対応（Next 16.3+ の wasm ヘルパーへのパッチあり）

