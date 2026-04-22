# Oload Installer Bundles

Run `npm run bundle:installers` from the repository root to generate fresh standalone installer bundles under `dist/installers`.
Run `npm run package:installers` to generate the standalone bundles plus native-style installer outputs under `dist/native`.
Run `npm run bundle:updates` to build live-patch packages plus a manifest under `dist/updates`.

Each bundle contains:

- a production-ready Next standalone payload in `app/`
- a clean first-run `data/` set with no local users or chat history
- an OS-specific installer that checks for Node and Ollama, installs what is missing, prompts for runtime settings, and starts Oload
- an OS-specific start script you can use later after installation

Live update artifacts:

- `dist/updates/manifest.json`
- `dist/updates/windows/oload-update-<version>.zip`
- `dist/updates/linux/oload-update-<version>.tar.gz`

Live update configuration:

- set `OLOAD_UPDATE_MANIFEST_URL` to a hosted copy of `manifest.json`
- set `OLOAD_UPDATE_CHANNEL` if you want a value other than `stable`
- the installer now prompts for both values and writes them into `.env.runtime`
- on load, admin sessions check the manifest and can apply a live patch that restarts the local server automatically

Bundle targets:

- `dist/installers/windows/install-oload.ps1`
- `dist/installers/linux/install-oload.sh`

Native targets:

- `dist/native/OloadInstaller-linux-x64.run`
- `dist/native/OloadSetup.exe` when Inno Setup 6 is installed locally
- `dist/native/oload.iss` when the Windows installer definition is prepared but Inno Setup is not installed locally

First-run behavior:

- the first user created in the app becomes the admin account
- `OLOAD_SESSION_SECRET` is generated automatically if you leave it blank during install
- `OLOAD_ADMIN_PASSWORD` is optional and only matters before local users exist
- if you want Google popup sign-in without a broker, keep the installed app on `http://localhost:3000` and ship a build that includes `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Linux note:

- the Ollama install step uses the official `https://ollama.com/install.sh` script and may prompt for `sudo`

Windows note:

- the native Windows wrapper uses Inno Setup 6 and passes the GUI-collected runtime settings into `install-oload.ps1` without reopening a terminal prompt sequence

Windows release build:

- install Inno Setup 6 with `winget install --id JRSoftware.InnoSetup --exact --accept-source-agreements --accept-package-agreements`
- the current machine-local compiler path is `C:\Users\snowo\AppData\Local\Programs\Inno Setup 6\ISCC.exe`
- run `cmd /c npm run package:installers` to rebuild the app bundle and compile `dist/native/OloadSetup.exe`
- if you need to compile only the Windows wrapper, run `"C:\Users\snowo\AppData\Local\Programs\Inno Setup 6\ISCC.exe" installer\windows\oload.iss`