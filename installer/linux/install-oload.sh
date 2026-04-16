#!/usr/bin/env bash
set -euo pipefail

minimum_node_version="20.9.0"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

prompt_value() {
  local prompt="$1"
  local default_value="${2:-}"
  local value

  if [[ -n "$default_value" ]]; then
    read -r -p "$prompt [$default_value]: " value
    if [[ -z "$value" ]]; then
      printf '%s\n' "$default_value"
      return
    fi

    printf '%s\n' "$value"
    return
  fi

  read -r -p "$prompt: " value
  printf '%s\n' "$value"
}

prompt_yes_no() {
  local prompt="$1"
  local default_value="$2"
  local default_label="y/N"
  local value

  if [[ "$default_value" == "yes" ]]; then
    default_label="Y/n"
  fi

  read -r -p "$prompt [$default_label]: " value
  if [[ -z "$value" ]]; then
    [[ "$default_value" == "yes" ]]
    return
  fi

  [[ "${value,,}" == y* ]]
}

semver_ge() {
  local current="$1"
  local minimum="$2"
  [[ "$(printf '%s\n%s\n' "$minimum" "$current" | sort -V | head -n1)" == "$minimum" ]]
}

get_system_node() {
  command -v node || true
}

get_node_version() {
  local node_path="$1"
  "$node_path" -p 'process.versions.node'
}

get_node_asset_name() {
  case "$(uname -m)" in
    aarch64|arm64)
      printf '%s\n' 'linux-arm64'
      ;;
    *)
      printf '%s\n' 'linux-x64'
      ;;
  esac
}

resolve_node_download() {
  local asset_name
  local version

  asset_name="$(get_node_asset_name)"
  version="$(curl -fsSL https://nodejs.org/dist/index.json | grep '"lts":"' | grep "\"$asset_name\"" | head -n1 | sed -E 's/.*"version":"(v[^"]+)".*/\1/')"

  if [[ -z "$version" ]]; then
    printf '%s\n' "Unable to resolve a latest Node.js LTS download for $asset_name." >&2
    exit 1
  fi

  printf '%s|%s\n' "$version" "https://nodejs.org/dist/$version/node-$version-$asset_name.tar.xz"
}

ensure_node_runtime() {
  local runtime_root="$1"
  local embedded_node="$runtime_root/node/bin/node"
  local system_node
  local version
  local resolved
  local download_version
  local download_url
  local temp_archive
  local extract_root
  local extracted_dir

  system_node="$(get_system_node)"
  if [[ -n "$system_node" ]]; then
    version="$(get_node_version "$system_node")"
    if semver_ge "$version" "$minimum_node_version"; then
      printf '%s\n' "$system_node"
      return
    fi
  fi

  if [[ -x "$embedded_node" ]]; then
    version="$(get_node_version "$embedded_node")"
    if semver_ge "$version" "$minimum_node_version"; then
      printf '%s\n' "$embedded_node"
      return
    fi
  fi

  resolved="$(resolve_node_download)"
  download_version="${resolved%%|*}"
  download_url="${resolved#*|}"
  temp_archive="$(mktemp /tmp/oload-node.XXXXXX.tar.xz)"
  extract_root="$runtime_root/node-extract"

  mkdir -p "$runtime_root"
  curl -fsSL "$download_url" -o "$temp_archive"
  rm -rf "$extract_root" "$runtime_root/node"
  mkdir -p "$extract_root"
  tar -xJf "$temp_archive" -C "$extract_root"
  extracted_dir="$(find "$extract_root" -mindepth 1 -maxdepth 1 -type d | head -n1)"

  if [[ -z "$extracted_dir" ]]; then
    printf '%s\n' 'Node.js download extracted without a runtime directory.' >&2
    exit 1
  fi

  mv "$extracted_dir" "$runtime_root/node"
  rm -rf "$extract_root" "$temp_archive"
  printf '%s\n' "$runtime_root/node/bin/node"
  printf '%s\n' "Installed bundled Node.js $download_version" >&2
}

