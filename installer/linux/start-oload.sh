#!/usr/bin/env bash
set -euo pipefail

detach=0
if [[ "${1:-}" == "--detach" ]]; then
  detach=1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
env_file="$script_dir/.env.runtime"
app_dir="$script_dir/app"
broker_dir="$script_dir/broker"
broker_script="$broker_dir/src/server.mjs"
embedded_node="$script_dir/runtime/node/bin/node"
embedded_ollama="$script_dir/runtime/ollama/bin/ollama"
embedded_ollama_models="$script_dir/runtime/ollama-models"
install_binding_path="$script_dir/.oload-install-binding"

export OLOAD_INSTALL_ROOT="$script_dir"

read_key_value_file_value() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "$file_path" ]]; then
    return
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "${line%%=*}" == "$key" ]]; then
      printf '%s\n' "${line#*=}"
      return
    fi
  done <"$file_path"
}

default_machine_id_path() {
  if [[ -n "${XDG_STATE_HOME:-}" ]]; then
    printf '%s\n' "$XDG_STATE_HOME/oload/machine-id"
    return
  fi

  printf '%s\n' "$HOME/.local/state/oload/machine-id"
}

set_install_binding_env() {
  local status="$1"
  local message="$2"
  local install_id_value="${3:-}"
  local recorded_root_value="${4:-}"
  local installed_at_value="${5:-}"

  export OLOAD_INSTALL_BINDING_STATUS="$status"
  export OLOAD_INSTALL_BINDING_MESSAGE="$message"
  if [[ -n "$install_id_value" ]]; then
    export OLOAD_INSTALL_ID="$install_id_value"
  fi
  if [[ -n "$recorded_root_value" ]]; then
    export OLOAD_INSTALL_BINDING_RECORDED_ROOT="$recorded_root_value"
  fi
  if [[ -n "$installed_at_value" ]]; then
    export OLOAD_INSTALL_BINDING_INSTALLED_AT="$installed_at_value"
  fi
  export OLOAD_INSTALL_BINDING_CHECKED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

validate_install_binding() {
  local machine_id_path current_machine_id stored_machine_id stored_install_root install_id_value installed_at_value message

  machine_id_path="${OLOAD_MACHINE_ID_PATH:-$(default_machine_id_path)}"
  export OLOAD_MACHINE_ID_PATH="$machine_id_path"
  export OLOAD_INSTALL_BINDING_PATH="$install_binding_path"

  if [[ ! -f "$install_binding_path" ]]; then
    message="Install binding file was not found at $install_binding_path."
    set_install_binding_env "missing" "$message"
    printf 'Warning: %s\n' "$message" >&2
    return
  fi

  install_id_value="$(read_key_value_file_value "$install_binding_path" 'InstallId')"
  stored_machine_id="$(read_key_value_file_value "$install_binding_path" 'MachineId')"
  stored_install_root="$(read_key_value_file_value "$install_binding_path" 'InstallRoot')"
  installed_at_value="$(read_key_value_file_value "$install_binding_path" 'InstalledAt')"

  if [[ ! -f "$machine_id_path" ]]; then
    message="Machine ID file was not found. Install binding status is incomplete."
    set_install_binding_env "missing" "$message" "$install_id_value" "$stored_install_root" "$installed_at_value"
    printf 'Warning: %s\n' "$message" >&2
    return
  fi

  current_machine_id="$(tr -d '\r\n' <"$machine_id_path")"
  if [[ -z "$current_machine_id" || -z "$stored_machine_id" ]]; then
    message="Install binding is missing a machine ID."
    set_install_binding_env "missing" "$message" "$install_id_value" "$stored_install_root" "$installed_at_value"
    printf 'Warning: %s\n' "$message" >&2
    return
  fi

  export OLOAD_MACHINE_ID="$current_machine_id"

  if [[ "$current_machine_id" != "$stored_machine_id" ]]; then
    message='Install binding mismatch: this copy was created for a different computer.'
    set_install_binding_env "copied" "$message" "$install_id_value" "$stored_install_root" "$installed_at_value"
    printf 'Warning: %s\n' "$message" >&2
    return
  fi

  if [[ -z "$stored_install_root" || "$stored_install_root" != "$script_dir" ]]; then
    message="Install binding mismatch: this install appears to have moved from ${stored_install_root:-unknown} to $script_dir."
    set_install_binding_env "moved" "$message" "$install_id_value" "$stored_install_root" "$installed_at_value"
    printf 'Warning: %s\n' "$message" >&2
    return
  fi

  set_install_binding_env "valid" 'Install binding matches this computer and location.' "$install_id_value" "$stored_install_root" "$installed_at_value"
}

if [[ -f "$env_file" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    export "$key=$value"
  done <"$env_file"
fi

validate_install_binding

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

test_broker_api() {
  curl -fsS "$1/health" >/dev/null 2>&1
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

start_local_broker_if_needed() {
  local broker_base_url

  if [[ ! -f "$broker_script" ]]; then
    return
  fi

  broker_base_url="${OLOAD_CONTROL_BROKER_BASE_URL:-http://127.0.0.1:4010}"
  if test_broker_api "$broker_base_url"; then
    return
  fi

  BROKER_BASE_URL="$broker_base_url" OLOAD_CONTROL_BROKER_BASE_URL="$broker_base_url" nohup "$node_path" "$broker_script" >"$script_dir/broker.log" 2>&1 &
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

start_local_broker_if_needed

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