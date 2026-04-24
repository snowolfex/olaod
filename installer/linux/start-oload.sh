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
embedded_ollama="$script_dir/runtime/ollama/bin/ollama"
embedded_ollama_models="$script_dir/runtime/ollama-models"

export OLOAD_INSTALL_ROOT="$script_dir"

if [[ -f "$env_file" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    export "$key=$value"
  done <"$env_file"
fi

is_local_ollama_url() {
  case "$1" in
    http://127.0.0.1:*|http://localhost:*|http://0.0.0.0:*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

test_ollama_api() {
  curl -fsS "$1/api/tags" >/dev/null 2>&1
}

start_embedded_ollama_if_needed() {
  local base_url host port

  if [[ ! -x "$embedded_ollama" ]]; then
    return
  fi

  base_url="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
  if ! is_local_ollama_url "$base_url"; then
    return
  fi

  if test_ollama_api "$base_url"; then
    return
  fi

  host="$(printf '%s' "$base_url" | sed -E 's#https?://([^:/]+).*#\1#')"
  port="$(printf '%s' "$base_url" | sed -nE 's#https?://[^:/]+:([0-9]+).*#\1#p')"
  if [[ -z "$port" ]]; then
    port='11434'
  fi

  mkdir -p "$embedded_ollama_models"
  OLLAMA_HOST="$host:$port" OLLAMA_MODELS="$embedded_ollama_models" nohup "$embedded_ollama" serve >"$script_dir/ollama.log" 2>&1 &
}

start_embedded_ollama_if_needed

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