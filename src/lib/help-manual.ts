export type HelpContext = "chat" | "access" | "models" | "jobs" | "activity";

export type HelpSection = {
  id: string;
  context: HelpContext;
  title: string;
  summary: string;
  body: string[];
  keyPoints: string[];
};

export type HelpGlossaryEntry = {
  term: string;
  definition: string;
};

export type HelpHint = {
  id: string;
  sectionId: string;
  title: string;
  summary: string;
};

export const HELP_MANUAL_TITLE = "oload Operator Guide";
export const HELP_MANUAL_SUBTITLE = "Operations manual for chat, access control, model runtime, jobs, activity auditing, and service administration.";

export const helpSections: HelpSection[] = [
  {
    id: "chat-overview",
    context: "chat",
    title: "Chat Operations",
    summary: "Use the chat lane to compose prompts, select a provider and model, manage conversation state, and review streamed replies through the shared AI gateway.",
    body: [
      "The chat lane is the operator-facing inference workspace. Every prompt is sent through the shared gateway, which normalizes local and hosted providers behind one request path.",
      "Conversation state is scoped per signed-in local user. Saved threads preserve prompt history, model selection, provider selection, temperature, and system prompt settings so a session can be resumed without reconstructing the prior operating state.",
      "When shared knowledge is enabled, the gateway performs retrieval-augmented generation. Matching workspace context is inserted at prompt time without modifying the base model weights.",
    ],
    keyPoints: [
      "Use New chat to isolate a task from prior context.",
      "Use archived conversations for completed or low-frequency work.",
      "Use Stop to terminate an in-flight stream without losing the partial reply already received.",
      "Select a provider and model before sending if you need deterministic comparison across runs.",
    ],
  },
  {
    id: "conversation-management",
    context: "chat",
    title: "Conversation Management",
    summary: "Saved chat controls manage persistence, pinning, archival, naming, and retrieval of conversation records.",
    body: [
      "Pinned conversations are intended for active working sets. They remain at the top of the rail so operationally important threads are not displaced by routine activity.",
      "Archived conversations remain stored but are removed from the primary working rail. This is a lifecycle control, not a deletion event.",
      "Conversation titles should describe the task or outcome, not just the opening prompt. Clear titles improve retrieval and reduce operator ambiguity during later review.",
    ],
    keyPoints: [
      "Use Save title to rename the active thread with an operational label.",
      "Use Archive to remove a thread from the current working set without deleting it.",
      "Use Delete only when the record is no longer needed.",
      "Pinned-only filtering is useful when a user maintains a stable set of reference conversations.",
    ],
  },
  {
    id: "access-control",
    context: "access",
    title: "Access Control and Identity",
    summary: "The access lane governs local user identity, role assignment, session persistence, backup safety, and hosted-provider credential administration.",
    body: [
      "Local identity is the primary authority for workspace scoping. Conversations, role-based controls, and audit-relevant account actions are all evaluated against the signed-in local user.",
      "Administrative role management includes explicit guardrails to prevent self-demotion and last-admin removal. Those controls are intended to preserve recoverable control of the local installation.",
      "Hosted-provider credentials are encrypted at rest when stored locally. Environment variables still take precedence so deployments can externalize secrets when required by policy.",
    ],
    keyPoints: [
      "Use Sign in for an existing local user and Create account for a new local identity.",
      "Use Refresh users before making role decisions if multiple operators have changed accounts recently.",
      "Treat backup export and restore operations as sensitive administrative actions.",
      "Use provider key controls only from an administrator session.",
    ],
  },
  {
    id: "provider-configuration",
    context: "access",
    title: "Hosted Provider Configuration",
    summary: "Hosted provider controls define whether Anthropic and OpenAI are eligible routing targets inside the shared gateway.",
    body: [
      "A hosted provider is considered configured when a valid API credential is available either through encrypted local storage or through environment-based secret injection.",
      "Provider configuration affects model availability in the chat lane. An unconfigured provider is intentionally left unavailable so the operator does not attempt a route that cannot authenticate upstream.",
      "When troubleshooting hosted traffic, validate three things in order: credential presence, upstream reachability, and any custom base URL override.",
    ],
    keyPoints: [
      "Save key writes the encrypted local credential for the selected provider.",
      "Clear stored key removes the locally stored credential but does not affect environment-defined secrets.",
      "Refresh providers re-reads the effective provider configuration state.",
      "Provider status in chat should be treated as the runtime routing view, not just a configuration form state.",
    ],
  },
  {
    id: "knowledge-operations",
    context: "access",
    title: "Shared Knowledge Operations",
    summary: "Shared knowledge is the reusable context layer for retrieval-augmented generation, overlap detection, and operator-managed grounding data.",
    body: [
      "Knowledge entries are indexed records that can be filtered by provider and model scope. They are intended to improve answer quality through prompt-time retrieval rather than model retraining.",
      "Overlap checks identify near-duplicate notes before they degrade retrieval quality. Excess duplication tends to crowd the ranking layer and produce redundant grounding context.",
      "The retrieval debugger is a validation tool. It explains which indexed records matched a prompt and why they ranked the way they did.",
    ],
    keyPoints: [
      "Use Save knowledge entry to create or update a reusable context record.",
      "Use Refresh knowledge after bulk edits or restores.",
      "Use Cancel edit to exit an in-progress record revision without writing changes.",
      "Use the retrieval debugger to validate scope filters and ranking behavior before blaming the chat layer.",
    ],
  },
  {
    id: "model-library",
    context: "models",
    title: "Model Library and Runtime Control",
    summary: "The model operations lane is the local runtime control surface for installation state, readiness state, service health, and library actions.",
    body: [
      "Downloaded means the model weights are present on disk. Ready means the model is active in runtime memory and can answer requests immediately. Those are separate states and should be treated separately in operational guidance.",
      "The local Ollama service is the control-plane dependency for download, runtime start, runtime stop, and deletion operations. If the service is unavailable, local model actions should be treated as blocked rather than partially available.",
      "Hosted providers appear in the same operations lane because the application routes chat through a unified gateway. Even so, hosted providers do not expose local runtime controls such as download or memory residency.",
    ],
    keyPoints: [
      "Use Start Ollama when the local service is offline and local model work is required.",
      "Use Refresh to resynchronize the library, runtime state, and service status.",
      "Use Make ready to load a downloaded model into active runtime memory.",
      "Use Delete only when reclaiming storage or removing an obsolete local model.",
    ],
  },
  {
    id: "jobs-and-queue",
    context: "jobs",
    title: "Jobs, Queueing, and Progress Tracking",
    summary: "The jobs lane is the historical and operational record for queued, active, completed, failed, retried, and canceled model work.",
    body: [
      "Queue control is distinct from library state. The jobs lane should be used when the operator needs to reason about sequencing, retry lineage, terminal outcomes, or scoped bulk actions.",
      "Manual refresh establishes the operator's current baseline for delta summaries. When list state continues changing after that point, stale-detail guidance indicates that a manual detail refresh may be required before making a judgment call.",
      "Ownership filters and quick pivots are there to reduce accidental broad actions. Always verify scope before issuing queue-wide cancellation or retry commands.",
    ],
    keyPoints: [
      "Use quick pivots for fast state isolation, then validate filters before acting.",
      "Use the pinned job detail view when queue state is changing rapidly.",
      "Use manual refresh before relying on delta badges as a stable comparison point.",
      "Use retry and reorder controls only when the current scope explicitly matches the intended job set.",
    ],
  },
  {
    id: "activity-audit",
    context: "activity",
    title: "Activity and Audit Trail",
    summary: "The activity lane records operator-significant events across chat, identity, model control, backup, and administrative workflows.",
    body: [
      "Activity is not a duplicate jobs list. It is the cross-functional audit stream used to answer what changed, when it changed, and whether the event carried informational or warning-level significance.",
      "Warnings should be investigated first because they typically indicate a blocked control path, an upstream failure, or a sensitive action that requires operator validation.",
      "Activity records are most useful when correlated with the originating control surface. Treat the lane as an audit and traceability view rather than a primary operating console.",
    ],
    keyPoints: [
      "Use Activity after administrative actions that need audit confirmation.",
      "Cross-check Activity with Jobs when a model action also has queue history.",
      "Use warning-level entries as the first stop for troubleshooting.",
      "Do not use the activity lane as a substitute for scoped operational detail in the other panels.",
    ],
  },
  {
    id: "mobile-gesture-help",
    context: "chat",
    title: "Desktop and Mobile Help Gestures",
    summary: "Contextual help uses hover on desktop and long-press on mobile so operators can request guidance without leaving their current workflow.",
    body: [
      "On desktop browsers, hovering a tagged control opens a contextual help card positioned near the target control. The card remains visible while the pointer is within the control or the card itself.",
      "On touch devices, pressing and holding a tagged control for roughly two seconds opens the same contextual help card. This avoids occupying the screen with persistent hint text while preserving discoverability.",
      "The contextual help card contains a direct link into the full help manual. That link is intended for deeper review, while the card summary is intended for quick operational orientation.",
    ],
    keyPoints: [
      "Hover for contextual help on desktop.",
      "Press and hold for contextual help on mobile.",
      "Tap the help link in the card to open the matching manual section.",
      "Tap the card itself on mobile to dismiss it without navigation.",
    ],
  },
];

