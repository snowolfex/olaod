#!/usr/bin/env bash
set -euo pipefail

minimum_node_version="20.9.0"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
default_language_arg=""
node_mode_arg=""
ollama_mode_arg=""
accept_eula_arg='false'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --language|-l)
      if [[ $# -lt 2 ]]; then
        printf '%s\n' 'The --language option requires a value.' >&2
        exit 1
      fi
      default_language_arg="$2"
      shift 2
      ;;
    --node-mode)
      if [[ $# -lt 2 ]]; then
        printf '%s\n' 'The --node-mode option requires a value.' >&2
        exit 1
      fi
      node_mode_arg="$2"
      shift 2
      ;;
    --ollama-mode)
      if [[ $# -lt 2 ]]; then
        printf '%s\n' 'The --ollama-mode option requires a value.' >&2
        exit 1
      fi
      ollama_mode_arg="$2"
      shift 2
      ;;
    --accept-eula)
      accept_eula_arg='true'
      shift
      ;;
    --help|-h)
      printf '%s\n' 'Usage: install-oload.sh [--language <code>] [--node-mode <existing|bundled>] [--ollama-mode <existing|install>] [--accept-eula]' >&2
      printf '%s\n' 'Language codes: auto, us, ar, bn, cn, gb, fa, fr, hi, ja, ko, pt, ru, es' >&2
      exit 0
      ;;
    *)
      printf 'Unsupported argument: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

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

prompt_choice() {
  local prompt="$1"
  local default_value="$2"
  local options="$3"
  local value

  read -r -p "$prompt [$default_value] ($options): " value
  if [[ -z "$value" ]]; then
    printf '%s\n' "$default_value"
    return
  fi

  printf '%s\n' "$value"
}

print_big_warning() {
  local message="$1"

  printf '\n%s\n' '############################################################' >&2
  printf '%s\n' "$message" >&2
  printf '%s\n\n' '############################################################' >&2
}

show_text_file() {
  local file_path="$1"

  if [[ ! -f "$file_path" ]]; then
    printf 'Required installer text file is missing: %s\n' "$file_path" >&2
    exit 1
  fi

  if [[ -t 0 && -t 1 ]] && command -v more >/dev/null 2>&1; then
    more "$file_path"
    return
  fi

  cat "$file_path"
}

show_install_splash() {
  cat <<'EOF'

============================================================
Wolfe Dezines // Oload
Copyright (c) 2026 Wolfe Dezines. All rights reserved.
============================================================

Oload is a private AI workspace and admin console for local
model operations, guided runtime installs, and controlled
Node.js and Ollama execution.

This installer can stage isolated runtimes, configure the
local control plane, and keep the app inside its own install
footprint by default.

Next you will review the EULA, accept it to continue, and
then see a source-available licensing notice that explains
the personal-use-only restrictions for this build.

EOF
}

require_eula_acceptance() {
  show_text_file "$script_dir/EULA.txt"

  if [[ "$accept_eula_arg" == 'true' ]]; then
    return
  fi

  if ! prompt_yes_no 'Do you accept the Oload End User License Agreement' 'no'; then
    printf '%s\n' 'EULA not accepted. Installation cancelled.' >&2
    exit 1
  fi
}

show_source_available_notice() {
  show_text_file "$script_dir/SOURCE-AVAILABLE-NOTICE.txt"

  if [[ -t 0 && -t 1 ]]; then
    printf '\n'
    read -r -p 'Press Enter to continue with installation. ' _
  fi
}

resolve_voice_language() {
  case "${1,,}" in
    auto)
      printf '%s\n' 'auto'
      ;;
    us|united-states|unitedstates)
      printf '%s\n' 'united-states'
      ;;
    ar|arabic|sa)
      printf '%s\n' 'arabic'
      ;;
    bn|bengali|bd)
      printf '%s\n' 'bengali'
      ;;
    cn|chinese|zh)
      printf '%s\n' 'chinese'
      ;;
    gb|en|english|england|uk|united-kingdom|unitedkingdom)
      printf '%s\n' 'united-kingdom'
      ;;
    fa|farsi|ir)
      printf '%s\n' 'farsi'
      ;;
    fr|french)
      printf '%s\n' 'french'
      ;;
    hi|hindi|in)
      printf '%s\n' 'hindi'
      ;;
    ja|japanese|jp)
      printf '%s\n' 'japanese'
      ;;
    ko|korean|kr)
      printf '%s\n' 'korean'
      ;;
    pt|portuguese|br)
      printf '%s\n' 'portuguese'
      ;;
    ru|russian)
      printf '%s\n' 'russian'
      ;;
    es|spanish)
      printf '%s\n' 'spanish'
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_node_mode() {
  case "${1,,}" in
    ''|auto|bundled|install)
      printf '%s\n' 'bundled'
      ;;
    existing|existing-if-found)
      printf '%s\n' 'existing-if-found'
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_ollama_mode() {
  case "${1,,}" in
    ''|auto|install|repair|install-or-repair)
      printf '%s\n' 'install-or-repair'
      ;;
    existing|existing-if-found)
      printf '%s\n' 'existing-if-found'
      ;;
    *)
      return 1
      ;;
  esac
}

