import { InteractionSurface } from "@/components/interaction-surface";
import { getCurrentUser } from "@/lib/auth";
import {
  getMostRecentConversation,
  listConversationSummariesForUser,
} from "@/lib/conversations";
import { getOllamaStatus } from "@/lib/ollama";
import { countUsers } from "@/lib/users";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const navigation = [
  { name: "Chat", hint: "Streaming sessions" },
  { name: "Models", hint: "Pull, load, switch" },
  { name: "Admin", hint: "Health and policy" },
  { name: "Jobs", hint: "Background work" },
];

const workstreams = [
  {
    title: "Conversation cockpit",
    description:
      "Fast model switching, token streaming, prompt presets, archive-ready sessions, and branchable chat flows sized for thumb reach on mobile.",
  },
  {
    title: "Model operations",
    description:
      "Inspect the installed library, pull new models with progress, and see live runtime pressure before a job fails.",
  },
  {
    title: "Admin view",
    description:
      "Expose health, logs, queue state, storage drift, and privileged actions through a server-side control plane.",
  },
];

const rollout = [
  "Foundation shell and server gateway",
  "Streaming chat and model management",
  "Auth, persistence, audit, and jobs",
];

function formatBytes(value: number) {
  if (!value) {
    return "0 GB";
  }

  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="glass-panel rounded-[28px] p-5">
      <p className="eyebrow text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
    </div>
  );
}

export default async function Home() {
  const headerList = await headers();
  const cookieHeader = headerList.get("cookie");
  const currentUser = await getCurrentUser(cookieHeader);
  const [status, userCount, initialConversations, initialConversation] = await Promise.all([
    getOllamaStatus(),
    countUsers(),
    currentUser ? listConversationSummariesForUser(currentUser.id) : Promise.resolve([]),
    currentUser ? getMostRecentConversation(currentUser.id) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-28 pt-4 sm:px-6 lg:px-8">
      <div className="glass-panel sticky top-4 z-20 rounded-full px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-muted">oload</p>
            <p className="text-sm font-medium text-foreground">
              Ollama control plane
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {navigation.map((item) => (
              <div
                key={item.name}
                className="rounded-full border border-line/80 bg-white/40 px-4 py-2"
              >
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted">{item.hint}</p>
              </div>
            ))}
          </div>
          <div className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">
            {status.isReachable ? "Connected" : "Needs attention"}
          </div>
        </div>
      </div>

      <section className="grid gap-6 pt-8 lg:grid-cols-[1.45fr_0.9fr]">
        <div className="glass-panel overflow-hidden rounded-[36px] p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/60 bg-white/60 px-3 py-1 text-xs font-medium text-[var(--accent-strong)]">
              Mobile first
            </span>
            <span className="rounded-full border border-white/60 bg-white/60 px-3 py-1 text-xs font-medium text-[var(--accent-strong)]">
              Server secured
            </span>
            <span className="rounded-full border border-white/60 bg-white/60 px-3 py-1 text-xs font-medium text-[var(--accent-strong)]">
              Admin ready
            </span>
          </div>

          <div className="mt-8 max-w-3xl">
            <p className="section-label text-xs font-semibold">Foundation</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
              One surface for chat, model operations, and Ollama administration.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">
              This is the first milestone: a premium web shell with a server-side
              Ollama gateway, tuned for phones first and expanded upward for
              desktop operations.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Installed models"
              value={String(status.modelCount)}
              detail={status.isReachable ? "Live from the Ollama host." : "Waiting for the local host to respond."}
            />
            <MetricCard
              label="Running now"
              value={String(status.runningCount)}
              detail={status.runningCount > 0 ? "Active model runtimes detected." : "No model currently loaded in memory."}
            />
            <MetricCard
              label="Gateway"
              value={status.isReachable ? "Online" : "Offline"}
              detail={status.baseUrl}
            />
          </div>
        </div>

        <aside className="glass-panel rounded-[36px] p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-label text-xs font-semibold">Live status</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Ollama host snapshot
              </h2>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                status.isReachable
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {status.isReachable ? "Healthy" : "Unreachable"}
            </div>
          </div>

          <dl className="mt-6 space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-2xl bg-white/55 px-4 py-3">
              <dt className="text-muted">Endpoint</dt>
              <dd className="font-mono text-xs text-foreground">{status.baseUrl}</dd>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/55 px-4 py-3">
              <dt className="text-muted">Fetched</dt>
              <dd className="font-medium text-foreground">{new Date(status.fetchedAt).toLocaleTimeString()}</dd>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/55 px-4 py-3">
              <dt className="text-muted">Version</dt>
              <dd className="font-medium text-foreground">{status.version ?? "Unavailable"}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-[28px] border border-dashed border-line bg-white/40 p-4">
            <p className="eyebrow text-muted">Why server-side first</p>
            <p className="mt-3 text-sm leading-7 text-muted">
              Browser clients should never receive direct access to a privileged
              local model host. The control plane sits in front and brokers every
              action.
            </p>
            {status.error ? (
              <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                {status.error}
              </p>
            ) : null}
          </div>
        </aside>
      </section>

      <InteractionSurface
        initialUserSession={{
          authAvailable: true,
          user: currentUser,
          userCount,
        }}
        initialConversation={initialConversation}
        initialConversations={initialConversations}
        initialStatus={status}
      />

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="glass-panel rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-label text-xs font-semibold">Product map</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Core workstreams
              </h2>
            </div>
            <p className="eyebrow text-muted">Phase 01</p>
          </div>

          <div className="mt-8 space-y-4">
            {workstreams.map((item, index) => (
              <div
                key={item.title}
                className="rounded-[28px] border border-line/80 bg-white/55 p-5"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-white">
                    0{index + 1}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                </div>
                <p className="mt-4 text-sm leading-7 text-muted">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="glass-panel rounded-[36px] p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="section-label text-xs font-semibold">Operations</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  Running models
                </h2>
              </div>
              <p className="eyebrow text-muted">Live runtime</p>
            </div>

            <div className="mt-6 space-y-4">
              {status.running.length > 0 ? (
                status.running.map((model) => (
                  <div
                    key={`${model.name}-${model.digest}`}
                    className="rounded-[28px] border border-line/80 bg-white/55 p-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-foreground">
                          {model.name}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          VRAM {formatBytes(model.size_vram ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                        Active
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[28px] border border-dashed border-line bg-white/45 p-5 text-sm leading-7 text-muted">
                  No models are currently loaded. Once Ollama is active, the live
                  runtime list will appear here.
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-[36px] p-6 sm:p-8">
            <p className="section-label text-xs font-semibold">Delivery sequence</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Step-by-step build path
            </h2>
            <div className="mt-6 space-y-3">
              {rollout.map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-4 rounded-[24px] bg-white/55 px-4 py-4"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/80 text-sm font-semibold text-foreground">
                    {index + 1}
                  </div>
                  <p className="text-sm font-medium text-foreground">{item}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm leading-7 text-muted">
              The current build establishes the shell and status layer. Chat
              streaming, pull jobs, and admin workflows come next.
            </p>
          </div>
        </div>
      </section>

      <nav className="glass-panel fixed inset-x-4 bottom-4 z-30 rounded-full px-3 py-2 md:hidden">
        <div className="grid grid-cols-4 gap-2">
          {navigation.map((item) => (
            <div
              key={item.name}
              className="rounded-full bg-white/55 px-2 py-3 text-center"
            >
              <p className="text-sm font-semibold text-foreground">{item.name}</p>
              <p className="mt-1 text-[11px] text-muted">{item.hint}</p>
            </div>
          ))}
        </div>
      </nav>
    </main>
  );
}
