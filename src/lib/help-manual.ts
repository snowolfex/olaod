export type HelpContext = "chat" | "access" | "models" | "jobs" | "activity";

export type HelpSection = {
  id: string;
  context: HelpContext;
  title: string;
  summary: string;
  body: string[];
  detailedExplanation: string[];
  plainLanguage: string[];
  comparison?: string;
  keyPoints: string[];
};

export type HelpGlossaryEntry = {
  term: string;
  definition: string;
  links?: Array<{
    title: string;
    url: string;
  }>;
};

export type HelpReferenceEntry = {
  title: string;
  url: string;
  category: "Docs" | "Course" | "Blog" | "Legal";
  description: string;
};

export type HelpHint = {
  id: string;
  sectionId: string;
  title: string;
  summary: string;
};

export const HELP_MANUAL_TITLE = "oload Operator Guide";
export const HELP_MANUAL_SUBTITLE = "Technical reference for the AI stack, local runtime, provider routing, retrieval, prompting, jobs, and administrative controls.";

export const helpSections: HelpSection[] = [
  {
    id: "ai-foundations",
    context: "chat",
    title: "AI Foundations in oload",
    summary: "oload is an inference orchestration surface: it assembles instructions, conversation context, retrieval context, and model selection into one gateway request without retraining the underlying model.",
    body: [
      "At runtime, the application constructs a request envelope that can include a user message, prior conversation turns, account-level default instructions, and optional retrieved knowledge. That envelope is sent to a selected model through a single server-side gateway path.",
      "Inference means the model is producing an output from its existing weights. The model is not being fine-tuned, retrained, or permanently modified by ordinary chat usage in this workspace.",
      "Because the gateway normalizes local and hosted providers, the interface can preserve a stable operator workflow even when the actual execution target changes from a local Ollama model to a hosted provider endpoint.",
    ],
    detailedExplanation: [
      "In practice, the gateway acts like a composition layer. It decides which instruction sources belong in the request, which conversation state still matters, whether shared knowledge should be attached, and which provider-specific payload shape is required before the request leaves the server. That means the operator experience stays stable even when the actual model family or transport changes underneath it.",
      "This distinction matters because people often confuse better answers with model improvement. If a reply gets better after you attach knowledge, refine instructions, or reopen the right saved thread, that is a context-quality change, not a training event. The next unrelated chat will only benefit if you intentionally preserve the useful parts through saved instructions, stored knowledge, or a thread you reopen later.",
      "oload is therefore best understood as a controlled inference environment. It helps you shape the model's working context for this run, observe the route that was taken, and repeat that process reliably without pretending that ordinary operator traffic is rewriting the model itself.",
    ],
    plainLanguage: [
      "The app is basically a controlled front desk for AI. It gathers what you typed, any saved chat context, and any extra shared knowledge, then sends that bundle to the selected model.",
      "Nothing you do in normal chat is teaching the model new permanent facts. You are giving it instructions and context for this run, not rewriting the model itself.",
    ],
    comparison: "Think of it like handing a briefing folder to a specialist: the specialist reads the folder and answers, but the specialist's training does not change just because you handed over one more folder.",
    keyPoints: [
      "Treat chat runs as inference requests, not training events.",
      "Use new chats when you want a clean context boundary.",
      "Assume retrieved knowledge affects the current answer, not the stored model weights.",
      "Use the same interface to compare local and hosted execution paths.",
    ],
  },
  {
    id: "chat-overview",
    context: "chat",
    title: "Chat Request Lifecycle",
    summary: "The chat surface manages request composition, model targeting, streaming response delivery, and per-thread state restoration through the shared AI gateway.",
    body: [
      "The active chat surface is the primary inference client. It collects the current draft, selected model, thread history, and standing instruction defaults, then initiates a streaming request through the server-side gateway.",
      "Saved conversations persist the state that materially affects later outputs, including message history and thread-level settings. Reopening a conversation restores that context so later responses remain grounded in the original working thread.",
      "Streaming delivery matters operationally because the response is not produced as a single final payload. Partial text can arrive, be interrupted, and still remain visible as a partial result for review.",
    ],
    detailedExplanation: [
      "A chat request is not just a single text submission. By the time it leaves the client, it may already reflect current model selection, thread history, standing assistant instructions, retrieval toggles, and any lane-specific state that changes how the gateway composes the request. The visible message box is only the last operator-controlled layer in that stack.",
      "Thread restoration is important because it preserves the assumptions the model has already been given. If you reopen a thread about a product requirement, a deployment incident, or a document rewrite, the follow-up reply can stay grounded in the same working frame instead of forcing you to restate everything from zero. That continuity is useful, but it also means stale context can keep affecting answers until you deliberately branch into a fresh chat.",
      "Streaming changes review behavior as well. Operators can catch bad direction early, stop the run when the model is clearly drifting, and still preserve the partial output for audit or reuse. In other words, streaming is not just a cosmetic typing effect; it is part of how the interface supports earlier intervention and lower-cost correction.",
    ],
    plainLanguage: [
      "This is the part of the app where you actually talk to the model. When you send a message, the app bundles the message with the current chat history and sends it to the AI service.",
      "Saved chats are not just notes. They keep the working context so reopening a chat feels like resuming a conversation instead of starting from scratch.",
    ],
    comparison: "Think of it like reopening a work ticket with the full thread attached instead of starting a brand-new email every time.",
    keyPoints: [
      "Use New chat to isolate a task from prior context.",
      "Use archived conversations for completed or low-frequency work.",
      "Use Stop to terminate an in-flight stream without losing the partial reply already received.",
      "Use saved threads when continuity is more important than a clean slate.",
    ],
  },
  {
    id: "prompting-and-control",
    context: "chat",
    title: "Prompts, Instructions, and Reply Style",
    summary: "Model behavior is shaped by the composed instruction stack: account defaults, thread-specific instructions, conversation history, and the current user message, plus the configured sampling temperature.",
    body: [
      "The effective prompt is not only the text in the message box. The model also receives standing instruction text such as the account-level assistant style, any thread-specific instruction preserved with a saved conversation, and prior turns in the same conversation.",
      "Temperature is a sampling control. Lower values reduce output variance and usually produce tighter, more repeatable responses. Higher values increase variety and can make outputs feel more exploratory or stylistically loose.",
      "A system prompt or assistant-style instruction should describe operating constraints, tone, domain behavior, and refusal boundaries. It should not be treated as a place to dump task-specific scratch content that belongs in the actual user request.",
    ],
    detailedExplanation: [
      "Prompt quality in oload depends on separating long-lived guidance from short-lived work. Account defaults and assistant-style text should define durable behavior such as tone, structure, guardrails, or domain posture. The live user message should define the current objective, constraints, inputs, and desired output. When those responsibilities get mixed together, operators usually end up with bloated prompts that are harder to maintain and less predictable to debug.",
      "Reply style controls should also be interpreted operationally, not emotionally. A lower setting narrows sampling and generally makes the output easier to reproduce across similar runs. A higher setting gives the model more freedom in phrasing and idea selection, which can be useful for ideation but can also widen variance in structure, emphasis, and factual confidence. That is why repeatable workflows often start lower and only increase when exploration is the actual goal.",
      "When a result feels wrong, the clean troubleshooting order is usually: verify the instruction stack, verify whether stale conversation turns are still steering the answer, verify whether retrieval added misleading context, and only then blame the model. Most day-to-day quality issues come from composition and scope, not from the model suddenly ignoring a good prompt for no reason.",
    ],
    plainLanguage: [
      "The model is listening to more than the one message you just typed. It is also listening to the saved chat history and to the default assistant style you set in Access.",
      "Reply style is basically a creativity dial. Lower keeps things more literal and consistent. Higher lets the model wander a bit more.",
    ],
    comparison: "Think of the assistant style as the standing job description, and your typed message as today's assignment.",
    keyPoints: [
      "Put long-term behavior in the assistant style, not in every message.",
      "Put the actual task, constraints, and desired output in the current message.",
      "Use lower reply-style values for repeatability and exactness.",
      "Use higher reply-style values when ideation matters more than strict consistency.",
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
    detailedExplanation: [
      "Conversation controls are really context-management controls. Pinning keeps active threads visible because those threads still carry working assumptions you expect to revisit. Archiving removes noise from the daily rail without throwing away the record. Deleting is the only option that actually destroys the thread as an available context source, so it should be treated as a stronger lifecycle decision than pin or archive.",
      "Naming matters more than it seems because conversation lists become an operator memory layer over time. A thread titled after the opening prompt often stops being useful as soon as the work evolves, while a title based on the actual outcome or purpose remains intelligible weeks later. Strong titles reduce reopening mistakes and make it easier to decide whether a thread should be resumed, duplicated, archived, or retired.",
      "There is also a quality tradeoff behind every reuse decision. Reopening the same thread preserves context and saves time, but it also keeps old assumptions alive. Starting a new thread drops that baggage but requires you to restate what matters. Good operators choose between continuity and cleanliness deliberately instead of treating thread reuse as a neutral convenience.",
    ],
    plainLanguage: [
      "Pinning is for chats you keep coming back to. Archiving is for chats you want to keep without leaving them in your day-to-day list.",
      "A good title should help future-you find the right thread fast without rereading the whole conversation.",
    ],
    comparison: "Think of pinned chats like favorites, and archived chats like moving finished work into a filing cabinet instead of the desk surface.",
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
    detailedExplanation: [
      "Identity in oload is not just a decorative profile layer. It determines which defaults apply, which conversations belong to whom, which controls are visible, and which actions become part of the audit trail for a specific operator. That is why account state, role assignment, and session continuity belong in the same operational surface rather than being treated as unrelated settings.",
      "The administrative guardrails exist because local installations can become unrecoverable through perfectly ordinary mistakes. If the last administrator removes their own access or demotes the only remaining admin account, the workspace can lose safe control of provider settings, users, and sensitive operational actions. Preventing those states is more important than offering unrestricted admin flexibility.",
      "Credential handling sits in the same lane because identity and trust boundaries are connected. A provider key changes what the workspace is allowed to call upstream, so it has to be governed with the same seriousness as role changes and backup-sensitive actions. Environment-variable precedence also matters operationally because it lets deployments keep secrets outside local data files when policy requires that separation.",
    ],
    plainLanguage: [
      "This section decides who you are in the app, what you are allowed to do, and which AI settings belong to your account by default.",
      "The app also protects you from easy-to-make admin mistakes like locking the last administrator out of the system.",
    ],
    comparison: "Think of this area as the identity and permissions control room, not the place where the AI answers questions.",
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
    summary: "Hosted provider controls determine whether external AI services such as Anthropic and OpenAI are valid routing targets for the shared gateway.",
    body: [
      "A hosted provider is considered configured when a valid API credential is available either through encrypted local storage or through environment-based secret injection.",
      "Provider configuration affects model availability in the chat lane. An unconfigured provider is intentionally left unavailable so the operator does not attempt a route that cannot authenticate upstream.",
      "When troubleshooting hosted traffic, validate three things in order: credential presence, upstream reachability, and any custom base URL override.",
    ],
    detailedExplanation: [
      "Provider configuration is the policy layer that decides whether the unified gateway may legally and technically route traffic to an outside service. A route is only usable when credentials exist, the upstream endpoint is reachable, and any custom base URL still points to a compatible API surface. If any one of those conditions fails, the route may look conceptually available but remain operationally dead.",
      "The reason this appears in admin tooling rather than inside the chat form is that provider status affects more than one request. It changes the set of valid execution targets for the whole workspace, influences which model options should be shown, and determines whether certain troubleshooting paths even make sense. Exposing broken hosted routes as if they were selectable would create false confidence and harder-to-diagnose failures.",
      "For debugging, order matters. Start with credential presence because no amount of network debugging will fix a missing or wrong key. Then confirm reachability, since a good key cannot help if the target cannot be contacted. Only after those two checks should you investigate custom URL overrides, proxy behavior, or provider-specific API mismatches.",
    ],
    plainLanguage: [
      "This is where the app learns whether it is allowed to talk to outside AI services. No key means no route.",
      "If a hosted provider is missing or broken, the app hides or de-emphasizes that route so you do not send requests into a dead end.",
    ],
    comparison: "Think of provider keys like signed access badges that let the gateway enter someone else's AI building.",
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
    summary: "Shared knowledge is the operator-managed grounding layer for retrieval-augmented generation, scoped recall, overlap control, and answer-quality debugging.",
    body: [
      "Knowledge entries are indexed records that can be filtered by provider and model scope. They are intended to improve answer quality through prompt-time retrieval rather than model retraining.",
      "Overlap checks identify near-duplicate notes before they degrade retrieval quality. Excess duplication tends to crowd the ranking layer and produce redundant grounding context.",
      "The retrieval debugger is a validation tool. It explains which indexed records matched a prompt and why they ranked the way they did.",
    ],
    detailedExplanation: [
      "Shared knowledge is the reusable grounding layer for retrieval-augmented generation. Instead of baking workspace facts into the model, oload stores those facts as separate indexed entries and retrieves the most relevant subset at request time. That approach is faster to update, easier to audit, and much safer operationally because you can change the knowledge layer without pretending you changed the model itself.",
      "Quality depends heavily on curation. When multiple entries say nearly the same thing, the ranking layer can waste limited retrieval budget on overlap rather than diversity. The result is a context bundle that looks full but is actually repetitive, which often makes answers feel narrower or overconfident. That is why overlap detection and retrieval debugging are not optional extras; they are the tools that help operators keep the grounding set useful instead of noisy.",
      "Scope filters add another important control point. A note may be globally valid, provider-specific, or only relevant to certain models. If the wrong scope is applied, the model can receive context that is technically true but operationally misplaced. The best retrieval workflow is therefore: maintain clean entries, minimize duplication, validate scope, and use the debugger whenever ranking behavior stops matching your expectations.",
    ],
    plainLanguage: [
      "Shared knowledge is the app's reusable reference shelf. When enabled, the app grabs the most relevant notes and attaches them to the request before the model answers.",
      "That helps the answer stay grounded in your workspace facts without needing to retrain the model itself.",
    ],
    comparison: "Think of it like giving the model a short stack of relevant index cards right before it answers.",
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
    detailedExplanation: [
      "The model lane combines inventory status and runtime status because operators need both to make correct decisions. A model can exist on disk and still be unavailable for fast replies if it is not loaded into memory. Conversely, a ready model implies a stronger operational state than merely downloaded because it can usually answer with lower startup delay. Treating those states as interchangeable leads to bad troubleshooting advice and wasted time.",
      "The Ollama service is the local control plane underneath those actions. When it is offline, download, readiness, and deletion controls may all appear conceptually related to the model but are actually blocked by the same service dependency. That is why good operator guidance starts by validating service health before assuming the library itself is inconsistent.",
      "The unified lane also helps compare local and hosted execution without implying that both are managed the same way. Hosted models share the same routing surface for chat, but they do not have local residency, local storage cleanup, or local warm-state controls. Putting both kinds of targets in one lane is useful for route selection, as long as the operator still understands which controls only apply to the local runtime.",
    ],
    plainLanguage: [
      "A downloaded model is stored on your machine. A ready model is one that is already warmed up and able to answer right away.",
      "Local models are like software you installed yourself. Hosted models are like calling a remote service somebody else runs for you.",
    ],
    comparison: "Think of downloaded versus ready like an app being installed on disk versus already open and running in memory.",
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
    detailedExplanation: [
      "Jobs represent work in motion, not just model inventory facts. A queued pull, retry, cancel, or reorder decision belongs to the operational timeline of work execution, which is why the jobs lane separates sequencing and history from the simpler question of whether a model currently exists. If you use the library view to answer queue questions, you lose the state transitions and lineage that explain how the system got where it is now.",
      "Refresh behavior is also more than a cosmetic reload. In an active queue, the meaning of badges and change indicators depends on when you last synchronized your view. Manual refresh establishes that checkpoint. Without it, an operator may compare today's moving state against an out-of-date mental baseline and misread what actually changed since the last decision point.",
      "Scope controls protect against broad mistakes in fast-moving environments. Ownership filters, quick pivots, and pinned detail views exist so an operator can narrow attention before issuing actions with side effects. When retries, cancellations, or reorders are available, the safest habit is to confirm scope first and action second.",
    ],
    plainLanguage: [
      "This is the work log for model downloads and similar long-running operations. It tells you what is waiting, what is running, what failed, and what finished.",
      "Use it when you need to manage the work queue itself, not when you just want to know whether a model exists.",
    ],
    comparison: "Think of the jobs view like a dispatch board for operations, while the model library is the inventory room.",
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
    detailedExplanation: [
      "The activity lane exists to answer traceability questions across the whole workspace, not just within one feature. It is where operators confirm that a sensitive action happened, verify the order of important events, and separate routine informational noise from entries that indicate failure, blockage, or elevated operational significance. That makes it broader than a jobs view and more structured than relying on memory or raw chat history.",
      "Warning-level entries deserve priority because they often capture the moment where an operator path stopped behaving normally. A warning may indicate a failed upstream call, a blocked administrative action, or a result that needs confirmation before anyone assumes the system state is healthy. Reading those entries early shortens the path from symptom to root cause.",
      "Activity becomes most valuable when correlated with the surface that generated the event. A model-action warning should be checked against Jobs or Models. A provider-related entry should be checked against Access. The lane is strongest as a flight recorder and audit stream, not as the place where you directly operate the affected subsystem.",
    ],
    plainLanguage: [
      "This is the app's memory of important events. It helps you answer who did what and whether anything failed or needs attention.",
      "It is there for confirmation and troubleshooting, not for doing the work itself.",
    ],
    comparison: "Think of it like the flight recorder for the workspace, not the cockpit controls.",
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
    title: "Help Access and Navigation",
    summary: "Contextual help uses hover on desktop and long-press on mobile so operators can request guidance without leaving their current workflow.",
    body: [
      "On desktop browsers, hovering a tagged control opens a contextual help card positioned near the target control. The card remains visible while the pointer is within the control or the card itself.",
      "On touch devices, pressing and holding a tagged control for roughly two seconds opens the same contextual help card. This avoids occupying the screen with persistent hint text while preserving discoverability.",
      "The contextual help card contains a direct link into the full help manual. That link is intended for deeper review, while the card summary is intended for quick operational orientation.",
    ],
    detailedExplanation: [
      "The help system is designed to fit the interaction model of the device instead of forcing one pattern everywhere. Desktop users typically have hover precision and can tolerate a nearby transient card, so the system surfaces help on hover without redirecting the user away from the current task. Touch users do not have hover, so the same information is gated behind a deliberate press-and-hold gesture to avoid constant accidental popups.",
      "This matters operationally because the quick-help layer is supposed to reduce context switching, not create more of it. The popup gives just enough explanation to orient the operator around the current control, and then offers a path into the full manual when the problem needs deeper reading. That keeps routine usage fast while still giving the user a discoverable route into the richer handbook content you asked for.",
      "The full Help page remains the durable reference surface. Quick-help explains the control in front of you. The Help page explains the workflow around that control, the surrounding terminology, and the deeper reasoning behind the product behavior. Used together, they create both a fast inline explanation path and a full-document path without forcing operators to leave their place every time they need a hint.",
    ],
    plainLanguage: [
      "If you hover on desktop or long-press on mobile, the app can show a quick explanation right next to the control you are looking at.",
      "Use the full Help page when you want the complete explanation, terminology, and outside reading links in one place.",
    ],
    comparison: "Think of the popovers as tooltips with substance, and the Help page as the full handbook.",
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
    term: "Prompt",
    definition: "The input instructions and content sent to a model for one inference request.",
  },
  {
    term: "System prompt / assistant style",
    definition: "A standing instruction layer that shapes the model's behavior, tone, and constraints across a conversation or account default.",
  },
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
    term: "Temperature",
    definition: "A sampling control that changes how deterministic or varied a model's next-token choices are.",
  },
  {
    term: "Token",
    definition: "A chunk of text processed by the model. Context limits and many cost calculations are expressed in tokens, not characters.",
  },
  {
    term: "Context window",
    definition: "The maximum amount of prompt and response text a model can consider in one run.",
  },
  {
    term: "Embedding",
    definition: "A numerical vector representation of content used for similarity search, retrieval, clustering, and ranking.",
    links: [
      {
        title: "OpenAI API Key Concepts",
        url: "https://platform.openai.com/docs/guides/embeddings",
      },
    ],
  },
  {
    term: "Retrieval-augmented generation",
    definition: "A prompt-time grounding method that injects relevant indexed context into a request without retraining the model.",
    links: [
      {
        title: "Ollama Documentation",
        url: "https://docs.ollama.com/",
      },
      {
        title: "DeepLearning.AI Short Courses",
        url: "https://www.deeplearning.ai/short-courses/",
      },
    ],
  },
  {
    term: "Grounding",
    definition: "The act of anchoring a model response to supplied documents, data, or reference context instead of relying only on the model's prior training.",
  },
  {
    term: "Streaming",
    definition: "Incremental delivery of model output as it is generated, instead of waiting for a full final response payload.",
  },
  {
    term: "Hosted provider",
    definition: "A remote AI service operated outside the local machine, typically accessed through an API key and network call.",
    links: [
      {
        title: "OpenAI API Key Concepts",
        url: "https://developers.openai.com/api/docs/concepts",
      },
      {
        title: "Anthropic: Building with Claude",
        url: "https://platform.claude.com/docs/en/docs/overview",
      },
    ],
  },
  {
    term: "Operator scope",
    definition: "The currently active set of records or actions constrained by ownership filters, lifecycle filters, or other explicit UI scoping controls.",
  },
  {
    term: "Audit trail",
    definition: "A structured event history used to confirm that an action occurred and to reconstruct control-plane activity over time.",
  },
  {
    term: "EULA",
    definition: "The installer requires explicit end-user license agreement acceptance before setup continues. In Oload, that acceptance sits alongside a source-available proprietary notice rather than a blanket open-source grant.",
    links: [
      {
        title: "End-user license agreement overview",
        url: "https://en.wikipedia.org/wiki/End-user_license_agreement",
      },
      {
        title: "Source-available software overview",
        url: "https://en.wikipedia.org/wiki/Source-available_software",
      },
    ],
  },
  {
    term: "GNU GPL",
    definition: "The GNU General Public License is a copyleft software license family with redistribution and source obligations. In this workspace it is reference context for third-party legal understanding, not the primary Oload installer license described in the installer README.",
    links: [
      {
        title: "GNU GPL v3 text",
        url: "https://www.gnu.org/licenses/gpl-3.0.en.html",
      },
      {
        title: "GNU GPL FAQ",
        url: "https://www.gnu.org/licenses/gpl-faq.html",
      },
    ],
  },
];