voice_language_code_for() {
  case "$1" in
    auto) printf '%s\n' 'auto' ;;
    united-states) printf '%s\n' 'us' ;;
    arabic) printf '%s\n' 'ar' ;;
    bengali) printf '%s\n' 'bn' ;;
    chinese) printf '%s\n' 'cn' ;;
    united-kingdom) printf '%s\n' 'gb' ;;
    english) printf '%s\n' 'gb' ;;
    farsi) printf '%s\n' 'fa' ;;
    french) printf '%s\n' 'fr' ;;
    hindi) printf '%s\n' 'hi' ;;
    japanese) printf '%s\n' 'ja' ;;
    korean) printf '%s\n' 'ko' ;;
    portuguese) printf '%s\n' 'pt' ;;
    russian) printf '%s\n' 'ru' ;;
    spanish) printf '%s\n' 'es' ;;
    *) printf '%s\n' 'us' ;;
  esac
}

prompt_voice_language() {
  local default_value="$1"
  local default_code
  local selection

  default_code="$(voice_language_code_for "$default_value")"
  printf '%s\n' 'Default language codes: auto, us, ar, bn, cn, gb, fa, fr, hi, ja, ko, pt, ru, es' >&2
  selection="$(prompt_value 'Default language code' "$default_code")"

  if ! resolve_voice_language "$selection"; then
    printf 'Unsupported default language code: %s\n' "$selection" >&2
    exit 1
  fi
}

semver_ge() {
  local current="$1"
  local minimum="$2"
  [[ "$(printf '%s\n%s\n' "$minimum" "$current" | sort -V | head -n1)" == "$minimum" ]]
}

normalize_semver() {
  printf '%s\n' "${1#v}"
}

get_dependency_version_warning() {
  local dependency_name="$1"
  local current_version="$2"
  local recommended_version="$3"
  local minimum_version="$4"
  local isolated_label="$5"

  if [[ -z "$current_version" ]]; then
    return
  fi

  if [[ -n "$minimum_version" ]] && ! semver_ge "$current_version" "$minimum_version"; then
    printf '%s\n' "$dependency_name $current_version is below the minimum supported version $minimum_version for Oload. Oload can install and use an isolated $isolated_label instance inside its own install folder, and that is the default."
    return
  fi

  if [[ -n "$recommended_version" ]] && ! semver_ge "$current_version" "$recommended_version"; then
    printf '%s\n' "$dependency_name $current_version is older than the isolated Oload-managed $isolated_label version $recommended_version. Oload can install and use an isolated $isolated_label instance inside its own install folder, and that is the default."
  fi
}

confirm_existing_dependency_choice() {
  local dependency_name="$1"
  local existing_path="$2"
  local current_version="$3"
  local recommended_version="$4"
  local minimum_version="$5"
  local isolated_label="$6"
  local warning

  warning="$(get_dependency_version_warning "$dependency_name" "$current_version" "$recommended_version" "$minimum_version" "$isolated_label")"
  if [[ -z "$warning" ]]; then
    return 0
  fi

  print_big_warning "$warning

Detected path: ${existing_path:-the detected shared installation}"

  if [[ -n "$minimum_version" ]] && ! semver_ge "$current_version" "$minimum_version"; then
    print_big_warning "$dependency_name $current_version is below the supported minimum and may cause Oload not to work. Oload can switch back to the default isolated $isolated_label install instead."
  else
    print_big_warning "$dependency_name $current_version is older than the default isolated $isolated_label runtime and may cause Oload not to work. Oload can switch back to the default isolated $isolated_label install instead."
  fi

  prompt_yes_no "Keep using the older shared $dependency_name anyway?" no
}

get_system_node() {
  command -v node || true
}

get_node_version() {
  local node_path="$1"
  "$node_path" -p 'process.versions.node'
}

