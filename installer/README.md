# Oload Installer Bundles

Technical:

- These scripts package the app into standalone installer bundles, native wrappers, and live-update artifacts for local Oload deployments.

Layman's terms:

- This is the packaging layer that turns the app into something people can install, launch, and later update on their own machines.

## Administrator manual and self-service links

- Full install, setup, update, and uninstall manual: `docs/administrator-manual.md`
- GitHub release artifacts: https://github.com/snowolfex/olaod/releases
- Windows installer implementation: `installer/windows/install-oload.ps1`
- Linux installer implementation: `installer/linux/install-oload.sh`
- Windows uninstall implementation: `installer/windows/uninstall-oload.ps1`
- Linux uninstall implementation: `installer/linux/uninstall-oload.sh`

Operator quick reference:

- Default install roots are `%LOCALAPPDATA%\Oload` on Windows and `~/.local/share/oload` on Linux
- Both installers ask for port, Ollama target, update manifest settings, default language, optional bootstrap admin password, and optional session secret
- Packaged installs write `INSTALL-MANIFEST.txt`, `UNINSTALL-NOTES.txt`, `.oload-install-state`, `.oload-install-binding`, and `.env.runtime`
- The first user created after a clean install becomes the admin account
- Uninstall uses recorded install state before removing runtimes and always asks again before removing Ollama models

Run `npm run bundle:installers` from the repository root to generate fresh standalone installer bundles under `dist/installers`.
Run `npm run package:installers` to generate the standalone bundles plus native-style installer outputs under `dist/native`.
Run `npm run bundle:updates` to build live-patch packages plus a manifest under `dist/updates`.

Each bundle contains:

- a production-ready Next standalone payload in `app/`
- a local broker payload in `broker/` that now stays outside the app process so Admin can stop, restart, and later re-start the server on port `3000`
- a clean first-run `data/` set with no local users or chat history
- an OS-specific installer that checks for Node and Ollama, verifies common existing locations first, prompts for runtime settings plus dependency choices, and starts Oload
- an OS-specific start script you can use later after installation
- an OS-specific uninstall script or native uninstall hook that reads the recorded install choices before removing dependencies

Live update artifacts:

- `dist/updates/manifest.json`
- `dist/updates/windows/oload-update-<version>.zip`
- `dist/updates/linux/oload-update-<version>.tar.gz`

Live update configuration:

- set `OLOAD_UPDATE_MANIFEST_URL` to a hosted copy of `manifest.json`
- set `OLOAD_UPDATE_CHANNEL` if you want a value other than `stable`
- set `OLOAD_UPDATE_MANIFEST_PUBLIC_KEY` to the Ed25519 public key that verifies the hosted manifest signature
- the installer now prompts for all three values and writes them into `.env.runtime`
- on load, Oload now auto-checks the manifest at launch, caches the signed result, and shows admins an inline green/red update status card in Access with `Check now` and `Install update` controls
- installed launchers now also boot the local broker before the app when that payload is present, so the Access page can expose `Start app`, `Restart app`, and `Stop app` controls without losing the ability to bring the server back later

Technical:

- Live updates are manifest-driven, use SHA-256 package validation plus Ed25519-signed manifest verification, and patch the installed standalone payload in place rather than requiring a full reinstall.

Layman's terms:

- If you host update packages, the matching signed manifest, and the public key, admins can see whether the install is current and apply an update from inside Oload instead of reinstalling the whole app.

GitHub release publishing:

- the repository now includes `.github/workflows/release-updates.yml` so pushing a `v*` tag builds signed update packages, uploads them to GitHub Releases, and publishes `updates/stable/manifest.json` plus a versioned manifest copy to GitHub Pages
- set the GitHub Actions secret `OLOAD_UPDATE_MANIFEST_PRIVATE_KEY` to the Ed25519 private key used to sign the manifest
- point installed environments at the GitHub Pages manifest URL and give them the matching public key through `OLOAD_UPDATE_MANIFEST_PUBLIC_KEY`

Bundle targets:

- `dist/installers/windows/install-oload.ps1`
- `dist/installers/linux/install-oload.sh`

Native targets:

- `dist/native/OloadInstaller-linux-x64.run`
- `dist/native/OloadSetup.exe` when Inno Setup 6 is installed locally
- `dist/native/oload.iss` when the Windows installer definition is prepared but Inno Setup is not installed locally

First-run behavior:

