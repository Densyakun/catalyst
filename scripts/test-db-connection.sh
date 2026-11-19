#!/usr/bin/env bash
# production DB のパスワードを確認する（SQL は実行しない。select 1 のみ）。
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-knrxsgrdldrlqbmvbbgw}"
HOST="${SUPABASE_POOLER_HOST:-aws-1-ap-northeast-1.pooler.supabase.com}"
PORT="${SUPABASE_POOLER_PORT:-5432}"

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  read -r -s -p "DB password: " SUPABASE_DB_PASSWORD
  echo
fi

SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD//$'\r'/}"
SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD//$'\n'/}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql がありません。apt-get install -y postgresql-client を実行してください。" >&2
  exit 1
fi

echo "Target: ${HOST}:${PORT} (ref: ${REF})"
echo

for USER in "postgres.${REF}" "postgres"; do
  echo "Trying user: $USER"
  if OUTPUT=$(PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
    "host=${HOST} port=${PORT} dbname=postgres user=${USER} sslmode=require" \
    -tAc "select 1" 2>&1); then
    echo "OK: ${USER} で接続できました。"
    exit 0
  fi
  echo "FAIL: ${USER}"
  echo "$OUTPUT" | sed 's/^/  /'
done

echo
echo "どちらのユーザーでも認証に失敗しました。"
echo "Supabase Dashboard -> Project Settings -> Database でパスワードを再設定し、"
echo "サービスロールキーではなく DB パスワードを入力してください。"
exit 1