detect_existing_node() {
  local system_node
  local version
  local compatible='false'

  system_node="$(get_system_node)"
  if [[ -z "$system_node" ]]; then
    return 1
  fi

  version="$(get_node_version "$system_node")"
  if semver_ge "$version" "$minimum_node_version"; then
    compatible='true'
  fi

  printf '%s|%s|%s\n' "$system_node" "$version" "$compatible"
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

resolve_ollama_download() {
  local asset_name
  local release_json
  local version
  local download_url

  case "$(uname -m)" in
    aarch64|arm64)
      asset_name='ollama-linux-arm64.tar.zst'
      ;;
    *)
      asset_name='ollama-linux-amd64.tar.zst'
      ;;
  esac

  release_json="$(curl -fsSL -H 'User-Agent: oload-installer' https://api.github.com/repos/ollama/ollama/releases/latest)"
  version="$(printf '%s' "$release_json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  download_url="$(printf '%s' "$release_json" | tr -d '\n' | sed -n "s/.*\"name\"[[:space:]]*:[[:space:]]*\"$asset_name\"[^}]*\"browser_download_url\"[[:space:]]*:[[:space:]]*\"\([^"]*\)\".*/\1/p")"

  if [[ -z "$version" || -z "$download_url" ]]; then
    printf '%s\n' "Unable to resolve a latest Ollama download for $asset_name." >&2
    exit 1
  fi

  printf '%s|%s\n' "$(normalize_semver "$version")" "$download_url"
}

get_ollama_version() {
  local ollama_path="$1"
  local raw_version

  raw_version="$($ollama_path --version 2>/dev/null | head -n1 || true)"
  raw_version="$(printf '%s' "$raw_version" | sed -E 's/.*v?([0-9]+(\.[0-9]+){1,3}).*/\1/')"

  if [[ -n "$raw_version" ]]; then
    printf '%s\n' "$raw_version"
    return
  fi

  raw_version="$($ollama_path -v 2>/dev/null | head -n1 || true)"
  raw_version="$(printf '%s' "$raw_version" | sed -E 's/.*v?([0-9]+(\.[0-9]+){1,3}).*/\1/')"
  printf '%s\n' "$raw_version"
}

ensure_node_runtime() {
  local runtime_root="$1"
  local mode="$2"
  local system_node_path="$3"
  local system_node_version="$4"
  local embedded_node="$runtime_root/node/bin/node"
  local resolved
  local download_version
  local download_url
  local temp_archive
  local extract_root
  local extracted_dir

  if [[ "$mode" == 'existing-if-found' && -n "$system_node_path" ]]; then
    node_choice="$mode"
    node_action='used-existing'
    node_detected_path="$system_node_path"
    node_effective_path="$system_node_path"
    node_existed_before_install='true'
    node_installed_by_oload='false'
    node_version="$system_node_version"
    printf '%s\n' "$system_node_path"
    return
  fi

  if [[ -x "$embedded_node" ]]; then
    local embedded_version
    embedded_version="$(get_node_version "$embedded_node")"
    if semver_ge "$embedded_version" "$minimum_node_version"; then
      node_choice="$mode"
      node_action='used-bundled'
      node_detected_path="$system_node_path"
      node_effective_path="$embedded_node"
      node_existed_before_install='true'
      node_installed_by_oload='true'
      node_version="$embedded_version"
      printf '%s\n' "$embedded_node"
      return
    fi
  fi

  resolved="$(resolve_node_download)"
  download_version="$(normalize_semver "${resolved%%|*}")"
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
  node_choice="$mode"
  node_action='installed-bundled'
  node_detected_path="$system_node_path"
  node_effective_path="$runtime_root/node/bin/node"
  node_existed_before_install='false'
  node_installed_by_oload='true'
  node_version="$download_version"
  printf '%s\n' "$runtime_root/node/bin/node"
  printf '%s\n' "Installed bundled Node.js $download_version" >&2
}

get_ollama_path() {
  command -v ollama || true
}

