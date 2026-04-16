#!/usr/bin/env bash
set -euo pipefail

detach=0
if [[ "${1:-}" == "--detach" ]]; then
  detach=1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
env_file="$script_dir/.env.runtime"
app_dir="$script_dir/app"
embedded_node="$script_dir/runtime/node/bin/node"

if [[ -f "$env_file" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    export "$key=$value"
  done <"$env_file"
fi

if [[ -x "$embedded_node" ]]; then
  node_path="$embedded_node"
else
  node_path="$(command -v node || true)"
fi

if [[ -z "${node_path:-}" ]]; then
  printf '%s\n' 'Node.js runtime not found. Re-run install-oload.sh.' >&2
  exit 1
fi

if [[ "$detach" -eq 1 ]]; then
  cd "$app_dir"
  nohup "$node_path" server.js >"$script_dir/oload.log" 2>&1 &
  if [[ "${HOSTNAME:-127.0.0.1}" == '0.0.0.0' ]]; then
    display_host='localhost'
  else
    display_host="${HOSTNAME:-127.0.0.1}"
  fi
  printf 'Oload started at http://%s:%s\n' "$display_host" "${PORT:-3000}"
  exit 0
fi

cd "$app_dir"
exec "$node_path" server.js