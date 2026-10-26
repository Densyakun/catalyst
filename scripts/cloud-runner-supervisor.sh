#!/usr/bin/env bash
# クラウドランナーを常駐させる。異常終了した場合だけ自動で再起動する。
set -u

cd "$(dirname "$0")/.." || exit 1

if pgrep -f "node scripts/cloud-runner.mjs" > /dev/null 2>&1; then
  exit 0
fi

nohup bash -c 'while true; do
  node scripts/cloud-runner.mjs >> /tmp/katalyst-cloud.log 2>&1
  code=$?
  echo "[supervisor] runner exited with code $code" >> /tmp/katalyst-cloud.log
  if [ "$code" -eq 0 ]; then break; fi
  sleep 10
done' > /dev/null 2>&1 &