ensure_ollama_installed() {
  local runtime_root="$1"
  local mode="$2"
  local detected_path="$3"
  local detected_version="$4"
  local ollama_path
  local target_root="$runtime_root/ollama"
  local embedded_ollama="$target_root/bin/ollama"
  local resolved
  local download_version
  local download_url
  local temp_archive

  if [[ "$mode" == 'existing-if-found' && -n "$detected_path" ]]; then
    ollama_choice="$mode"
    ollama_action='used-existing'
    ollama_detected_path="$detected_path"
    ollama_effective_path="$detected_path"
    ollama_existed_before_install='true'
    ollama_installed_by_oload='false'
    ollama_version="$detected_version"
    printf '%s\n' "$detected_path"
    return
  fi

  if [[ -x "$embedded_ollama" ]]; then
    ollama_choice="$mode"
    ollama_action='used-bundled'
    ollama_detected_path="$detected_path"
    ollama_effective_path="$embedded_ollama"
    ollama_existed_before_install='true'
    ollama_installed_by_oload='true'
    ollama_version="$(get_ollama_version "$embedded_ollama")"
    printf '%s\n' "$embedded_ollama"
    return
  fi

  resolved="$(resolve_ollama_download)"
  download_version="${resolved%%|*}"
  download_url="${resolved#*|}"
  temp_archive="$(mktemp /tmp/oload-ollama.XXXXXX.tar.zst)"

  mkdir -p "$runtime_root"
  curl -fsSL "$download_url" -o "$temp_archive"
  rm -rf "$target_root"
  mkdir -p "$target_root"
  tar --zstd -xf "$temp_archive" -C "$target_root"
  rm -f "$temp_archive"
  ollama_path="$target_root/bin/ollama"

  if [[ ! -x "$ollama_path" ]]; then
    printf '%s\n' 'The isolated Ollama runtime was downloaded, but the ollama command was not found afterwards.' >&2
    exit 1
  fi

  ollama_choice="$mode"
  ollama_action='installed-bundled'
  ollama_detected_path="$detected_path"
  ollama_effective_path="$ollama_path"
  ollama_existed_before_install='false'
  ollama_installed_by_oload='true'
  ollama_version="$download_version"

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
  local models_path="$3"
  local attempt

  if ! is_local_ollama_url "$base_url"; then
    return
  fi

  if test_ollama_api "$base_url"; then
    return
  fi

  local uri_host
  local uri_port
  uri_host="$(printf '%s' "$base_url" | sed -E 's#https?://([^:/]+).*#\1#')"
  uri_port="$(printf '%s' "$base_url" | sed -nE 's#https?://[^:/]+:([0-9]+).*#\1#p')"
  if [[ -z "$uri_port" ]]; then
    uri_port='11434'
  fi

  if [[ "$ollama_path" == *"/runtime/ollama/bin/ollama" ]]; then
    mkdir -p "$models_path"
    OLLAMA_HOST="$uri_host:$uri_port" OLLAMA_MODELS="$models_path" nohup "$ollama_path" serve >/tmp/oload-ollama.log 2>&1 &
  else
    OLLAMA_HOST="$uri_host:$uri_port" nohup "$ollama_path" serve >/tmp/oload-ollama.log 2>&1 &
  fi

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
  local source_broker_dir="$script_dir/broker"
  local target_broker_dir="$target_root/broker"

  if [[ ! -f "$source_app_dir/server.js" ]]; then
    printf '%s\n' 'This installer bundle does not contain a standalone app payload. Run npm run bundle:installers first.' >&2
    exit 1
  fi

  mkdir -p "$target_root"
  rm -rf "$target_app_dir"
  rm -rf "$target_broker_dir"
  mkdir -p "$target_app_dir"
  cp -R "$source_app_dir/." "$target_app_dir/"
  if [[ -d "$source_broker_dir" ]]; then
    mkdir -p "$target_broker_dir"
    cp -R "$source_broker_dir/." "$target_broker_dir/"
  fi
  cp "$script_dir/start-oload.sh" "$target_root/start-oload.sh"
  cp "$script_dir/uninstall-oload.sh" "$target_root/uninstall-oload.sh"
  cp "$script_dir/EULA.txt" "$target_root/EULA.txt"
  cp "$script_dir/SOURCE-AVAILABLE-NOTICE.txt" "$target_root/SOURCE-AVAILABLE-NOTICE.txt"
  cp "$script_dir/README.md" "$target_root/README.md"
  if [[ -f "$script_dir/oload.png" ]]; then
    cp "$script_dir/oload.png" "$target_root/oload.png"
  fi
  chmod +x "$target_root/start-oload.sh"
  chmod +x "$target_root/uninstall-oload.sh"
}