get_ollama_path() {
  command -v ollama || true
}

ensure_ollama_installed() {
  local ollama_path
  ollama_path="$(get_ollama_path)"
  if [[ -n "$ollama_path" ]]; then
    printf '%s\n' "$ollama_path"
    return
  fi

  curl -fsSL https://ollama.com/install.sh | sh
  ollama_path="$(get_ollama_path)"

  if [[ -z "$ollama_path" ]]; then
    printf '%s\n' 'Ollama install completed, but the ollama command was not found afterwards.' >&2
    exit 1
  fi

  printf '%s\n' "$ollama_path"
}

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

ensure_ollama_running() {
  local ollama_path="$1"
  local base_url="$2"
  local attempt

  if ! is_local_ollama_url "$base_url"; then
    return
  fi

  if test_ollama_api "$base_url"; then
    return
  fi

  nohup "$ollama_path" serve >/tmp/oload-ollama.log 2>&1 &

  for attempt in $(seq 1 20); do
    sleep 1
    if test_ollama_api "$base_url"; then
      return
    fi
  done

  printf '%s\n' "Timed out waiting for Ollama to become reachable at $base_url." >&2
  exit 1
}

copy_app_payload() {
  local target_root="$1"
  local source_app_dir="$script_dir/app"
  local target_app_dir="$target_root/app"

  if [[ ! -f "$source_app_dir/server.js" ]]; then
    printf '%s\n' 'This installer bundle does not contain a standalone app payload. Run npm run bundle:installers first.' >&2
    exit 1
  fi

  mkdir -p "$target_root"
  rm -rf "$target_app_dir"
  mkdir -p "$target_app_dir"
  cp -R "$source_app_dir/." "$target_app_dir/"
  cp "$script_dir/start-oload.sh" "$target_root/start-oload.sh"
  chmod +x "$target_root/start-oload.sh"
}

write_runtime_env() {
  local target_root="$1"
  local hostname="$2"
  local port="$3"
  local ollama_base_url="$4"
  local admin_password="$5"
  local session_secret="$6"

  cat >"$target_root/.env.runtime" <<EOF
HOSTNAME=$hostname
PORT=$port
NODE_ENV=production
OLLAMA_BASE_URL=$ollama_base_url
OLOAD_ADMIN_PASSWORD=$admin_password
OLOAD_SESSION_SECRET=$session_secret
EOF
}

default_install_root="${HOME}/.local/share/oload"
install_root="$(prompt_value 'Install location' "$default_install_root")"
port="$(prompt_value 'Port' '3000')"
if prompt_yes_no 'Expose Oload on your local network' 'no'; then
  hostname='0.0.0.0'
else
  hostname='127.0.0.1'
fi
ollama_base_url="$(prompt_value 'Ollama base URL' 'http://127.0.0.1:11434')"
admin_password="$(prompt_value 'Optional bootstrap admin password (leave blank to skip)')"
session_secret="$(prompt_value 'Session secret (leave blank to auto-generate)')"
if [[ -z "$session_secret" ]]; then
  session_secret="$(openssl rand -base64 32 | tr -d '\n')"
fi

runtime_root="$install_root/runtime"
node_path="$(ensure_node_runtime "$runtime_root")"
ollama_path="$(ensure_ollama_installed)"
ensure_ollama_running "$ollama_path" "$ollama_base_url"
copy_app_payload "$install_root"
write_runtime_env "$install_root" "$hostname" "$port" "$ollama_base_url" "$admin_password" "$session_secret"

if prompt_yes_no 'Start Oload after install' 'yes'; then
  "$install_root/start-oload.sh" --detach
fi

if [[ "$hostname" == '0.0.0.0' ]]; then
  launch_host='localhost'
else
  launch_host="$hostname"
fi

printf '\nInstalled Oload to %s\n' "$install_root"
printf 'Launch later with %s/start-oload.sh\n' "$install_root"
printf 'Open http://%s:%s after the server finishes booting.\n' "$launch_host" "$port"