- the first user created in the app becomes the admin account
- installers now collect a default language and write it to `OLOAD_DEFAULT_LANGUAGE`; the shipped default is `United States`, which appears immediately after `Auto` in the in-app selector and becomes the first-run selected language unless the operator chooses another option
- installers now also record dependency search results and the operator's choices in `.oload-install-state` plus a human-readable `UNINSTALL-NOTES.txt` file inside the install root
- `OLOAD_SESSION_SECRET` is generated automatically if you leave it blank during install
- `OLOAD_ADMIN_PASSWORD` is optional and only matters before local users exist
- if you want Google popup sign-in without a broker, keep the installed app on `http://localhost:3000` and ship a build that includes `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Dependency choice and uninstall behavior:

- Windows now exposes real installer dropdown choices for `Node.js / npm` and `Ollama`, and both default to an isolated Oload-managed runtime inside the install root instead of the shared machine copy
- Linux now verifies existing `node` and `ollama` locations in the shell installer, defaults to isolated Oload-managed runtimes for both, and still supports non-interactive `--node-mode` and `--ollama-mode` arguments for automation
- if an operator chooses an existing shared `Node.js` or `Ollama` install and the detected version is older than the isolated default Oload can install, setup now warns first and then asks again before keeping that older shared runtime
- the isolated Ollama path now uses the official release archives instead of the system installer or system service path, so it can run as a private Oload-managed runtime under the install root on both Windows and Linux
- when a shared local Ollama is already present on `127.0.0.1:11434` and the operator keeps the isolated default, setup automatically shifts the private Oload Ollama runtime to `http://127.0.0.1:11435` so the isolated runtime can run separately instead of attaching to the existing shared service
- both installers now write both `UNINSTALL-NOTES.txt` and `INSTALL-MANIFEST.txt`, recording what Oload installed, the exact install-root paths it owns, which dependency paths were pre-existing, and which runtime paths are safe for the uninstall flow to remove automatically
- uninstall now asks again before touching shared dependencies; for `Node.js / npm`, the flow warns when the runtime existed before Oload, and for `Ollama`, the flow always asks for confirmation before removing Ollama and again before removing all local models, with isolated Oload-managed Ollama models kept under the install root and removable separately from shared system model stores

Install branding and legal flow:

- both installers now open with a Wolfe Dezines-branded install splash that explains Oload as a private AI workspace and admin console before runtime setup begins
- Windows now uses a mandatory native Inno Setup EULA acceptance page plus a follow-on source-available licensing notice page before the operator reaches install options
- Linux now prints the same branded splash, requires explicit EULA acceptance before any installer network or runtime work begins, then displays the matching source-available licensing notice before continuing
- the shipped install-time legal model is intentionally described as source-available proprietary licensing, not open source, because the requested terms restrict commercial use, redistribution, derivative software, and competing software creation
- Wolfe Dezines publisher and copyright metadata are now written into the Windows native installer metadata and copied into installed legal notice files on both platforms

Installer language selection:

- the Windows native installer now exposes a real dropdown for every supported language in the app selector: `Auto`, `English (United States)`, `Arabic`, `Bengali`, `Chinese`, `English (United Kingdom / England)`, `Persian`, `French`, `Hindi`, `Japanese`, `Korean`, `Portuguese`, `Russian`, and `Spanish`
- the Linux shell installer accepts `--language <code>` or `-l <code>` with the same coverage; supported short codes are `auto`, `us`, `ar`, `bn`, `cn`, `gb`, `fa`, `fr`, `hi`, `ja`, `ko`, `pt`, `ru`, and `es`
- both installers persist the chosen value into `.env.runtime`, so the signed-out access flow, first account bootstrap, and later account defaults all start from the installed language choice

Technical:

- Installed builds keep the same local-first auth model as development builds, including first-user admin bootstrap and optional Google popup sign-in on the fixed localhost origin.
- Installer language selection is runtime-configurable and feeds the same canonical language enum used by the app, with both `united-states` and `united-kingdom` normalized back to shared English UI copy and Whisper language routing where needed.
- Installer dependency handling is now provenance-aware: setup records whether Node.js/npm and Ollama were verified as pre-existing or installed for Oload, persists the exact managed runtime and support-file paths under the install root, and uninstall reads that state back before attempting any dependency removal.
- Isolated Ollama installs now use embedded upstream release archives under `runtime/ollama`, and the launch scripts start that private runtime with a private `runtime/ollama-models` store when the configured `OLLAMA_BASE_URL` points at the local embedded service.

Layman's terms:

- The installed app still works like the local app: the first person to create an account becomes the admin, and Google sign-in only works if you built it for the standard localhost install URL.
- If you pick a language during install, that choice becomes the starting language the app shows before anyone changes their personal setting later.
- If Node.js or Ollama were already on the machine, the installer remembers that, warns if the shared version is older than the private default Oload can install, and asks again before keeping that older shared runtime. Ollama removal always asks twice because that can wipe downloaded models.

Linux note:

- the isolated Ollama install step uses the official upstream release archives and does not require the shared system service path; if you choose an existing shared Linux Ollama instead, the installer keeps respecting that system-managed path

Windows note:

- the native Windows wrapper uses Inno Setup 6 and passes the GUI-collected runtime settings into `install-oload.ps1` without reopening a terminal prompt sequence

Windows release build:

- install Inno Setup 6 with `winget install --id JRSoftware.InnoSetup --exact --accept-source-agreements --accept-package-agreements`
- the current machine-local compiler path is `C:\Users\snowo\AppData\Local\Programs\Inno Setup 6\ISCC.exe`
- run `cmd /c npm run package:installers` to rebuild the app bundle and compile `dist/native/OloadSetup.exe`
- if you need to compile only the Windows wrapper, run `"C:\Users\snowo\AppData\Local\Programs\Inno Setup 6\ISCC.exe" installer\windows\oload.iss`