create_desktop_launcher() {
  local target_root="$1"
  local desktop_applications_dir="$HOME/.local/share/applications"
  local desktop_entry_path="$desktop_applications_dir/oload.desktop"
  local icon_path="$target_root/oload.png"

  desktop_entry_path_value=''
  desktop_icon_path_value=''

  if [[ ! -f "$icon_path" ]]; then
    return
  fi

  mkdir -p "$desktop_applications_dir"

  cat >"$desktop_entry_path" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Oload
Comment=Private AI workspace and admin console for local model operations
Exec="$target_root/start-oload.sh" --detach
Icon=$icon_path
Terminal=false
Categories=Development;Utility;
StartupNotify=true
EOF

  chmod +x "$desktop_entry_path"
  desktop_entry_path_value="$desktop_entry_path"
  desktop_icon_path_value="$icon_path"
}

write_runtime_env() {
  local target_root="$1"
  local hostname="$2"
  local port="$3"
  local ollama_base_url="$4"
  local default_language="$5"
  local update_manifest_url="$6"
  local update_channel="$7"
  local update_manifest_public_key="$8"
  local admin_password="$9"
  local session_secret="${10}"

  cat >"$target_root/.env.runtime" <<EOF
HOSTNAME=$hostname
PORT=$port
NODE_ENV=production
OLLAMA_BASE_URL=$ollama_base_url
OLOAD_DEFAULT_LANGUAGE=$default_language
OLOAD_UPDATE_MANIFEST_URL=$update_manifest_url
OLOAD_UPDATE_CHANNEL=$update_channel
OLOAD_UPDATE_MANIFEST_PUBLIC_KEY=$update_manifest_public_key
OLOAD_CONTROL_BROKER_BASE_URL=http://127.0.0.1:4010
OLOAD_MACHINE_ID=$machine_id
OLOAD_MACHINE_ID_PATH=$machine_id_path
OLOAD_MACHINE_STATE_ROOT=$machine_state_root
OLOAD_INSTALL_ID=$install_id
OLOAD_INSTALL_BINDING_PATH=$target_root/.oload-install-binding
OLOAD_ADMIN_PASSWORD=$admin_password
OLOAD_SESSION_SECRET=$session_secret
EOF
}

normalize_install_root() {
  local target_root="$1"

  mkdir -p "$target_root"
  (
    cd "$target_root"
    pwd -P
  )
}

get_machine_state_root() {
  if [[ -n "${XDG_STATE_HOME:-}" ]]; then
    printf '%s\n' "$XDG_STATE_HOME/oload"
    return
  fi

  printf '%s\n' "$HOME/.local/state/oload"
}

get_or_create_machine_id() {
  local state_root="$1"

  mkdir -p "$state_root"
  machine_id_path="$state_root/machine-id"
  if [[ -f "$machine_id_path" ]]; then
    machine_id="$(tr -d '\r\n' <"$machine_id_path")"
    if [[ -n "$machine_id" ]]; then
      return
    fi
  fi

  machine_id="$(openssl rand -hex 16 | tr -d '\n')"
  printf '%s\n' "$machine_id" >"$machine_id_path"
}

write_install_binding() {
  local target_root="$1"

  cat >"$target_root/.oload-install-binding" <<EOF
InstallId=$install_id
MachineId=$machine_id
InstallRoot=$target_root
InstalledAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
Hostname=$hostname
Platform=linux
EOF
}

write_install_state() {
  local target_root="$1"

  cat >"$target_root/.oload-install-state" <<EOF
InstallRoot=$target_root
InstalledAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
InstallId=$install_id
MachineId=$machine_id
MachineIdPath=$machine_id_path
MachineStateRoot=$machine_state_root
DefaultLanguage=$default_language
NodeChoice=$node_choice
NodeAction=$node_action
NodeDetectedPath=$node_detected_path
NodeExistedBeforeInstall=$node_existed_before_install
NodeInstalledByOload=$node_installed_by_oload
NodePath=$node_effective_path
ManagedNodeRoot=${managed_node_root:-}
NodeVersion=$node_version
OllamaChoice=$ollama_choice
OllamaAction=$ollama_action
OllamaDetectedPath=$ollama_detected_path
OllamaExistedBeforeInstall=$ollama_existed_before_install
OllamaInstalledByOload=$ollama_installed_by_oload
OllamaPath=$ollama_effective_path
ManagedOllamaRoot=${managed_ollama_root:-}
ManagedOllamaModelsRoot=${managed_ollama_models_root:-}
OllamaVersion=$ollama_version
RuntimeRoot=$runtime_root
AppPayloadRoot=$target_root/app
BrokerRoot=$target_root/broker
StartScriptPath=$target_root/start-oload.sh
UninstallScriptPath=$target_root/uninstall-oload.sh
RuntimeEnvPath=$target_root/.env.runtime
InstallStatePath=$target_root/.oload-install-state
InstallBindingPath=$target_root/.oload-install-binding
InstallManifestPath=$target_root/INSTALL-MANIFEST.txt
UninstallNotesPath=$target_root/UNINSTALL-NOTES.txt
ReadmePath=$target_root/README.md
EulaPath=$target_root/EULA.txt
SourceNoticePath=$target_root/SOURCE-AVAILABLE-NOTICE.txt
AppIconPath=${desktop_icon_path_value:-$target_root/oload.png}
DesktopEntryPath=${desktop_entry_path_value:-}
EOF
}

