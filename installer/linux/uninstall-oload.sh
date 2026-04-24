#!/usr/bin/env bash
set -euo pipefail

install_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
state_file="$install_root/.oload-install-state"

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

read_state_value() {
  local key="$1"

  if [[ ! -f "$state_file" ]]; then
    return
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "${line%%=*}" == "$key" ]]; then
      printf '%s\n' "${line#*=}"
      return
    fi
  done <"$state_file"
}

run_with_optional_sudo() {
  if "$@" 2>/dev/null; then
    return 0
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return 1
  fi
}

remove_path_if_present() {
  local target_path="$1"

  if [[ -e "$target_path" ]]; then
    rm -rf "$target_path" 2>/dev/null || run_with_optional_sudo rm -rf "$target_path" || true
  fi
}

node_existed_before="$(read_state_value 'NodeExistedBeforeInstall')"
node_installed_by_oload="$(read_state_value 'NodeInstalledByOload')"
node_path="$(read_state_value 'NodePath')"
ollama_existed_before="$(read_state_value 'OllamaExistedBeforeInstall')"
ollama_installed_by_oload="$(read_state_value 'OllamaInstalledByOload')"
ollama_path="$(read_state_value 'OllamaPath')"
embedded_ollama_root="$install_root/runtime/ollama"
embedded_ollama_models="$install_root/runtime/ollama-models"

if [[ "$node_installed_by_oload" == 'true' && -d "$install_root/runtime/node" ]]; then
  if prompt_yes_no "Remove the Oload-managed Node.js/npm runtime at $install_root/runtime/node?" yes; then
    remove_path_if_present "$install_root/runtime/node"
  fi
elif [[ "$node_existed_before" == 'true' || -n "$node_path" ]]; then
  if prompt_yes_no "Node.js/npm was already present before Oload at ${node_path:-the verified system path}. Remove that shared installation too? This may affect other apps." no; then
    printf '%s\n' 'Oload does not remove pre-existing shared Node.js/npm automatically on Linux. Remove it with your original package manager if you still want it gone.' >&2
  fi
fi

remove_ollama='no'
if [[ "$ollama_existed_before" == 'true' ]]; then
  if prompt_yes_no "Ollama was already installed before Oload at ${ollama_path:-the verified system path}. Remove Ollama anyway?" no; then
    remove_ollama='yes'
  fi
elif [[ "$ollama_installed_by_oload" == 'true' ]]; then
  if prompt_yes_no "Oload installed an isolated Ollama runtime at ${ollama_path:-the verified system path}. Remove that isolated Ollama runtime too?" no; then
    remove_ollama='yes'
  fi
else
  if prompt_yes_no 'Remove any Ollama installation that is still present on this machine?' no; then
    remove_ollama='yes'
  fi
fi

if [[ "$remove_ollama" == 'yes' ]]; then
  if prompt_yes_no 'Removing Ollama can also remove all local models. Continue?' no; then
    pkill -f 'ollama serve' 2>/dev/null || true
    if [[ "$ollama_installed_by_oload" == 'true' && "$ollama_path" == "$install_root"* ]]; then
      remove_path_if_present "$embedded_ollama_root"
      if prompt_yes_no "Also remove the isolated Ollama models stored at $embedded_ollama_models?" yes; then
        remove_path_if_present "$embedded_ollama_models"
      fi
    else
      run_with_optional_sudo systemctl stop ollama >/dev/null 2>&1 || true
      run_with_optional_sudo systemctl disable ollama >/dev/null 2>&1 || true
      remove_path_if_present "$HOME/.ollama"
      remove_path_if_present '/usr/share/ollama'
      remove_path_if_present '/var/lib/ollama'
      remove_path_if_present '/etc/systemd/system/ollama.service'
      remove_path_if_present '/usr/lib/systemd/system/ollama.service'
      remove_path_if_present '/usr/local/bin/ollama'
      remove_path_if_present '/usr/bin/ollama'
    fi
  fi
fi

remove_path_if_present "$install_root/.env.runtime"
remove_path_if_present "$install_root/.oload-install-state"
remove_path_if_present "$install_root/UNINSTALL-NOTES.txt"
remove_path_if_present "$install_root/oload.log"
rm -rf "$install_root"

printf '%s\n' 'Oload uninstall completed.'