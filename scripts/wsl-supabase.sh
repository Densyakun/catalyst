#!/usr/bin/env bash
# Ubuntu WSL 内の Podman で Supabase CLI を実行する。
# 使い方: wsl -d Ubuntu-26.04 -u root -- bash scripts/wsl-supabase.sh <supabase args...>
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v podman >/dev/null 2>&1; then
  echo "Ubuntu WSL に podman がありません。README の手順でインストールしてください。" >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Ubuntu WSL に supabase CLI がありません。README の手順で /usr/local/bin に配置してください。" >&2
  exit 1
fi

mkdir -p /run/podman
if ! pgrep -f 'podman system service' >/dev/null 2>&1; then
  nohup podman system service --time=0 unix:///run/podman/podman.sock >/tmp/podman-api.log 2>&1 &
  sleep 2
fi
ln -sf /run/podman/podman.sock /var/run/docker.sock

cd "$PROJECT_DIR"
exec env DOCKER_HOST=unix:///run/podman/podman.sock supabase "$@"