write_install_manifest() {
  local target_root="$1"

  cat >"$target_root/INSTALL-MANIFEST.txt" <<EOF
Oload install manifest

Install root: $target_root
Installed at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Platform: Linux

App footprint:
- App payload directory: $target_root/app
- Broker directory: $target_root/broker
- Runtime root: $runtime_root
- Start launcher: $target_root/start-oload.sh
- Uninstall launcher: $target_root/uninstall-oload.sh
- Runtime env file: $target_root/.env.runtime
- Install state file: $target_root/.oload-install-state
- Install binding file: $target_root/.oload-install-binding
- Install manifest file: $target_root/INSTALL-MANIFEST.txt
- Uninstall notes file: $target_root/UNINSTALL-NOTES.txt
- README: $target_root/README.md
- EULA copy: $target_root/EULA.txt
- Source notice copy: $target_root/SOURCE-AVAILABLE-NOTICE.txt
- App icon: ${desktop_icon_path_value:-$target_root/oload.png}
- Desktop launcher: ${desktop_entry_path_value:-not created}

Install identity:
- Machine state root: $machine_state_root
- Machine ID path: $machine_id_path
- Machine ID: $machine_id
- Install ID: $install_id

Dependency decisions:
- Node.js mode: ${node_choice:-unknown}
- Node.js detected shared path: ${node_detected_path:-not found}
- Node.js effective path: ${node_effective_path:-unknown}
- Node.js managed runtime root: ${managed_node_root:-not managed by Oload}
- Node.js existed before install: ${node_existed_before_install:-false}
- Node.js installed by Oload: ${node_installed_by_oload:-false}

- Ollama mode: ${ollama_choice:-unknown}
- Ollama detected shared path: ${ollama_detected_path:-not found}
- Ollama effective path: ${ollama_effective_path:-unknown}
- Ollama managed runtime root: ${managed_ollama_root:-not managed by Oload}
- Ollama managed models root: ${managed_ollama_models_root:-not managed by Oload}
- Ollama existed before install: ${ollama_existed_before_install:-false}
- Ollama installed by Oload: ${ollama_installed_by_oload:-false}

Uninstall behavior:
- uninstall-oload.sh removes the install root and uses the managed runtime paths above for dependency cleanup prompts.
- Shared dependencies are only removed if the operator explicitly confirms it.
EOF
}

write_uninstall_notes() {
  local target_root="$1"

  cat >"$target_root/UNINSTALL-NOTES.txt" <<EOF
Oload uninstall notes

Install root: $target_root
Installed at: $(date -u +%Y-%m-%dT%H:%M:%SZ)

Node.js/npm runtime:
- Verified existing path before install: ${node_detected_path:-not found}
- Selected mode: ${node_choice:-unknown}
- Effective runtime path: ${node_effective_path:-unknown}
- Existed before this install: ${node_existed_before_install:-false}
- Installed by Oload: ${node_installed_by_oload:-false}

Ollama:
- Verified existing path before install: ${ollama_detected_path:-not found}
- Selected mode: ${ollama_choice:-unknown}
- Effective Ollama path: ${ollama_effective_path:-unknown}
- Managed Ollama runtime root: ${managed_ollama_root:-not managed by Oload}
- Managed Ollama models root: ${managed_ollama_models_root:-not managed by Oload}
- Existed before this install: ${ollama_existed_before_install:-false}
- Installed by Oload: ${ollama_installed_by_oload:-false}

Managed Oload paths:
- App payload directory: $target_root/app
- Broker directory: $target_root/broker
- Runtime root: $runtime_root
- Runtime env file: $target_root/.env.runtime
- Install state file: $target_root/.oload-install-state
- Install binding file: $target_root/.oload-install-binding
- Install manifest file: $target_root/INSTALL-MANIFEST.txt
- Uninstall notes file: $target_root/UNINSTALL-NOTES.txt
- App icon: ${desktop_icon_path_value:-$target_root/oload.png}
- Desktop launcher: ${desktop_entry_path_value:-not created}

Install identity:
- Machine state root: $machine_state_root
- Machine ID path: $machine_id_path
- Machine ID: $machine_id
- Install ID: $install_id

Default language: ${default_language:-united-states}

See INSTALL-MANIFEST.txt for the full installed-path inventory.
Run uninstall-oload.sh to remove Oload. The uninstall flow will ask again before removing shared Node.js/npm or Ollama dependencies.
Ollama removal always requires an extra confirmation because it can also remove all local models.
EOF
}

