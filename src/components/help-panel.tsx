"use client";

import { useEffect, useMemo, useState } from "react";

import {
  helpGlossary,
  helpReferences,
  HELP_MANUAL_SUBTITLE,
  HELP_MANUAL_TITLE,
  helpSections,
  type HelpContext,
} from "@/lib/help-manual";
import type { OllamaStatus } from "@/lib/ollama";
import type { SessionUser } from "@/lib/user-types";

type HelpPanelProps = {
  context: HelpContext;
  currentUser: SessionUser | null;
  requestedSectionId: string | null;
  requestedSectionNonce: number;
  surface?: "embedded" | "page";
  status: OllamaStatus;
};

const contextSummary: Record<HelpContext, { badge: string; title: string; intro: string }> = {
  chat: {
    badge: "Chat",
    title: "Inference, prompting, and conversation state",
    intro: "Technical reference for how prompts, instruction layers, retrieval context, and streaming replies behave in the chat surface.",
  },
  access: {
    badge: "Access",
    title: "Identity, provider credentials, and knowledge controls",
    intro: "Technical reference for account scope, hosted-provider routing, shared knowledge, and recovery-sensitive admin operations.",
  },
  models: {
    badge: "Models",
    title: "Local runtime and model inventory",
    intro: "Technical reference for local model availability, runtime readiness, service state, and the distinction between installed and loaded models.",
  },
  jobs: {
    badge: "Jobs",
    title: "Queue control and execution history",
    intro: "Technical reference for operation sequencing, retries, status transitions, and queue-scoped operator actions.",
  },
  activity: {
    badge: "Activity",
    title: "Audit and change traceability",
    intro: "Technical reference for audit events, warning interpretation, and cross-surface traceability after administrative changes.",
  },
};