export const helpGlossary: HelpGlossaryEntry[] = [
  {
    term: "Downloaded model",
    definition: "A model whose weights are stored locally on disk but are not necessarily loaded into runtime memory.",
  },
  {
    term: "Ready model",
    definition: "A downloaded model that is currently loaded into memory and immediately available for prompt execution.",
  },
  {
    term: "Inference",
    definition: "The process of sending a prompt to a model and receiving an output without altering the model weights.",
  },
  {
    term: "Retrieval-augmented generation",
    definition: "A prompt-time grounding method that injects relevant indexed context into a request without retraining the model.",
  },
  {
    term: "Operator scope",
    definition: "The currently active set of records or actions constrained by ownership filters, lifecycle filters, or other explicit UI scoping controls.",
  },
  {
    term: "Audit trail",
    definition: "A structured event history used to confirm that an action occurred and to reconstruct control-plane activity over time.",
  },
];

export const helpHints: Record<string, HelpHint> = {
  "nav.chat": {
    id: "nav.chat",
    sectionId: "chat-overview",
    title: "Open the chat lane",
    summary: "Switches the primary workspace to prompt composition, saved conversations, provider selection, and live reply streaming.",
  },
  "nav.admin": {
    id: "nav.admin",
    sectionId: "access-control",
    title: "Open the admin lane",
    summary: "Switches the workspace to operator controls for users, models, jobs, activity, backup, providers, and shared knowledge.",
  },
  "nav.help": {
    id: "nav.help",
    sectionId: "mobile-gesture-help",
    title: "Open the help manual",
    summary: "Shows the full operator guide with cross-linked procedures, terminology, and downloadable PDF export.",
  },
  "command.hide": {
    id: "command.hide",
    sectionId: "mobile-gesture-help",
    title: "Hide the command deck",
    summary: "Collapses the floating command summary so more screen area is available for the active workspace.",
  },
  "command.show": {
    id: "command.show",
    sectionId: "mobile-gesture-help",
    title: "Restore the command deck",
    summary: "Reopens the floating command summary after it has been collapsed into the radar beacon.",
  },
  "command.signout": {
    id: "command.signout",
    sectionId: "access-control",
    title: "Sign out the current user",
    summary: "Ends the current local session and returns the workspace to the access gate.",
  },
  "command.quick-help-toggle": {
    id: "command.quick-help-toggle",
    sectionId: "mobile-gesture-help",
    title: "Toggle quick help popovers",
    summary: "Enables or disables the short contextual help cards shown on desktop hover and mobile long-press. The first quick-help card in each session stays open until you dismiss it or turn quick help off; after that, desktop cards remain briefly visible and can be muted per control, while mobile long-press help remains available whenever quick help is enabled.",
  },
  "command.theme-select": {
    id: "command.theme-select",
    sectionId: "mobile-gesture-help",
    title: "Choose a local theme",
    summary: "Applies the selected device-local theme without changing account or workspace data.",
  },
  "admin.users": {
    id: "admin.users",
    sectionId: "access-control",
    title: "Open the users and backup tab",
    summary: "Shows local identity controls, role management, provider configuration, shared knowledge, and workspace backup tools.",
  },
  "admin.models": {
    id: "admin.models",
    sectionId: "model-library",
    title: "Open the models tab",
    summary: "Shows local model inventory, service health, hosted AI service status, and runtime actions.",
  },
  "admin.jobs": {
    id: "admin.jobs",
    sectionId: "jobs-and-queue",
    title: "Open the jobs tab",
    summary: "Shows queue history, lifecycle sections, retries, reorder controls, and selected-job detail.",
  },
  "admin.activity": {
    id: "admin.activity",
    sectionId: "activity-audit",
    title: "Open the activity tab",
    summary: "Shows the audit stream for operationally significant events across the control plane.",
  },
  "chat.toggle-controls": {
    id: "chat.toggle-controls",
    sectionId: "chat-overview",
    title: "Toggle the chat control rail",
    summary: "Shows or hides the chat-side controls on mobile so the composer and transcript can use more vertical space.",
  },
  "chat.new": {
    id: "chat.new",
    sectionId: "conversation-management",
    title: "Start a new conversation",
    summary: "Clears the active working thread so the next prompt starts from a fresh conversation state.",
  },
  "chat.filter.pinned": {
    id: "chat.filter.pinned",
    sectionId: "conversation-management",
    title: "Filter to pinned conversations",
    summary: "Limits the visible conversation rail to the pinned working set for faster retrieval.",
  },
  "chat.filter.archived": {
    id: "chat.filter.archived",
    sectionId: "conversation-management",
    title: "Toggle archived conversations",
    summary: "Shows or hides archived conversation records without changing their persisted state.",
  },
  "chat.title.save": {
    id: "chat.title.save",
    sectionId: "conversation-management",
    title: "Save the active conversation title",
    summary: "Updates the title metadata for the active conversation record.",
  },
  "chat.archive": {
    id: "chat.archive",
    sectionId: "conversation-management",
    title: "Archive or restore the active conversation",
    summary: "Moves the active conversation in or out of the archived lifecycle without deleting it.",
  },
  "chat.pin": {
    id: "chat.pin",
    sectionId: "conversation-management",
    title: "Pin or unpin a conversation",
    summary: "Adds or removes a conversation from the pinned working set at the top of the rail.",
  },
  "chat.delete": {
    id: "chat.delete",
    sectionId: "conversation-management",
    title: "Delete a conversation",
    summary: "Permanently removes the selected conversation record from local storage.",
  },
  "chat.send": {
    id: "chat.send",
    sectionId: "chat-overview",
    title: "Send the active prompt",
    summary: "Submits the current prompt through the shared AI gateway using the selected provider, model, and chat settings.",
  },
  "chat.stop": {
    id: "chat.stop",
    sectionId: "chat-overview",
    title: "Stop reply streaming",
    summary: "Cancels the active stream request while retaining the partial reply already received.",
  },
  "chat.clear": {
    id: "chat.clear",
    sectionId: "conversation-management",
    title: "Clear the current transcript",
    summary: "Clears the current conversation contents while preserving the ability to continue working in the same interface.",
  },
  "chat.prompt-preset": {
    id: "chat.prompt-preset",
    sectionId: "chat-overview",
    title: "Apply a prompt preset",
    summary: "Copies a prepared task prompt into the composer so the operator can start from a known workflow template.",
  },
  "chat.use-knowledge": {
    id: "chat.use-knowledge",
    sectionId: "knowledge-operations",
    title: "Toggle shared knowledge retrieval",
    summary: "Adds matching shared knowledge records to the prompt at send time without changing the selected model itself.",
  },
  "chat.temperature": {
    id: "chat.temperature",
    sectionId: "chat-overview",
    title: "Adjust response variation",
    summary: "Changes sampling temperature so replies become tighter at lower values and more varied at higher values.",
  },
  "chat.system-prompt": {
    id: "chat.system-prompt",
    sectionId: "chat-overview",
    title: "Edit the system prompt",
    summary: "Sets the standing instruction block sent with each request for the active conversation.",
  },
  "access.logout": {
    id: "access.logout",
    sectionId: "access-control",
    title: "Sign out the current local account",
    summary: "Ends the current local account session and returns the workspace to the sign-in flow.",
  },
  "access.mode.login": {
    id: "access.mode.login",
    sectionId: "access-control",
    title: "Switch to sign-in mode",
    summary: "Changes the access form to authenticate an existing local account.",
  },
  "access.mode.register": {
    id: "access.mode.register",
    sectionId: "access-control",
    title: "Switch to account-creation mode",
    summary: "Changes the access form to create a new local user account.",
  },
  "access.submit": {
    id: "access.submit",
    sectionId: "access-control",
    title: "Submit the access form",
    summary: "Authenticates an existing local user or creates a new local account, depending on the current mode.",
  },
  "access.users.refresh": {
    id: "access.users.refresh",
    sectionId: "access-control",
    title: "Refresh local user records",
    summary: "Re-queries the current local user list and role state before administrative changes are applied.",
  },
  "access.role.change": {
    id: "access.role.change",
    sectionId: "access-control",
    title: "Change a user role",
    summary: "Promotes or restricts a local user between viewer, operator, and administrator roles.",
  },
  "access.user.delete": {
    id: "access.user.delete",
    sectionId: "access-control",
    title: "Delete a local user",
    summary: "Removes the selected user account and deletes that user's scoped saved conversations.",
  },
  "access.user.delete.confirm": {
    id: "access.user.delete.confirm",
    sectionId: "access-control",
    title: "Confirm local user deletion",
    summary: "Executes the destructive user-removal action after the operator has reviewed the impact summary.",
  },
  "access.user.delete.cancel": {
    id: "access.user.delete.cancel",
    sectionId: "access-control",
    title: "Cancel local user deletion",
    summary: "Dismisses the pending user-removal confirmation without making changes.",
  },
  "providers.refresh": {
    id: "providers.refresh",
    sectionId: "provider-configuration",
    title: "Refresh provider configuration",
    summary: "Re-reads the effective hosted-provider configuration state for the workspace.",
  },
  "providers.anthropic.save": {
    id: "providers.anthropic.save",
    sectionId: "provider-configuration",
    title: "Save the Anthropic credential",
    summary: "Stores the current Anthropic API key for gateway routing unless an environment-defined key overrides it.",
  },
  "providers.anthropic.clear": {
    id: "providers.anthropic.clear",
    sectionId: "provider-configuration",
    title: "Clear the stored Anthropic credential",
    summary: "Removes the locally stored Anthropic API key without affecting environment-defined secrets.",
  },
  "providers.openai.save": {
    id: "providers.openai.save",
    sectionId: "provider-configuration",
    title: "Save the OpenAI credential",
    summary: "Stores the current OpenAI API key for gateway routing unless an environment-defined key overrides it.",
  },
  "providers.openai.clear": {
    id: "providers.openai.clear",
    sectionId: "provider-configuration",
    title: "Clear the stored OpenAI credential",
    summary: "Removes the locally stored OpenAI API key without affecting environment-defined secrets.",
  },
  "knowledge.refresh": {
    id: "knowledge.refresh",
    sectionId: "knowledge-operations",
    title: "Refresh shared knowledge entries",
    summary: "Re-queries the current shared-knowledge index and entry list.",
  },
  "knowledge.edit.cancel": {
    id: "knowledge.edit.cancel",
    sectionId: "knowledge-operations",
    title: "Cancel knowledge editing",
    summary: "Exits the current knowledge-entry edit session without saving the draft.",
  },
  "models.start-service": {
    id: "models.start-service",
    sectionId: "model-library",
    title: "Start the Ollama service",
    summary: "Ensures the local Ollama service is running so local model actions can proceed.",
  },
  "models.refresh": {
    id: "models.refresh",
    sectionId: "model-library",
    title: "Refresh local model state",
    summary: "Re-synchronizes local service health, downloaded models, runtime state, and library metadata.",
  },
  "models.refresh-services": {
    id: "models.refresh-services",
    sectionId: "provider-configuration",
    title: "Refresh AI service availability",
    summary: "Re-reads local and hosted provider readiness in the model operations lane.",
  },
  "models.filter.all": {
    id: "models.filter.all",
    sectionId: "model-library",
    title: "Show the full model catalog",
    summary: "Switches the model library to the complete visible catalog and refreshes catalog data.",
  },
  "models.filter.downloaded": {
    id: "models.filter.downloaded",
    sectionId: "model-library",
    title: "Show downloaded models only",
    summary: "Filters the model library to models that already exist on this device.",
  },
  "models.filter.ready": {
    id: "models.filter.ready",
    sectionId: "model-library",
    title: "Show ready models only",
    summary: "Filters the model library to models that currently have active runtimes.",
  },
  "models.download": {
    id: "models.download",
    sectionId: "model-library",
    title: "Download a model",
    summary: "Starts a local model transfer so the selected model becomes available on disk.",
  },
  "models.make-ready": {
    id: "models.make-ready",
    sectionId: "model-library",
    title: "Load a model into runtime memory",
    summary: "Starts the selected local model so it is ready to answer prompts immediately.",
  },
  "models.stop-runtime": {
    id: "models.stop-runtime",
    sectionId: "model-library",
    title: "Stop a loaded model",
    summary: "Stops the selected runtime and frees local memory used by the active model.",
  },
  "models.delete": {
    id: "models.delete",
    sectionId: "model-library",
    title: "Delete a local model",
    summary: "Removes the selected downloaded model from local storage.",
  },
  "models.cancel-download": {
    id: "models.cancel-download",
    sectionId: "model-library",
    title: "Cancel an active model transfer",
    summary: "Stops the currently active local model download job.",
  },
  "jobs.bulk.retry": {
    id: "jobs.bulk.retry",
    sectionId: "jobs-and-queue",
    title: "Retry failed pull jobs in scope",
    summary: "Queues another attempt for failed or cancelled pull jobs within the currently visible ownership and filter scope.",
  },
  "jobs.bulk.cancel": {
    id: "jobs.bulk.cancel",
    sectionId: "jobs-and-queue",
    title: "Cancel queued pull jobs in scope",
    summary: "Stops queued pull jobs before they begin, limited to the current operator scope and filter set.",
  },
  "jobs.bulk.clear-confirm": {
    id: "jobs.bulk.clear-confirm",
    sectionId: "jobs-and-queue",
    title: "Clear a pending bulk confirmation",
    summary: "Resets the second-click confirmation state for queued cancel or failed retry bulk actions.",
  },
  "jobs.refresh": {
    id: "jobs.refresh",
    sectionId: "jobs-and-queue",
    title: "Refresh the jobs view",
    summary: "Re-queries jobs, analytics, and list state so filter decisions are based on current queue data.",
  },
  "jobs.hints.toggle": {
    id: "jobs.hints.toggle",
    sectionId: "jobs-and-queue",
    title: "Toggle compact jobs hints",
    summary: "Switches the jobs lane between inline explanatory text and compact hint buttons.",
  },
  "jobs.scope.copy": {
    id: "jobs.scope.copy",
    sectionId: "jobs-and-queue",
    title: "Copy the current jobs scope",
    summary: "Copies the active ownership, lifecycle, type, and snapshot scope so it can be shared or logged elsewhere.",
  },
  "jobs.reset-pivots": {
    id: "jobs.reset-pivots",
    sectionId: "jobs-and-queue",
    title: "Reset status pivots",
    summary: "Returns the quick-pivot status filter to the full jobs view without clearing every other scope control.",
  },
  "jobs.clear-filters": {
    id: "jobs.clear-filters",
    sectionId: "jobs-and-queue",
    title: "Clear all jobs filters",
    summary: "Resets ownership, lifecycle, and type filtering to the broadest jobs scope.",
  },
  "jobs.expand-all": {
    id: "jobs.expand-all",
    sectionId: "jobs-and-queue",
    title: "Expand every jobs section",
    summary: "Opens all visible lifecycle sections so the current filtered job set can be scanned at once.",
  },
  "jobs.collapse-all": {
    id: "jobs.collapse-all",
    sectionId: "jobs-and-queue",
    title: "Collapse every jobs section",
    summary: "Closes all visible lifecycle sections to reduce noise when only summary counts matter.",
  },
  "jobs.refresh-detail": {
    id: "jobs.refresh-detail",
    sectionId: "jobs-and-queue",
    title: "Refresh selected job detail",
    summary: "Reloads the pinned job detail timeline so row state and progress history can be compared against current queue data.",
  },
  "jobs.jump-to-row": {
    id: "jobs.jump-to-row",
    sectionId: "jobs-and-queue",
    title: "Jump to the pinned job row",
    summary: "Moves focus to the selected job inside the visible lifecycle list without clearing the pinned detail view.",
  },
  "jobs.reveal-in-list": {
    id: "jobs.reveal-in-list",
    sectionId: "jobs-and-queue",
    title: "Reveal the pinned job in the list",
    summary: "Adjusts the current list view so the pinned job becomes visible when it sits outside the present scope or snapshot.",
  },
  "jobs.clear-selection": {
    id: "jobs.clear-selection",
    sectionId: "jobs-and-queue",
    title: "Clear the pinned job selection",
    summary: "Removes the current pinned job so the detail panel returns to its neutral state.",
  },
  "jobs.cancel-selected": {
    id: "jobs.cancel-selected",
    sectionId: "jobs-and-queue",
    title: "Cancel the selected pull job",
    summary: "Stops the pinned queued or running pull job when the current scope allows that operator action.",
  },
  "jobs.reorder-earlier": {
    id: "jobs.reorder-earlier",
    sectionId: "jobs-and-queue",
    title: "Move a queued job earlier",
    summary: "Promotes the selected queued pull job toward the front of the queue without changing any other job state.",
  },
  "jobs.reorder-later": {
    id: "jobs.reorder-later",
    sectionId: "jobs-and-queue",
    title: "Move a queued job later",
    summary: "Demotes the selected queued pull job deeper into the current queue order.",
  },
  "jobs.retry-selected": {
    id: "jobs.retry-selected",
    sectionId: "jobs-and-queue",
    title: "Retry the selected pull job",
    summary: "Queues another server-side attempt for the pinned failed or cancelled pull job.",
  },
  "jobs.timeline.all": {
    id: "jobs.timeline.all",
    sectionId: "jobs-and-queue",
    title: "Show the full timeline",
    summary: "Displays the complete progress trail for the selected job, including unchanged entries.",
  },
  "jobs.timeline.new": {
    id: "jobs.timeline.new",
    sectionId: "jobs-and-queue",
    title: "Show only new timeline entries",
    summary: "Filters the selected job timeline to entries that arrived after the last detail refresh.",
  },
  "jobs.timeline.changed": {
    id: "jobs.timeline.changed",
    sectionId: "jobs-and-queue",
    title: "Show only changed timeline entries",
    summary: "Filters the selected job timeline to entries whose visible state changed between detail refreshes.",
  },
  "activity.refresh": {
    id: "activity.refresh",
    sectionId: "activity-audit",
    title: "Refresh the activity log",
    summary: "Re-queries the control-plane audit stream so recent administrative and runtime events are visible.",
  },
};

export function getHelpSection(sectionId: string) {
  return helpSections.find((section) => section.id === sectionId) ?? null;
}

export function getHelpHint(helpId: string | null | undefined) {
  if (!helpId) {
    return null;
  }

  return helpHints[helpId] ?? null;
}