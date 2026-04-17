# oload

Premium mobile-first control plane for Ollama. The app is structured as a Next.js frontend plus a server-side gateway layer so browser clients never talk directly to the Ollama host.

GitHub repo description: Mobile-first Next.js control plane for Ollama with a server-side chat and model gateway, local auth, job operations, and workspace backup tooling.

## Highlights

- Server-side Ollama gateway for chat, model status, pull, and delete flows
- Local Ollama administration with CLI detection, process status, server start, runtime start and stop controls, and remote catalog browsing
- Mobile-first chat workspace with saved, pinned, archived, and restorable conversations
- Local user accounts, publisher-configured Google sign-in, signed sessions, role management, guarded user deletion with conversation-impact preview, and optional admin password protection
- Admin jobs surface with queue reorder, cancel, retry, analytics, ownership filters, and detail timelines
- Workspace backup export and restore flows for local users, conversations, activity, and job history
- Deterministic Playwright coverage for auth, chat, jobs, conversation lifecycle, and backup recovery flows

## AI Reference

The in-app Help page now includes a full AI reference section written in two layers:

- Technical terminology first: inference, prompts, assistant-style instructions, temperature, tokens, context windows, retrieval-augmented generation, local versus hosted providers, and runtime readiness.
- Plain-language translation second: each section explains the same concept in everyday terms and includes a short comparison so non-specialists can map the concept to something familiar.
- External references at the bottom: the Help page ends with a dedicated references container linking to free official docs and high-signal explainers.

Core AI concepts used in oload:

- Inference: sending a request to a model and receiving an output without retraining the model.
- Assistant style: the standing instruction layer that shapes tone, behavior, and constraints for new chats.
- Reply style: the sampling-temperature control that influences how tight or varied the response feels.
- Shared knowledge: indexed workspace context injected at request time to ground answers without changing model weights.
- Downloaded versus ready: a downloaded model exists on disk; a ready model is loaded into runtime memory and can respond immediately.

Free references surfaced in Help:

- Ollama documentation for local runtime concepts and setup.
- OpenAI developer docs for prompts, tokens, embeddings, tools, and streaming.
- Anthropic Claude docs for capabilities, tool use, context handling, and implementation flow.
- DeepLearning.AI short courses for practical AI engineering topics.
- Edward Donner for practical AI engineering and agentic-builder learning material.
- Simon Willison's LLM writing for high-signal independent analysis and practical tradeoffs.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Server routes under `src/app/api/*` with local JSON-backed persistence
- Playwright end-to-end coverage with isolated `.playwright-data` fixtures
- Tailwind CSS 4-based styling with a mobile-first control-plane UI

## Validation status

- `cmd /c npm run lint`
- `cmd /c npm run build`
- `cmd /c npm run test:e2e`

## Feature inventory

