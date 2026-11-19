# Supabase（マイグレーション / テスト）

## 構成

```
supabase/
  config.toml                 # ローカル Supabase の設定
  migrations/                 # 時系列順に適用される SQL
    20261113000000_baseline.sql
    20261113000002_v2.sql
    ...
  seed.sql                    # ローカルのみの固定データ
```

既存の `supabase_schema.sql` / `supabase_migration_v*.sql` はルートに残しています。
**今後のスキーマ変更は `supabase/migrations/` に追加してください。**

## ローカル開発

```bash
npm install
npm run db:start          # ローカル Supabase を起動
npm run db:reset          # migrations + seed を適用
npm test                  # ユニットテスト（DB 不要）
npm run test:integration  # ローカル Supabase に対する RLS / DB テスト
npm run db:stop
```

`npm run db:start` が出力する URL / anon key / service_role key はローカル専用です。
本番の値は使いません。`npm run test:integration` は
`supabase status -o json` から自動でキーを取得します。

### Windows（Podman + WSL）

Windows では Docker Desktop ではなく **Ubuntu 26.04 WSL 内の Podman** を使います。
`scripts/db-command.mjs` が WSL のセットアップを検出し、自動的に切り替えます。

```powershell
# 1. Ubuntu 26.04 を用意
wsl --install -d Ubuntu-26.04

# 2. Podman と依存パッケージ
wsl -d Ubuntu-26.04 -u root -- apt-get update
wsl -d Ubuntu-26.04 -u root -- apt-get install -y podman podman-docker iptables nftables curl

# 3. ネットワーク設定（netavark の nftables エラー回避）
wsl -d Ubuntu-26.04 -u root -- cp /mnt/c/Users/<user>/Documents/Catalyst/scripts/wsl-containers.conf /etc/containers/containers.conf

# 4. Supabase CLI（Linux バイナリ）
wsl -d Ubuntu-26.04 -u root -- bash -lc "curl -fL https://github.com/supabase/cli/releases/download/v3.1.0/supabase_linux_amd64.tar.gz -o /tmp/supabase.tgz && tar -xzf /tmp/supabase.tgz -C /usr/local/bin supabase"

# 5. 起動
npm run db:start
```

- 別のディストリビューションを使う場合は `SUPABASE_WSL_DISTRO` を設定する
- WSL の Supabase が未セットアップの場合、Windows 側の Docker / Podman にフォールバックする
- `npm run db:start:full` は Studio なども含めて起動する（追加イメージを取得する）
- Windows 側の Podman machine は不要。使わない場合は `podman machine rm -f` で削除してよい

## CI

`.github/workflows/ci.yml` が PR ごとに以下を実行します。

1. 型チェック / lint / ユニットテスト
2. ローカル Supabase の起動（GitHub-hosted runner の Docker）
3. 統合テスト（ローカルのみ。秘密情報は使わない）
4. `npm run build:cf`

ローカル Supabase のキーは `scripts/supabase-test-env.mjs` が
`supabase status -o json` から取得します。本番の Secrets は PR の CI には一切渡しません。

## 既存の本番 DB に初めて導入する場合（一度だけ）

既存 DB にはマイグレーション履歴がないため、いきなり `db push` すると
baseline を再実行して失敗します。スキーマが現在の migrations と一致することを
確認したうえで、既存分を「適用済み」として記録します。

**この作業は SQL を実行しません。** `migration repair` は
`supabase_migrations.schema_migrations` にバージョンを記録するだけです。

### ローカルスクリプトから実行する（推奨）

```powershell
wsl -d Ubuntu-26.04 -u root -- bash /mnt/c/Users/user/Documents/Catalyst/scripts/repair-baseline.sh
```

`DB password:` に production の DB パスワードを入力します。  
スクリプトは Session pooler 経由で接続し、全バージョンを「適用済み」として記録したあと、
`db push --dry-run` で反映待ちを確認します。

接続先を変える場合：

```bash
export SUPABASE_PROJECT_REF=...
export SUPABASE_POOLER_HOST=...
export SUPABASE_POOLER_PORT=5432
```

> 既存 DB にスキーマがある場合だけ実行してください。
> 空の DB に対して repair すると、SQL を実行しないまま「適用済み」になり、
> テーブルが作られません。