export const helpReferences: HelpReferenceEntry[] = [
  {
    title: "Ollama Documentation",
    url: "https://docs.ollama.com/",
    category: "Docs",
    description: "Official local-model runtime documentation for setup, model pulls, and local execution concepts.",
  },
  {
    title: "OpenAI API Key Concepts",
    url: "https://developers.openai.com/api/docs/concepts",
    category: "Docs",
    description: "Clear reference material for prompts, tokens, embeddings, tools, streaming, and agent-oriented API concepts.",
  },
  {
    title: "Anthropic: Building with Claude",
    url: "https://platform.claude.com/docs/en/docs/overview",
    category: "Docs",
    description: "Official guide to Claude capabilities, tool use, context handling, deployment planning, and production considerations.",
  },
  {
    title: "DeepLearning.AI Short Courses",
    url: "https://www.deeplearning.ai/short-courses/",
    category: "Course",
    description: "Free short courses covering prompting, agents, retrieval, inference, evaluation, and practical AI engineering.",
  },
  {
    title: "Edward Donner",
    url: "https://edwarddonner.com/",
    category: "Blog",
    description: "Practical learning resources and course-adjacent AI engineering explainers, including agentic engineering and builder workflows.",
  },
  {
    title: "Simon Willison on LLMs",
    url: "https://simonwillison.net/tags/llms/",
    category: "Blog",
    description: "High-signal independent writing on local models, prompting, agents, vendor APIs, evaluation, and real-world AI engineering tradeoffs.",
  },
  {
    title: "GNU GPL v3",
    url: "https://www.gnu.org/licenses/gpl-3.0.en.html",
    category: "Legal",
    description: "Canonical GNU General Public License text for understanding copyleft redistribution, source availability, and derivative-work obligations.",
  },
  {
    title: "GNU GPL FAQ",
    url: "https://www.gnu.org/licenses/gpl-faq.html",
    category: "Legal",
    description: "Practical GNU guidance for common GPL interpretation questions around distribution, linking, and obligations.",
  },
  {
    title: "End-user license agreement overview",
    url: "https://en.wikipedia.org/wiki/End-user_license_agreement",
    category: "Legal",
    description: "General background on how EULAs are commonly used in installed software distribution and acceptance flows.",
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
    summary: "Enables or disables the short contextual help cards shown on desktop hover and mobile long-press. Desktop cards auto-dismiss after a short pause and can be muted per control, while mobile long-press help remains available whenever quick help is enabled.",
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