- Next.js 16 with App Router and TypeScript
- Mobile-first dashboard shell for chat, models, and administration
- Server-side Ollama status integration in `src/lib/ollama.ts`
- API route at `/api/ollama/status`
- Streaming chat route at `/api/ollama/chat`
- Model library routes at `/api/ollama/models` and `/api/ollama/models/pull`
- Local Ollama admin routes at `/api/ollama/catalog`, `/api/ollama/server`, and `/api/ollama/runtime`
- Combined model library controls that show available, installed, and currently running models with pull, start, stop, and delete actions
- Local conversation persistence via `/api/conversations`
- Optional admin auth routes at `/api/auth/session`, `/api/auth/login`, and `/api/auth/logout`
- Local activity log via `/api/admin/activity`
- Local user accounts via `/api/users/session`, `/api/users/register`, `/api/users/login`, and `/api/users/logout`
- Google sign-in via `/api/users/google/token`, with legacy redirect routes at `/api/users/google/start` and `/api/users/google/callback`
- Admin role management and guarded local account deletion with per-user conversation counts via `/api/users`, `/api/users/[id]`, and `/api/users/[id]/role`
- Local job history via `/api/admin/jobs`
- Admin-only workspace backup export and restore via `/api/admin/system/backup`
- Model delete operations are also recorded in local job history with duration metadata
- The recent-jobs panel auto-refreshes while privileged operations are still running
- The jobs API supports server-side status filtering and response limits for the admin panel
- The jobs API also supports server-side type filtering for pull versus delete activity
- Individual jobs now expose a detail view with their recorded progress trail
- Pull jobs now retain structured progress metadata such as percentage and byte counts for the detail timeline
- Job lifecycle now distinguishes queued work from actively running work in the API and admin panel
- Running and queued pull jobs can now be cancelled from the selected-job panel through a server-side cancel route
- Failed or cancelled pull jobs can be retried directly from the selected-job panel using the same streamed pull path
- Pull execution is now single-flight on the server, so later pull requests stay queued until the active pull finishes or is cancelled
- Queued pull jobs can also be cancelled in bulk from the jobs panel through a server-side bulk action route
- Queued pull jobs can be moved earlier or later from the selected-job panel to reprioritize the server-side pull queue
- Queued pull jobs now show queue position directly in the jobs list, with inline move controls for faster reprioritization
- Failed or cancelled pull jobs can now be retried through a dedicated server-side retry route instead of relying on an open client stream
- Failed or cancelled pull jobs can also be re-queued in bulk from the jobs panel through the bulk operator route
- The jobs list is grouped by lifecycle section so queued, running, failed, cancelled, and completed work are easier to scan
- Bulk retry and bulk queued-cancel actions now use a lightweight two-step confirmation in the jobs panel
- Completed and cancelled lifecycle sections are collapsible, and start collapsed by default to keep active work in view
- Jobs section collapse preferences are remembered in browser storage per signed-in user
- Single-job cancel, retry, and queue reorder actions now surface inline result summaries in the jobs panel
- The currently selected job is also remembered per signed-in user and restored after refresh when still available
- The jobs header now shows server-side analytics for average pull wait, retry volume, and terminal failure rate
- Operators can now expand or collapse all lifecycle sections at once from the jobs panel
- Jobs analytics now follow the active type filter so pull-only and delete-only views report their own metrics
- The current selection is pinned above the jobs list so it remains visible even when filters or list order move it out of view
- The jobs summary cards now also follow the active type filter for a consistent header view
- Average pull wait and failure rate now include lightweight improving, worsening, or steady trend cues
- Jobs analytics now explain when metrics are unavailable because of filters, insufficient history, or missing terminal data
- When the selected job is still in the current list, the pinned strip can jump directly to its row and expand the relevant section
- Retry volume now includes the same improving, worsening, or steady trend cues as the other analytics cards
- The queued, running, failed, and completed summary cards now explain zero states for the current filter scope
- Jumping from the pinned strip now briefly highlights the target job row so operators can reacquire it immediately
- When the selected job is outside the current list, the pinned strip now shows compact lifecycle counts for the visible view
- The pinned selection now shows when its detail payload was last refreshed
- Analytics cards now show a relative-time comparison window for recent versus prior trend calculations
- The pinned selection now also shows relative refresh age plus a fresh, aging, or stale status badge
- The pinned selection now includes a direct refresh action for the selected job detail
- The jobs list now shows its own last-refresh time and freshness badge for manual and automatic updates
- The jobs list now also tracks when the visible list last actually changed, separate from refresh time
- The jobs footer now highlights when the list changed after the last operator-triggered manual refresh
- The pinned strip now recommends a manual detail refresh when the selected job is stale while the jobs list is still actively changing
- When the selected job is outside the current list, the pinned strip now explains whether its detail refresh is older or newer than the visible list timing
- The pinned strip can now narrow filters to reveal an out-of-view selected job, or explain when it still falls outside the current 12-job list
- Operators can now choose how many recent jobs the admin panel loads, and that snapshot size is remembered per signed-in user
- The jobs status filters now include a direct cancelled-only view, and pinned cancelled jobs reveal into that filtered list
- The jobs summary cards now include cancelled work so terminal outcomes are visible without opening the grouped list
- The operator UI now labels successful terminal jobs as Succeeded so they read cleanly beside Cancelled
- Selected-job detail refreshes now summarize what changed and mark newly added timeline entries
- Selected-job timeline entries now highlight lifecycle transitions with status chips and tinted rows
- Jobs summary cards now double as one-tap status pivots, with active-state highlighting and toggle-back to all statuses
- Queued job timelines now call out movement earlier or later in the queue, including next-to-run promotion cues
- The jobs header now includes a compact terminal-only pivot for Failed, Cancelled, and Succeeded views
- The jobs header now also includes a compact active-only pivot for Queued and Running views
- The pinned selection strip now surfaces duration and latest-update delta chips after detail refreshes
- The quick-pivot header now shows whether the current filter is mixed, active-only, or terminal-only, and pinned queued jobs show queue-position deltas
- The quick-pivot header now includes a one-tap reset, and the pinned selection strip now surfaces status-transition delta chips
- The job-type filter now shows mixed, pull-only, or delete-only scope, and the pinned strip now shows refresh entry-count deltas
- The jobs header now includes a clear-all-filters control, and pinned pull selections now surface meaningful progress-percent jumps
- The jobs header now includes a combined scope summary line, and pinned pull selections now surface byte-transfer deltas between refreshes
- The jobs panel now also exposes a single current-scope badge, and pinned pull selections now surface total-byte target changes between refreshes
- The current-scope badge can now be copied directly, and pinned pull selections now surface transfer-completion or target-revision state chips
- Pinned selections now show when scope changed after the job was pinned, and pull refreshes can now surface idle-transfer states
- Pinned jobs can now be re-pinned to the current scope, and pull selections show whether they are original runs or retries
- Pinned jobs now show whether they belong to the current user, and the selected-job timeline can be filtered to new entries since the last refresh
- The jobs header now supports an ownership pivot, and selected-job timelines now support all, new, or changed-only views
- Bulk retry and queued-cancel actions now follow the active ownership scope, and ownership matching now uses the same display-name identity stored on jobs
- The jobs header now shows an explicit bulk-action scope summary with queued and retryable counts for the current ownership view
- Pinned and selected jobs now show whether they are inside the current scope and whether they participate in the current pull bulk-action states
- Selected-job retry, cancel, and reorder controls now disable themselves when the active scope excludes that job
- Lifecycle section headers now show how many visible jobs belong to the current operator, so mixed operator queues are easier to scan
- Individual job rows now include compact ownership chips so mixed operator queues are readable at a glance
- Lifecycle section headers now include short queue-health summaries such as who is next to run or how many retryable pulls are in that section
- Jobs summary cards now also show how much of each visible status bucket belongs to the current operator
- Saved chats can now be searched in-place, and the active conversation title can be renamed directly from the chat workspace
- The chat workspace now includes quick-start prompt presets and lightweight saved-chat state chips for faster mobile navigation
- The chat composer now auto-grows for longer prompts and supports Ctrl+Enter or Cmd+Enter to send
- Prompt presets now live in a compact toggleable drawer so mobile chat keeps fast starts without permanently consuming composer space
- The chat workspace rail can now be collapsed on small screens to prioritize message space without changing the desktop layout
- The mobile chat rail now remembers its open or closed state per user between visits
- The chat prompt drawer now also remembers its open or closed state per user between visits
- Saved conversations can now be pinned per user, and pinned chats stay sorted to the top of the rail
- The saved-chat rail now supports a pinned-only filter plus a quick pin count summary
- The pinned-only saved-chat filter now remembers its state per user between visits
- The saved-chat rail now separates pinned and recent conversations into distinct sections for faster scanning
- Recently updated conversations in the saved-chat rail now get lightweight recency chips so active threads stand out faster
- Recent unpinned conversations are now grouped into Today, Yesterday, This week, and Older buckets for faster scanning
- Saved conversations now show stronger live-activity cues when a thread is responding or was just updated by the latest reply
- Saved conversations can now be archived and restored, with archived threads kept in a separate rail section that stays out of the main chat flow by default
- Archive and restore actions now create explicit activity-log events, and archived active threads show a dedicated state cue in the chat header
- The archived chat section now supports two-step bulk cleanup for empty archived threads and archived threads older than 30 days
- Archived cleanup retention is now adjustable per user, with 7, 14, 30, and 90 day thresholds remembered between visits
- Archived conversations can now be restored in bulk from the current archived view using the same two-step confirmation pattern as cleanup actions
- Archived chat browsing now includes persisted filters for all, empty, and age-qualified archived threads
- Archived bulk cleanup actions now also respect the current archived view, so empty and age-based cleanup only affect the visible filtered archive slice
- Archived chat browsing now also supports persisted sort modes for newest archived, oldest archived, and recent activity
- Archived chat rows now show archive-age and last-activity chips so the current sort mode is easier to read at a glance
- Archived chats can now be selected in bulk so restore and cleanup actions can target an exact archived subset instead of the whole visible view
- Archived controls now include a plain-language summary of the active archive filter, sort order, and selected bulk-action scope
- Archived selection now includes quick shortcuts for empty chats and the active retention-age bucket to speed up bulk restore or cleanup flows
- Archived rows now support keyboard navigation and selection, including arrow-key movement, space-to-select, and enter-to-open
- Archived keyboard controls now also support select-all-visible and clear-selection shortcuts
- Archived keyboard controls now also support subset shortcuts for empty and age-qualified chats, and archived rows expose clearer ARIA selection state
- Archived archive-control chips and bulk actions now expose pressed state and live status updates for better assistive-technology support
- Jobs filters, summary cards, timeline chips, and bulk-action confirmations now expose pressed state and live status feedback for assistive technologies
- Job section headers and job rows now support keyboard navigation, including arrow-key movement and keyboard pinning of the selected job
- Jobs now include operator shortcut scopes like my queued, my failed pulls, pull queue only, and running pulls, and the model library controls now expose clearer accessibility labels and live pull-log updates
- The jobs surface now also supports keyboard shortcuts for refresh, pinned-detail refresh, jump-to-pinned-job, and clear-selection flows
- The model library now supports client-side search with a visible filtered-count summary for faster local model triage
- The model library now also supports persisted running-only filtering, size and runtime badges, and operator-controlled sorting by freshness, name, or size
- Jobs analytics now explicitly show whether metrics are scoped to all operators or only the current user
- Analytics helper text now reads cleanly in both shared and personal scopes instead of reusing awkward shared-view phrasing
- Analytics cards now also show whether the visible jobs scope changed just now, changed after manual refresh, or has been stable for a while
- Jobs summary cards now show per-status deltas against the last manual refresh when the current jobs scope still matches that snapshot
- Lifecycle section headers now mirror those manual-refresh deltas so grouped job lists show the same movement cues as the summary cards
- Lifecycle section insight text now also explains the net queued, running, failed, cancelled, or succeeded shift since the last manual refresh
- The jobs header now supports a compact hint mode that swaps helper paragraphs for small hint buttons and remembers the preference per user
- The pinned refresh control now escalates to a clearer Refresh now action when that stale-detail recommendation appears
- VS Code task for `npm run dev`