function wrapText(text: string, maxCharacters: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxCharacters) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export function HelpPanel({
  context,
  currentUser,
  requestedSectionId,
  requestedSectionNonce,
  surface = "embedded",
  status,
}: HelpPanelProps) {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const focusSummary = contextSummary[context];
  const isPageSurface = surface === "page";
  const totalSectionCount = helpSections.length;
  const contextSections = useMemo(
    () => helpSections.filter((section) => section.context === context),
    [context],
  );

  useEffect(() => {
    if (!requestedSectionId) {
      return;
    }

    const sectionElement = document.getElementById(`help-section-${requestedSectionId}`);

    if (!sectionElement) {
      return;
    }

    sectionElement.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [requestedSectionId, requestedSectionNonce]);

  const exportPdf = async () => {
    setIsExportingPdf(true);

    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdfDocument = await PDFDocument.create();
      const regularFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
      const pageSize = { width: 612, height: 792 };
      const margin = 48;
      const lineHeight = 16;
      let page = pdfDocument.addPage([pageSize.width, pageSize.height]);
      let cursorY = pageSize.height - margin;

      const ensureSpace = (requiredHeight: number) => {
        if (cursorY - requiredHeight >= margin) {
          return;
        }

        page = pdfDocument.addPage([pageSize.width, pageSize.height]);
        cursorY = pageSize.height - margin;
      };

      const drawLines = (lines: string[], options?: { fontSize?: number; bold?: boolean; color?: [number, number, number] }) => {
        const fontSize = options?.fontSize ?? 11;
        const font = options?.bold ? boldFont : regularFont;
        const color = options?.color ?? [0.12, 0.12, 0.1];
        const neededHeight = lines.length * lineHeight + 4;
        ensureSpace(neededHeight);

        for (const line of lines) {
          page.drawText(line, {
            x: margin,
            y: cursorY,
            size: fontSize,
            font,
            color: rgb(color[0], color[1], color[2]),
          });
          cursorY -= lineHeight;
        }

        cursorY -= 4;
      };

      drawLines([HELP_MANUAL_TITLE], { bold: true, fontSize: 20, color: [0.45, 0.2, 0.1] });
      drawLines(wrapText(HELP_MANUAL_SUBTITLE, 80), { fontSize: 11, color: [0.32, 0.28, 0.24] });
      drawLines([`Current focus: ${focusSummary.title}`], { bold: true, fontSize: 12 });
      drawLines(wrapText(focusSummary.intro, 82), { fontSize: 10, color: [0.34, 0.34, 0.34] });

      for (const section of helpSections) {
        drawLines([section.title], { bold: true, fontSize: 15, color: [0.2, 0.2, 0.2] });
        drawLines(wrapText(section.summary, 82), { fontSize: 10, color: [0.34, 0.34, 0.34] });

        drawLines(["Technical detail"], { bold: true, fontSize: 11 });

        for (const paragraph of section.body) {
          drawLines(wrapText(paragraph, 84), { fontSize: 10 });
        }

        drawLines(["Plain-language explanation"], { bold: true, fontSize: 11 });

        for (const paragraph of section.plainLanguage) {
          drawLines(wrapText(paragraph, 84), { fontSize: 10, color: [0.28, 0.28, 0.28] });
        }

        if (section.comparison) {
          drawLines([`Think of it as: ${section.comparison}`], { fontSize: 10, color: [0.28, 0.28, 0.28] });
        }

        drawLines(["Key procedures"], { bold: true, fontSize: 11 });

        for (const point of section.keyPoints) {
          drawLines(wrapText(`- ${point}`, 82), { fontSize: 10 });
        }
      }

      drawLines(["Glossary"], { bold: true, fontSize: 15, color: [0.2, 0.2, 0.2] });

      for (const entry of helpGlossary) {
        drawLines([entry.term], { bold: true, fontSize: 11 });
        drawLines(wrapText(entry.definition, 84), { fontSize: 10 });
      }

      drawLines(["References"], { bold: true, fontSize: 15, color: [0.2, 0.2, 0.2] });

      for (const entry of helpReferences) {
        drawLines([`${entry.category}: ${entry.title}`], { bold: true, fontSize: 11 });
        drawLines(wrapText(entry.description, 84), { fontSize: 10 });
        drawLines(wrapText(entry.url, 84), { fontSize: 9, color: [0.2, 0.32, 0.45] });
      }

      const pdfBytes = await pdfDocument.save();
      const pdfByteArray = Uint8Array.from(pdfBytes);
      const blob = new Blob([pdfByteArray], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = "oload-operator-guide.pdf";
      anchor.click();
      window.URL.revokeObjectURL(downloadUrl);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <section className={`glass-panel flex flex-col rounded-[32px] p-4 sm:rounded-[36px] sm:p-6 ${isPageSurface ? "" : "h-full min-h-0 overflow-hidden"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label text-xs font-semibold">Help</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:mt-3 sm:text-2xl">
            {HELP_MANUAL_TITLE}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted sm:mt-3">
            {isPageSurface
              ? "Technical reference first, plain-language translation second, and free outside reading links at the bottom."
              : HELP_MANUAL_SUBTITLE}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="ui-pill ui-pill-surface">{focusSummary.badge}</span>
          <button
            className="ui-button ui-button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={() => {
              void exportPdf();
            }}
            disabled={isExportingPdf}
          >
            {isExportingPdf ? "Building PDF..." : "Download PDF manual"}
          </button>
        </div>
      </div>

      {isPageSurface ? (
        <div className="theme-surface-elevated mt-5 rounded-[28px] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="eyebrow text-muted">Current focus</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{focusSummary.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{focusSummary.intro}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={`ui-pill ${status.isReachable ? "ui-pill-success" : "ui-pill-warning"}`}>
                {status.isReachable ? "Gateway ready" : "Gateway attention"}
              </span>
              <span className="ui-pill ui-pill-surface">
                {currentUser ? currentUser.displayName : "Guest mode"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {contextSections.map((section) => (
                <button
                  key={section.id}
                  className="ui-button ui-button-secondary justify-between rounded-[20px] px-4 py-3 text-left text-sm"
                  type="button"
                  onClick={() => {
                    document.getElementById(`help-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <span>{section.title}</span>
                  <span className="text-xs text-muted">Jump</span>
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-3">
              <div className="theme-surface-soft rounded-[20px] px-3 py-3">
                <p className="eyebrow text-muted">Sections in view</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{contextSections.length}</p>
              </div>
              <div className="theme-surface-soft rounded-[20px] px-3 py-3">
                <p className="eyebrow text-muted">Manual sections</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{totalSectionCount}</p>
              </div>
              <div className="theme-surface-soft rounded-[20px] px-3 py-3">
                <p className="eyebrow text-muted">Glossary terms</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{helpGlossary.length}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <div className="theme-surface-soft rounded-[24px] px-4 py-4">
          <p className="eyebrow text-muted">Focus</p>
          <p className="mt-2 text-base font-semibold text-foreground">
            {focusSummary.title}
          </p>
          {isPageSurface ? (
            <p className="mt-1 text-xs leading-5 text-muted">{contextSections.length} focused section{contextSections.length === 1 ? "" : "s"}</p>
          ) : null}
        </div>
        <div className="theme-surface-soft rounded-[24px] px-4 py-4">
          <p className="eyebrow text-muted">Gateway</p>
          <p className="mt-2 text-base font-semibold text-foreground">
            {status.isReachable ? "Ready" : "Needs attention"}
          </p>
          {isPageSurface ? (
            <p className="mt-1 text-xs leading-5 text-muted">Status here helps explain whether local AI paths are currently usable.</p>
          ) : null}
        </div>
        <div className="theme-surface-soft rounded-[24px] px-4 py-4">
          <p className="eyebrow text-muted">User</p>
          <p className="mt-2 text-base font-semibold text-foreground">{currentUser ? currentUser.displayName : "Guest mode"}</p>
          {isPageSurface ? (
            <p className="mt-1 text-xs leading-5 text-muted">{currentUser ? `Signed in as ${currentUser.role}.` : "Manual is available without a signed-in identity."}</p>
          ) : null}
        </div>
      </div>

      <div className={isPageSurface ? "mt-5 pr-1" : "mt-5 min-h-0 flex-1 overflow-y-auto pr-1"}>
        <div className={isPageSurface ? "grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]" : "space-y-3"}>
          {isPageSurface ? (
            <div className="space-y-3 xl:sticky xl:top-3 xl:self-start">
              <div className="theme-surface-soft rounded-[28px] p-5">
                <p className="eyebrow text-muted">Jump list</p>
                <p className="mt-2 text-base font-semibold text-foreground">{focusSummary.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{focusSummary.intro}</p>
                <div className="mt-4 space-y-2">
                  {contextSections.map((section, index) => (
                    <button
                      key={section.id}
                      className="ui-button ui-button-secondary w-full justify-between rounded-[20px] px-4 py-3 text-left text-sm"
                      type="button"
                      onClick={() => {
                        document.getElementById(`help-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      <span>{index + 1}. {section.title}</span>
                      <span className="text-xs text-muted">Focus</span>
                    </button>
                  ))}
                </div>
              </div>

              {currentUser && currentUser.role !== "admin" ? (
                <div className="theme-surface-soft rounded-[28px] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow text-muted">Your account</p>
                      <p className="mt-2 text-base font-semibold text-foreground">{currentUser.displayName}</p>
                      <p className="mt-1 text-xs text-muted">@{currentUser.username}</p>
                    </div>
                    <span className="ui-pill ui-pill-surface text-xs">{currentUser.role}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                      {currentUser.authProvider === "google" ? "Google sign-in" : "Local account"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Your account details stay visible here even without full admin tooling. Use Access for your defaults and sign-in controls.
                  </p>
                </div>
              ) : null}

              <div className="theme-surface-soft rounded-[28px] p-5">
                <p className="eyebrow text-muted">All sections</p>
                <div className="mt-3 space-y-2">
                  {helpSections.map((section, index) => (
                    <button
                      key={section.id}
                      className="ui-button ui-button-secondary w-full justify-between rounded-[20px] px-4 py-3 text-left text-sm"
                      type="button"
                      onClick={() => {
                        document.getElementById(`help-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      <span>{index + 1}. {section.title}</span>
                      <span className="text-xs text-muted">{section.context}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="theme-surface-soft rounded-[28px] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-muted">Overview</p>
                  <p className="mt-2 text-base font-semibold text-foreground">{focusSummary.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{focusSummary.intro}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contextSections.map((section) => (
                    <button
                      key={section.id}
                      className="ui-button ui-button-chip ui-button-secondary px-3 py-2 text-xs"
                      type="button"
                      onClick={() => {
                        document.getElementById(`help-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!isPageSurface && currentUser && currentUser.role !== "admin" ? (
              <div className="theme-surface-soft rounded-[28px] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow text-muted">Your account</p>
                    <p className="mt-2 text-base font-semibold text-foreground">{currentUser.displayName}</p>
                    <p className="mt-1 text-xs text-muted">@{currentUser.username}</p>
                  </div>
                  <span className="ui-pill ui-pill-surface text-xs">{currentUser.role}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                    {currentUser.authProvider === "google" ? "Google sign-in" : "Local account"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Your account details stay visible here even without full admin tooling. Use Access for your defaults and sign-in controls.
                </p>
              </div>
            ) : null}

            {!isPageSurface ? (
              <div className="theme-surface-soft rounded-[28px] p-5">
                <p className="eyebrow text-muted">Table of contents</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {helpSections.map((section, index) => (
                    <button
                      key={section.id}
                      className="ui-button ui-button-secondary justify-between rounded-[20px] px-4 py-3 text-left text-sm"
                      type="button"
                      onClick={() => {
                        document.getElementById(`help-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      <span>{index + 1}. {section.title}</span>
                      <span className="text-xs text-muted">{section.context}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {helpSections.map((section, index) => (
            <div id={`help-section-${section.id}`} key={section.id} className="theme-surface-soft rounded-[28px] p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{section.title}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">{section.context}</p>
                </div>
              </div>
              <div className="theme-surface-strong mt-4 rounded-[22px] px-4 py-4">
                <p className="eyebrow text-muted">Technical summary</p>
                <p className="mt-3 text-sm leading-7 text-muted">{section.summary}</p>
              </div>
              <div className="mt-4 rounded-[22px] border border-line/70 px-4 py-4">
                <p className="eyebrow text-muted">Technical detail</p>
                <div className="mt-3 space-y-3">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-7 text-muted">{paragraph}</p>
                  ))}
                </div>
              </div>
              <div className="theme-surface-panel mt-4 rounded-[22px] px-4 py-4">
                <p className="eyebrow text-muted">In plain language</p>
                <div className="mt-3 space-y-3">
                  {section.plainLanguage.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-7 text-muted">{paragraph}</p>
                  ))}
                </div>
                {section.comparison ? (
                  <div className="theme-surface-chip mt-4 rounded-[18px] px-3 py-3 text-sm leading-6 text-foreground">
                    <span className="font-semibold">Think of it as:</span> {section.comparison}
                  </div>
                ) : null}
              </div>
              <div className="theme-surface-elevated mt-4 rounded-[22px] px-4 py-4">
                <p className="eyebrow text-muted">Operational steps</p>
                <div className="mt-3 space-y-2">
                  {section.keyPoints.map((point) => (
                    <div key={point} className="theme-surface-chip rounded-[18px] px-3 py-3 text-sm leading-6 text-foreground">
                      {point}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

            <div className="theme-surface-soft rounded-[28px] p-5">
              <p className="eyebrow text-muted">Glossary</p>
              <div className="mt-3 space-y-3">
                {helpGlossary.map((item) => (
                  <div key={item.term} className="theme-surface-strong rounded-[22px] px-4 py-4">
                    <p className="text-sm font-semibold text-foreground">{item.term}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.definition}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="theme-surface-soft rounded-[28px] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-muted">References</p>
                  <p className="mt-2 text-base font-semibold text-foreground">Free docs, courses, and blog-style explainers</p>
                  <p className="mt-2 text-sm leading-6 text-muted">Official docs come first for accuracy. The blog and course links are useful when you want the same ideas explained in a more human teaching voice.</p>
                </div>
                <span className="ui-pill ui-pill-surface">External</span>
              </div>
              <div className="mt-4 space-y-3">
                {helpReferences.map((item) => (
                  <div key={item.url} className="theme-surface-strong rounded-[22px] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
                      </div>
                      <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">{item.category}</span>
                    </div>
                    <a className="mt-3 inline-flex text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline" href={item.url} rel="noreferrer" target="_blank">
                      {item.url}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}