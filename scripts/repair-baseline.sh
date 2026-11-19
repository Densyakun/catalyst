#!/usr/bin/env bash
# 既存 production DB のマイグレーション履歴を一度だけ初期化する。
#
# 使い方（Ubuntu WSL）:
#   wsl -d Ubuntu-26.04 -u root -- bash /mnt/c/Users/user/Documents/Catalyst/scripts/repair-baseline.sh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

REF="${SUPABASE_PROJECT_REF:-knrxsgrdldrlqbmvbbgw}"
HOST="${SUPABASE_POOLER_HOST:-aws-1-ap-northeast-1.pooler.supabase.com}"
PORT="${SUPABASE_POOLER_PORT:-5432}"

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  read -r -s -p "DB password: " SUPABASE_DB_PASSWORD
  echo
fi

if [ -z "$SUPABASE_DB_PASSWORD" ]; then
  echo "DB パスワードが空です。" >&2
  exit 1
fi

SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD//$'\r'/}"
SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD//$'\n'/}"

export SUPABASE_DB_PASSWORD
ENCODED_PASSWORD=$(python3 -c 'import os,urllib.parse; print(urllib.parse.quote(os.environ["SUPABASE_DB_PASSWORD"], safe=""))')
URL="postgresql://postgres.${REF}:${ENCODED_PASSWORD}@${HOST}:${PORT}/postgres?sslmode=require"

VERSIONS=$(ls supabase/migrations | sed 's/_.*//' | tr '\n' ' ')
if [ -z "$VERSIONS" ]; then
  echo "supabase/migrations にファイルがありません。" >&2
  exit 1
fi

echo "Target: ${HOST}:${PORT} (user: postgres.${REF})"
echo "Marking as applied: ${VERSIONS}"
echo

supabase migration repair --yes --status applied $VERSIONS --remote="$URL"
echo
echo "--- 反映待ちの確認 ---"
supabase db push --yes --remote="$URL" --dry-run