### 手動で実行する場合

```bash
export SUPABASE_PROJECT_REF=...
export SUPABASE_DB_PASSWORD=...
export SUPABASE_POOLER_HOST=...

ENCODED_PASSWORD=$(python3 -c 'import os,urllib.parse; print(urllib.parse.quote(os.environ["SUPABASE_DB_PASSWORD"], safe=""))')
URL="postgresql://postgres.${SUPABASE_PROJECT_REF}:${ENCODED_PASSWORD}@${SUPABASE_POOLER_HOST}:5432/postgres?sslmode=require"

npx supabase migration repair --status applied \
  $(ls supabase/migrations | sed 's/_.*//') \
  --remote="$URL"

npx supabase db push --remote="$URL" --dry-run
```

GitHub-hosted runner は IPv6 非対応のため、Direct connection ではなく
Session pooler の URL を使います。

新規の空プロジェクトでは repair は不要です（そのまま `db push`）。

## マイグレーションの追加と本番反映

```bash
npx supabase migration new add_some_feature
# 生成された supabase/migrations/<timestamp>_add_some_feature.sql を編集
npm run db:reset          # ローカルで検証
npm run test:integration
```

1. PR を作成（CI がローカル Supabase で検証）
2. レビュー後に master へマージ
3. Supabase の GitHub 連携（Deploy to production）が未適用のマイグレーションを自動適用
4. アプリをデプロイ

Git 連携を使わない場合は、ローカルから `supabase db push` で適用します。

破壊的変更は expand / contract に分けます。

1. 追加のみ（NULL 許可・削除なし）を適用
2. 新コードをデプロイ
3. 旧コードが消えたら削除を適用

### Supabase GitHub 連携の設定

GitHub Actions の Secret / Environment は不要です。Supabase Dashboard で設定します。

| 項目 | 値 |
|---|---|
| Repository | `Densyakun/catalyst` |
| Working directory | `.` |
| Automatic branching | オフ |
| Deploy to production | オン |

- Free プランでは Preview Branch は作成されません
- master への push / マージで、未適用のマイグレーションが自動適用されます
- ローカルから repair / 確認する場合だけ Session pooler のホストを使います

## プレビュー / PR ビルドの変数

プレビューは信頼できないコードが動く環境です。

- ビルド時・実行時とも **ステージング用の `NEXT_PUBLIC_*` だけ**を設定する
- staging プロジェクトがない場合、**本番の Supabase をプレビューに使わない**
  - Cloudflare の Preview builds を無効化し、CI のローカル Supabase テストで代替する
  - どうしても実 DB が必要なら、使っていないプロジェクトを staging として用意する
- `SUPABASE_SERVICE_ROLE_KEY` / `CLOUD_GITHUB_TOKEN` / Stripe live キー /
  本番 Google クライアントシークレットは **Previews Base に置かない**
- プレビュー URL は Cloudflare Access で保護する
- Cloudflare の Preview ビルドは本番設定を継承しない（`wrangler.jsonc` の `previews`）

## Free プランの注意

- ブランチ機能は Pro 専用。Free では **GitHub Actions のローカル Supabase** で
  マイグレーション・RLS・統合テストを実行する
- staging プロジェクトを追加できない場合、production だけを Environment に登録すればよい
- **本番プロジェクトをプレビュー用に使わない**（本番データを触る危険がある）
- プレビューに実 DB が必要な場合は、以下のいずれかを選ぶ
  - Cloudflare の Preview builds を無効化し、CI のローカル Supabase テストだけにする（推奨）
  - 使っていない既存プロジェクトを staging として作り直す
  - Supabase Pro にアップグレードしてブランチ / staging を用意する
- 無料プロジェクトは一定期間アクセスがないと停止する
- staging を用意する場合、複数 PR で共有されるためリセットは信頼できるワークフローからのみ実行する
- 並行するスキーマ変更 PR は直列化する（同時に staging へ適用しない）

## クラウド作業との関係

`scripts/cloud-runner.mjs` は `supabase_schema.sql` / `supabase_migration_*.sql` /
`supabase/migrations/` / `supabase/config.toml` を保護対象として push しません。
DB スキーマ変更は人間がレビューして適用します。クラウド作業には SQL の提案までに留めてください。