prompt_node_mode() {
  local default_value="$1"
  local existing_info="$2"
  local existing_path="$3"
  local existing_version="$4"
  local recommended_version="$5"

  if [[ -n "$node_mode_arg" ]]; then
    if ! resolve_node_mode "$node_mode_arg"; then
      printf 'Unsupported Node.js mode: %s\n' "$node_mode_arg" >&2
      exit 1
    fi
    printf '%s\n' "$(resolve_node_mode "$node_mode_arg")"
    return
  fi

  if [[ -n "$existing_info" ]]; then
    printf 'Verified existing Node.js at %s\n' "$existing_info" >&2
  else
    printf '%s\n' 'No compatible existing Node.js runtime was found. Oload can install a bundled runtime for itself.' >&2
  fi

  local selection
  selection="$(prompt_choice 'Node.js/npm choice' "$default_value" 'existing/bundled')"
  if ! resolve_node_mode "$selection"; then
    printf 'Unsupported Node.js mode: %s\n' "$selection" >&2
    exit 1
  fi

  selection="$(resolve_node_mode "$selection")"
  if [[ "$selection" == 'existing-if-found' && -n "$existing_path" ]]; then
    if ! confirm_existing_dependency_choice 'Node.js' "$existing_path" "$existing_version" "$recommended_version" "$minimum_node_version" 'Node.js / npm'; then
      selection='bundled'
    fi
  fi

  printf '%s\n' "$selection"
}

prompt_ollama_mode() {
  local default_value="$1"
  local existing_path="$2"
  local existing_version="$3"
  local recommended_version="$4"

  if [[ -n "$ollama_mode_arg" ]]; then
    if ! resolve_ollama_mode "$ollama_mode_arg"; then
      printf 'Unsupported Ollama mode: %s\n' "$ollama_mode_arg" >&2
      exit 1
    fi
    printf '%s\n' "$(resolve_ollama_mode "$ollama_mode_arg")"
    return
  fi

  if [[ -n "$existing_path" ]]; then
    printf 'Verified existing Ollama at %s\n' "$existing_path" >&2
  else
    printf '%s\n' 'No existing Ollama installation was found in PATH.' >&2
  fi

  local selection
  selection="$(prompt_choice 'Ollama choice' "$default_value" 'existing/install')"
  if ! resolve_ollama_mode "$selection"; then
    printf 'Unsupported Ollama mode: %s\n' "$selection" >&2
    exit 1
  fi

  selection="$(resolve_ollama_mode "$selection")"
  if [[ "$selection" == 'existing-if-found' && -n "$existing_path" ]]; then
    if ! confirm_existing_dependency_choice 'Ollama' "$existing_path" "$existing_version" "$recommended_version" '' 'Ollama'; then
      selection='install-or-repair'
    fi
  fi

  printf '%s\n' "$selection"
}

default_install_root="${HOME}/.local/share/oload"
show_install_splash
require_eula_acceptance
show_source_available_notice
existing_node_info="$(detect_existing_node || true)"
existing_node_path="${existing_node_info%%|*}"
existing_node_remainder="${existing_node_info#*|}"
existing_node_version="${existing_node_remainder%%|*}"
existing_node_compatible="${existing_node_remainder##*|}"
if [[ "$existing_node_info" != *'|'* ]]; then
  existing_node_path=""
  existing_node_version=""
  existing_node_compatible='false'
fi
existing_ollama_path="$(get_ollama_path)"
existing_ollama_version=''
if [[ -n "$existing_ollama_path" ]]; then
  existing_ollama_version="$(get_ollama_version "$existing_ollama_path")"