## Local development

1. Copy `.env.example` to `.env.local` if you need a non-default Ollama host.
2. For a hosted auth-broker release, set `AUTH_BROKER_BASE_URL` to your broker domain so the app uses the brokered Google flow.
3. For a publisher-owned zero-config Google sign-in release without a broker, build the app with `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set so the official Google button is active for every downloader.
4. If you still need the older redirect-based Google OAuth flow for a custom deployment, also set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optionally `GOOGLE_REDIRECT_URI`.
5. The current UI keeps Google sign-in hidden unless `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH_UI=1` is set; the implementation remains in place behind that flag.
6. Start Ollama locally or make sure the configured host is reachable.
7. Run `npm run dev` or use the `dev server` VS Code task.
8. Open `http://localhost:3000`.

## Google sign-in setup

1. For the strongest downloadable-app story, use the broker scaffold under [broker/README.md](broker/README.md) and host it on a stable domain such as `https://auth.example.com`.
2. Set `AUTH_BROKER_BASE_URL=https://auth.example.com` in the app so broker mode takes priority over direct Google sign-in.
3. In Google Cloud, register one OAuth web app for the broker and add `https://auth.example.com/api/google/callback` as the authorized redirect URI.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the broker service, not on every downloader machine.
5. For the non-broker direct mode, add the browser origin you plan to ship, such as `http://localhost:3000`, to Authorized JavaScript origins and build the app with `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
6. The first Google account to sign into an empty workspace becomes the admin account. Later Google users are created as operators.
7. If a local username or email already matches a Google account address, the app blocks automatic linking to avoid taking over an existing local account.
8. Broker mode is the better fit for downloadable installs because the app no longer needs to own the Google callback URL itself.

## Auth broker

1. The app-side broker routes live under `/api/users/google/broker/*` and proxy to the hosted broker configured by `AUTH_BROKER_BASE_URL`.
2. A runnable broker scaffold is included under [broker/README.md](broker/README.md).
3. Start it locally with `cmd /c npm run broker:dev` after configuring the broker env.
4. The included broker uses an in-memory request store for short-lived login requests; production should replace that with Redis or another shared store.

## Local test access on this machine

1. For desktop testing on this PC, run `cmd /c npm run dev` and open `http://localhost:3000` in your browser.
2. For production-style local verification on this PC, run `cmd /c npm run build` and then `cmd /c npm run start`, then open `http://localhost:3000`.
3. While signed in as an admin, use the Workspace backup section in the user panel to export or restore the local users, conversations, activity log, and job history for this machine.
4. Backup files are sensitive: they include local account metadata plus the password hashes and salts required to preserve sign-in access across restore.
5. Restore now requires an explicit in-app acknowledgement before the confirm action is enabled because the selected backup overwrites the current local workspace state, and the selected file can be cleared before confirm.
6. Restore flows now surface what happened to the current session, including when a backup signs the current user out or downgrades that user from admin to a lower role.

## Android testing on your local Wi-Fi

1. Make sure the phone and this PC are on the same Wi-Fi network.
2. Start the app with `cmd /c npm run dev:lan` or use the `dev server (LAN)` VS Code task.
3. On this machine right now, the Wi-Fi IP is `10.0.0.90`, so the Android browser URL is `http://10.0.0.90:3000`.
4. If Windows Defender prompts for network access, allow Node.js on private networks.
5. Keep Ollama running on this PC; the Android browser only talks to the web app, and the web app talks to Ollama server-side.
6. If the phone cannot connect, confirm the PC still has the same Wi-Fi IP and that port `3000` is not blocked by firewall or VPN software.

## Smoke tests

1. Install the Chromium browser once with `npx playwright install chromium`.
2. Run the smoke suite with `cmd /c npm run test:e2e`.
3. The Playwright config builds once, starts an isolated server on `http://127.0.0.1:3101`, and automatically switches the app to `.playwright-data` so test runs do not touch the normal local `data/` files.
4. Playwright test mode also uses deterministic pull scenarios for `playwright:*` model names so queue and retry workflows can be exercised without mutating the real Ollama host.
5. Playwright test mode also uses deterministic streamed chat prompts for `playwright:reply` and `playwright:stop` so browser chat tests do not depend on a live Ollama text stream.
6. Current browser coverage includes the main shell, model-library controls, deterministic direct model-delete success and failure audit coverage, signed-in chat streaming completion and stop flows, first-user admin auth, seeded jobs access, jobs queue reorder plus direct pull-request, forced-failure, bulk queued-cancel, and failed-pull retry flows with activity-log coverage, saved conversation rename and pin/archive lifecycle flows, archived conversation filter/selection/restore flows, admin role-management updates plus self-role and guarded user-deletion flows with saved-conversation cleanup and activity-log coverage, workspace backup export plus selected-backup clear, restore-acknowledgement, and activity-log coverage, and restore recovery when a backup clears or downgrades the current session.

Saved conversations are stored locally in `data/conversations.json`.
Audit-style activity events are stored locally in `data/activity-log.json`.
Local user accounts are stored in `data/users.json`.
Model job history is stored in `data/job-history.json`.
If you set `OLOAD_ADMIN_PASSWORD` and `OLOAD_SESSION_SECRET`, model pull and delete operations require admin sign-in.
Job entries track operation type, operator, timing, and terminal status for recent privileged model changes.

On Windows, this workspace is set up to work cleanly with `cmd /c npm ...` for task and terminal execution.
For Android or other LAN devices, prefer `cmd /c npm run dev:lan` so Next.js binds to `0.0.0.0` instead of only `localhost`.

## Installer bundles

1. Build fresh installer bundles with `cmd /c npm run bundle:installers`.
2. The generated outputs land in `dist/installers/windows` and `dist/installers/linux`.
3. Each bundle includes a standalone production app payload plus an OS-specific installer that checks Node, installs a current Node runtime when needed, checks Ollama, installs Ollama when needed, prompts for runtime settings, and starts the app.
4. The Windows entry point is `dist/installers/windows/install-oload.ps1`.
5. The Linux entry point is `dist/installers/linux/install-oload.sh`.
6. The bundle intentionally ships with clean empty data files, so no local users, chats, activity, or job history from this workspace are carried into new installs.
7. The first user created in a fresh installed app becomes the admin user.
8. On Linux, the Ollama install step uses the official installer script and may prompt for `sudo`.

## Native installer outputs

1. Build native-style outputs with `cmd /c npm run package:installers`.
2. The Linux deliverable is a self-extracting `dist/native/OloadInstaller-linux-x64.run`.
3. The Windows deliverable is `dist/native/OloadSetup.exe` when Inno Setup 6 is available on the build machine.
4. If Inno Setup is not installed, the packaging step still emits `dist/native/oload.iss`, which is the ready-to-compile Windows installer definition.
5. The Windows setup wrapper captures the install folder, port, Ollama URL, optional bootstrap admin password, optional session secret, LAN binding choice, and start-now choice in the normal setup flow, then passes them into the packaged PowerShell bootstrap.

## Windows release build

1. Install Inno Setup 6 with `winget install --id JRSoftware.InnoSetup --exact --accept-source-agreements --accept-package-agreements`.
2. On this machine, the compiler was installed at `C:\Users\snowo\AppData\Local\Programs\Inno Setup 6\ISCC.exe`.
3. Run `cmd /c npm run package:installers` from the repo root.
4. That command rebuilds the standalone app, refreshes `dist/installers`, generates the Linux `.run`, and compiles `dist/native/OloadSetup.exe` when `ISCC.exe` is available.
5. If Windows packaging ever falls back again, the compile-ready installer definition remains at `dist/native/oload.iss` and can be compiled manually with `"C:\Users\snowo\AppData\Local\Programs\Inno Setup 6\ISCC.exe" installer\windows\oload.iss`.

## Environment

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLOAD_ADMIN_PASSWORD=
OLOAD_SESSION_SECRET=
AUTH_BROKER_BASE_URL=
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH_UI=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

## Next build targets

1. Shared workspaces, quotas, and richer admin analytics
2. Deployment hardening and remote backup targets
3. Broader operator actions such as queue reordering and bulk retry/cancel workflows