fi
recommended_node_info="$(resolve_node_download)"
recommended_node_version="$(normalize_semver "${recommended_node_info%%|*}")"
recommended_ollama_info="$(resolve_ollama_download)"
recommended_ollama_version="${recommended_ollama_info%%|*}"
install_root="$(prompt_value 'Install location' "$default_install_root")"
install_root="$(normalize_install_root "$install_root")"
port="$(prompt_value 'Port' '3000')"
if prompt_yes_no 'Expose Oload on your local network' 'no'; then
  hostname='0.0.0.0'
else
  hostname='127.0.0.1'
fi
ollama_base_url="$(prompt_value 'Ollama base URL' 'http://127.0.0.1:11434')"
update_manifest_url="$(prompt_value 'Optional update manifest URL (leave blank to disable live updates)')"
update_channel="$(prompt_value 'Update channel' 'stable')"
update_manifest_public_key="$(prompt_value 'Update manifest public key (PEM, leave blank to skip verification)')"
if [[ -n "$default_language_arg" ]]; then
  if ! default_language="$(resolve_voice_language "$default_language_arg")"; then
    printf 'Unsupported default language code: %s\n' "$default_language_arg" >&2
    exit 1
  fi
else
  default_language="$(prompt_voice_language 'united-states')"
fi
node_mode="$(prompt_node_mode 'bundled' "$existing_node_path ${existing_node_version:+(v$existing_node_version)}" "$existing_node_path" "$existing_node_version" "$recommended_node_version")"
ollama_mode="$(prompt_ollama_mode 'install' "$existing_ollama_path" "$existing_ollama_version" "$recommended_ollama_version")"
admin_password="$(prompt_value 'Optional bootstrap admin password (leave blank to skip)')"
session_secret="$(prompt_value 'Session secret (leave blank to auto-generate)')"

if [[ "$ollama_mode" == 'install-or-repair' && -n "$existing_ollama_path" && "$ollama_base_url" == 'http://127.0.0.1:11434' ]]; then
  ollama_base_url='http://127.0.0.1:11435'
  print_big_warning "A shared Ollama installation was detected on the default local port 11434. Oload is switching its isolated Ollama runtime to $ollama_base_url so the private runtime can run separately by default."
fi

if [[ -z "$session_secret" ]]; then
  session_secret="$(openssl rand -base64 32 | tr -d '\n')"
fi

machine_state_root="$(get_machine_state_root)"
machine_id=''
machine_id_path=''
get_or_create_machine_id "$machine_state_root"
install_id="$(openssl rand -hex 16 | tr -d '\n')"

runtime_root="$install_root/runtime"
node_choice=''
node_action=''
node_detected_path="$existing_node_path"
node_effective_path=''
node_existed_before_install='false'
node_installed_by_oload='false'
node_version=''
ollama_choice=''
ollama_action=''
ollama_detected_path="$existing_ollama_path"
ollama_effective_path=''
ollama_existed_before_install='false'
ollama_installed_by_oload='false'
ollama_version=''
node_path="$(ensure_node_runtime "$runtime_root" "$node_mode" "$existing_node_path" "$existing_node_version")"
ollama_path="$(ensure_ollama_installed "$runtime_root" "$ollama_mode" "$existing_ollama_path" "$existing_ollama_version")"
managed_node_root=''
managed_ollama_root=''
managed_ollama_models_root=''
if [[ "$node_installed_by_oload" == 'true' ]]; then
  managed_node_root="$runtime_root/node"
fi
if [[ "$ollama_installed_by_oload" == 'true' ]]; then
  managed_ollama_root="$runtime_root/ollama"
  managed_ollama_models_root="$runtime_root/ollama-models"
fi
ensure_ollama_running "$ollama_path" "$ollama_base_url" "$runtime_root/ollama-models"
copy_app_payload "$install_root"
create_desktop_launcher "$install_root"
write_install_binding "$install_root"
write_install_state "$install_root"
write_install_manifest "$install_root"
write_uninstall_notes "$install_root"
write_runtime_env "$install_root" "$hostname" "$port" "$ollama_base_url" "$default_language" "$update_manifest_url" "$update_channel" "$update_manifest_public_key" "$admin_password" "$session_secret"

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
printf 'Uninstall later with %s/uninstall-oload.sh\n' "$install_root"
printf 'Install manifest written to %s/INSTALL-MANIFEST.txt\n' "$install_root"
if [[ -n "${desktop_entry_path_value:-}" ]]; then
  printf 'Desktop launcher written to %s\n' "$desktop_entry_path_value"
fi
printf 'Open http://%s:%s after the server finishes booting.\n' "$launch_host" "$port"