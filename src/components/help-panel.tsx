"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PlushLlamaHero } from "@/components/plush-llama-hero";
import {
  helpGlossary,
  helpReferences,
  helpSections,
  type HelpContext,
} from "@/lib/help-manual";
import type { OllamaStatus } from "@/lib/ollama";
import { parseAppTheme } from "@/lib/theme";
import { translateUi, translateUiText } from "@/lib/ui-language";
import type { SessionUser, VoiceTranscriptionLanguage } from "@/lib/user-types";

type HelpPanelProps = {
  context: HelpContext;
  currentUser: SessionUser | null;
  onReplayWalkthrough?: () => void;
  requestedSectionId: string | null;
  requestedSectionNonce: number;
  surface?: "embedded" | "page";
  status: OllamaStatus;
  uiLanguagePreference: VoiceTranscriptionLanguage;
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
  onReplayWalkthrough,
  requestedSectionId,
  requestedSectionNonce,
  surface = "embedded",
  status,
  uiLanguagePreference,
}: HelpPanelProps) {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const t = (key: Parameters<typeof translateUi>[1], variables?: Record<string, string | number>) =>
    translateUi(uiLanguagePreference, key, variables);
  const literal = useCallback(
    (sourceText: string, variables?: Record<string, string | number>) =>
      translateUiText(uiLanguagePreference, sourceText, variables),
    [uiLanguagePreference],
  );
  const isPageSurface = surface === "page";
  const localizedHelpSections = useMemo(
    () => helpSections.map((section) => ({
      ...section,
      title: literal(section.title),
      summary: literal(section.summary),
      body: section.body.map((paragraph) => literal(paragraph)),
      plainLanguage: section.plainLanguage.map((paragraph) => literal(paragraph)),
      comparison: section.comparison ? literal(section.comparison) : undefined,
      keyPoints: section.keyPoints.map((point) => literal(point)),
    })),
    [literal],
  );
  const localizedGlossary = useMemo(
    () => helpGlossary.map((item) => ({
      ...item,
      term: literal(item.term),
      definition: literal(item.definition),
      links: item.links?.map((link) => ({
        ...link,
        title: literal(link.title),
      })),
    })),
    [literal],
  );
  const localizedReferences = useMemo(
    () => helpReferences.map((item) => ({
      ...item,
      title: literal(item.title),
      description: literal(item.description),
      category: literal(item.category),
    })),
    [literal],
  );
  const totalSectionCount = helpSections.length;
  const contextSections = useMemo(
    () => localizedHelpSections.filter((section) => section.context === context),
    [context, localizedHelpSections],
  );
  const contextLabel = (value: HelpContext) => {
    if (value === "chat") return t("chat");
    if (value === "access") return t("access");
    if (value === "models") return t("models");
    if (value === "jobs") return t("jobs");
    return t("activity");
  };
  const focusSummary = {
    badge: contextLabel(context),
    title: literal(contextSummary[context].title),
    intro: literal(contextSummary[context].intro),
  };

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
      const appTheme = parseAppTheme(document.documentElement.dataset.theme);
      const { PDFArray, PDFDocument, PDFName, PDFString, StandardFonts, rgb } = await import("pdf-lib");
      const pdfDocument = await PDFDocument.create();
      const regularFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
      const pageSize = { width: 612, height: 792 };
      const margin = 38;
      const contentWidth = pageSize.width - margin * 2;
      const baseLineHeight = 15;
      const contextPalette: Record<HelpContext, {
        accent: [number, number, number];
        soft: [number, number, number];
        line: [number, number, number];
        ink: [number, number, number];
      }> = {
        chat: {
          accent: [0.78, 0.43, 0.28],
          soft: [0.98, 0.94, 0.9],
          line: [0.86, 0.73, 0.62],
          ink: [0.27, 0.16, 0.11],
        },
        access: {
          accent: [0.34, 0.47, 0.73],
          soft: [0.92, 0.95, 0.99],
          line: [0.73, 0.8, 0.9],
          ink: [0.12, 0.2, 0.34],
        },
        models: {
          accent: [0.18, 0.57, 0.52],
          soft: [0.91, 0.98, 0.96],
          line: [0.68, 0.85, 0.81],
          ink: [0.08, 0.25, 0.22],
        },
        jobs: {
          accent: [0.79, 0.56, 0.19],
          soft: [0.99, 0.96, 0.9],
          line: [0.9, 0.81, 0.61],
          ink: [0.35, 0.24, 0.09],
        },
        activity: {
          accent: [0.59, 0.39, 0.67],
          soft: [0.95, 0.92, 0.98],
          line: [0.83, 0.75, 0.89],
          ink: [0.25, 0.15, 0.31],
        },
      };

      let page = pdfDocument.addPage([pageSize.width, pageSize.height]);
      let cursorY = pageSize.height - margin;
      const anchors = new Map<string, { page: typeof page; x: number; y: number }>();
      const pendingInternalLinks: Array<{ sourcePage: typeof page; rect: [number, number, number, number]; targetId: string }> = [];

      const color = (value: [number, number, number]) => rgb(value[0], value[1], value[2]);

      const resetPageChrome = () => {
        page.drawRectangle({
          x: 0,
          y: pageSize.height - 26,
          width: pageSize.width,
          height: 26,
          color: rgb(0.98, 0.96, 0.93),
        });
        page.drawRectangle({
          x: margin,
          y: pageSize.height - 30,
          width: contentWidth,
          height: 2,
          color: rgb(0.82, 0.67, 0.53),
        });
      };

      const addPage = () => {
        page = pdfDocument.addPage([pageSize.width, pageSize.height]);
        cursorY = pageSize.height - margin;
        resetPageChrome();
      };

      const toPdfRect = (x: number, topY: number, width: number, height: number): [number, number, number, number] => [
        x,
        topY - height,
        x + width,
        topY,
      ];

      const ensureAnnotations = (targetPage: typeof page) => {
        let annotations = targetPage.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
        if (!annotations) {
          targetPage.node.set(PDFName.of("Annots"), pdfDocument.context.obj([]));
          annotations = targetPage.node.lookup(PDFName.of("Annots"), PDFArray);
        }
        return annotations;
      };

      const addAnnotation = (targetPage: typeof page, annotation: Record<string, unknown>) => {
        const annotationRef = pdfDocument.context.register(pdfDocument.context.obj(annotation));
        ensureAnnotations(targetPage).push(annotationRef);
      };

      const addUriLink = (targetPage: typeof page, rect: [number, number, number, number], url: string) => {
        addAnnotation(targetPage, {
          Type: "Annot",
          Subtype: "Link",
          Rect: rect,
          Border: [0, 0, 0],
          A: {
            Type: "Action",
            S: "URI",
            URI: PDFString.of(url),
          },
        });
      };

      const addInternalLink = (
        targetPage: typeof page,
        rect: [number, number, number, number],
        destination: { page: typeof page; x: number; y: number },
      ) => {
        addAnnotation(targetPage, {
          Type: "Annot",
          Subtype: "Link",
          Rect: rect,
          Border: [0, 0, 0],
          Dest: [destination.page.ref, PDFName.of("XYZ"), destination.x, destination.y, null],
        });
      };

      const setAnchor = (anchorId: string, targetPage: typeof page, topY: number) => {
        anchors.set(anchorId, {
          page: targetPage,
          x: margin,
          y: topY,
        });
      };

      resetPageChrome();

      const ensureSpace = (requiredHeight: number, forceNewPage = false) => {
        if (!forceNewPage && cursorY - requiredHeight >= margin) {
          return;
        }

        addPage();
      };

      const drawPanel = (
        x: number,
        topY: number,
        width: number,
        height: number,
        fillColor: [number, number, number],
        borderColor: [number, number, number],
      ) => {
        page.drawRectangle({
          x,
          y: topY - height,
          width,
          height,
          color: color(fillColor),
          borderColor: color(borderColor),
          borderWidth: 1,
        });
      };

      const drawLines = (
        lines: string[],
        options?: {
          bold?: boolean;
          color?: [number, number, number];
          fontSize?: number;
          lineHeight?: number;
          x?: number;
        },
      ) => {
        const fontSize = options?.fontSize ?? 11;
        const lineHeight = options?.lineHeight ?? baseLineHeight;
        const font = options?.bold ? boldFont : regularFont;
        const textColor = options?.color ?? [0.12, 0.12, 0.1];
        const x = options?.x ?? margin;
        const neededHeight = lines.length * lineHeight + 4;

        ensureSpace(neededHeight);

        for (const line of lines) {
          page.drawText(line, {
            x,
            y: cursorY,
            size: fontSize,
            font,
            color: color(textColor),
          });
          cursorY -= lineHeight;
        }

        cursorY -= 4;
      };

      const drawParagraph = (
        text: string,
        options?: {
          bold?: boolean;
          color?: [number, number, number];
          fontSize?: number;
          lineHeight?: number;
          maxCharacters?: number;
          x?: number;
        },
      ) => {
        drawLines(wrapText(text, options?.maxCharacters ?? 84), options);
      };

      const estimateWrappedHeight = (
        text: string,
        options?: {
          lineHeight?: number;
          maxCharacters?: number;
          maxLines?: number;
        },
      ) => {
        const wrappedLines = wrapText(text, options?.maxCharacters ?? 84);
        const visibleLines = options?.maxLines ? wrappedLines.slice(0, options.maxLines) : wrappedLines;
        return visibleLines.length * (options?.lineHeight ?? baseLineHeight) + 4;
      };

      const estimateSectionHeadingHeight = (minimumFollowingHeight = 54) => 26 + 10 + minimumFollowingHeight;

      const drawDivider = (
        x: number,
        y: number,
        width: number,
        dividerColor: [number, number, number],
        thickness = 1,
      ) => {
        page.drawLine({
          start: { x, y },
          end: { x: x + width, y },
          thickness,
          color: color(dividerColor),
        });
      };

      const drawPill = (
        label: string,
        x: number,
        topY: number,
        fillColor: [number, number, number],
        textColor: [number, number, number],
      ) => {
        const width = Math.max(72, label.length * 5.4 + 20);
        const height = 18;
        page.drawRectangle({
          x,
          y: topY - height,
          width,
          height,
          color: color(fillColor),
        });
        page.drawText(label, {
          x: x + 8,
          y: topY - 12.5,
          size: 8.5,
          font: boldFont,
          color: color(textColor),
        });
      };

      const drawQuickStepCard = (
        stepNumber: number,
        title: string,
        detail: string,
        topY: number,
      ) => {
        const height = 62;
        drawPanel(margin, topY, contentWidth, height, [0.985, 0.98, 0.965], [0.86, 0.77, 0.68]);
        page.drawCircle({
          x: margin + 22,
          y: topY - 21,
          size: 11,
          color: rgb(0.77, 0.43, 0.28),
        });
        page.drawText(String(stepNumber), {
          x: margin + 18.5,
          y: topY - 25,
          size: 9,
          font: boldFont,
          color: rgb(1, 1, 1),
        });
        page.drawText(title, {
          x: margin + 44,
          y: topY - 19,
          size: 11,
          font: boldFont,
          color: rgb(0.23, 0.17, 0.13),
        });
        const detailLines = wrapText(detail, 78).slice(0, 2);
        let detailY = topY - 35;
        for (const line of detailLines) {
          page.drawText(line, {
            x: margin + 44,
            y: detailY,
            size: 9,
            font: regularFont,
            color: rgb(0.34, 0.3, 0.25),
          });
          detailY -= 11;
        }

        return {
          x: margin,
          topY,
          width: contentWidth,
          height,
        };
      };

      const drawBrandMark = (
        x: number,
        topY: number,
        palette: (typeof contextPalette)[HelpContext],
        options?: {
          accent?: [number, number, number];
          scarf?: boolean;
          visor?: boolean;
          badge?: boolean;
          glow?: boolean;
          scaleMultiplier?: number;
        },
      ) => {
        const accent = options?.accent ?? palette.accent;
        const scale = 0.8 * (options?.scaleMultiplier ?? 1);
        const px = (value: number) => x + value * scale;
        const py = (value: number) => topY - value * scale;
        const drawCircle = (
          cx: number,
          cy: number,
          radius: number,
          fillColor: [number, number, number],
          opacity?: number,
        ) => {
          page.drawCircle({
            x: px(cx),
            y: py(cy),
            size: radius * scale,
            color: color(fillColor),
            opacity,
          });
        };
        const drawRect = (
          left: number,
          top: number,
          width: number,
          height: number,
          fillColor: [number, number, number],
          opacity?: number,
        ) => {
          page.drawRectangle({
            x: px(left),
            y: topY - (top + height) * scale,
            width: width * scale,
            height: height * scale,
            color: color(fillColor),
            opacity,
          });
        };
        const themeVariant = appTheme === "dark"
          ? {
            ring: [0.95, 0.78, 0.56] as [number, number, number],
            ringEdge: [0.94, 0.89, 0.83] as [number, number, number],
            inner: [0.18, 0.14, 0.13] as [number, number, number],
            letter: [0.93, 0.64, 0.36] as [number, number, number],
            gloss: [1, 0.93, 0.86] as [number, number, number],
          }
          : appTheme === "tech"
            ? {
              ring: [0.97, 0.82, 0.59] as [number, number, number],
              ringEdge: [0.52, 0.9, 0.96] as [number, number, number],
              inner: [0.93, 0.98, 1] as [number, number, number],
              letter: [0.74, 0.4, 0.18] as [number, number, number],
              gloss: [0.93, 1, 1] as [number, number, number],
            }
            : {
              ring: [0.98, 0.86, 0.69] as [number, number, number],
              ringEdge: [0.69, 0.36, 0.15] as [number, number, number],
              inner: [1, 0.98, 0.95] as [number, number, number],
              letter: [0.56, 0.27, 0.11] as [number, number, number],
              gloss: [1, 0.96, 0.89] as [number, number, number],
            };

        if (options?.glow) {
          drawCircle(90, 84, 46, palette.soft, 0.78);
        }

        drawCircle(90, 84, 42, themeVariant.ring);
        drawCircle(90, 84, 30, themeVariant.inner);
        drawCircle(90, 84, 42, themeVariant.ringEdge, 0.18);
        drawRect(95, 48, 14, 46, themeVariant.letter);
        drawRect(95, 80, 28, 14, accent);
        drawRect(62, 46, 46, 8, themeVariant.gloss, 0.72);
        drawCircle(76, 92, 4, themeVariant.gloss, 0.74);
        drawCircle(104, 68, 3.6, themeVariant.gloss, 0.62);

        if (options?.scarf) {
          drawRect(74, 114, 34, 8, accent);
          drawRect(88, 120, 8, 18, accent);
        }

        if (options?.visor) {
          drawRect(64, 74, 52, 6, accent);
          drawRect(62, 72, 4, 12, accent);
          drawRect(114, 72, 4, 12, accent);
        }

        if (options?.badge) {
          drawCircle(123, 116, 7, accent);
          drawCircle(123, 116, 3, [1, 1, 1]);
        }
      };

      const drawSceneWindow = (
        x: number,
        topY: number,
        width: number,
        height: number,
        palette: (typeof contextPalette)[HelpContext],
      ) => {
        drawPanel(x, topY, width, height, [1, 1, 1], palette.line);
        page.drawRectangle({
          x: x + 8,
          y: topY - height + 8,
          width: width - 16,
          height: height - 16,
          color: color(palette.soft),
        });
        page.drawCircle({ x: x + 18, y: topY - 12, size: 3.5, color: color(palette.accent) });
        page.drawCircle({ x: x + 29, y: topY - 12, size: 3.5, color: color(palette.line) });
        page.drawCircle({ x: x + 40, y: topY - 12, size: 3.5, color: rgb(1, 1, 1) });
      };

      const drawSpeechBubble = (
        x: number,
        topY: number,
        width: number,
        height: number,
        palette: (typeof contextPalette)[HelpContext],
        lines: number,
      ) => {
        drawPanel(x, topY, width, height, [1, 1, 1], palette.line);
        for (let lineIndex = 0; lineIndex < lines; lineIndex += 1) {
          page.drawRectangle({
            x: x + 8,
            y: topY - 15 - lineIndex * 10,
            width: width - 16 - lineIndex * 10,
            height: 4,
            color: color(lineIndex === 0 ? palette.accent : palette.line),
          });
        }
      };

      const drawSectionScene = (
        sectionContext: HelpContext,
        x: number,
        topY: number,
        width: number,
        height: number,
      ) => {
        const palette = contextPalette[sectionContext];
        drawSceneWindow(x, topY, width, height, palette);

        if (sectionContext === "chat") {
          drawSpeechBubble(x + 12, topY - 22, 66, 28, palette, 2);
          drawSpeechBubble(x + 98, topY - 14, 70, 34, palette, 3);
          drawBrandMark(x + 28, topY - 8, palette, { scarf: true, glow: true });
          page.drawRectangle({ x: x + 100, y: topY - 90, width: 56, height: 9, color: color(palette.accent) });
          page.drawRectangle({ x: x + 100, y: topY - 104, width: 42, height: 7, color: rgb(1, 1, 1) });
        } else if (sectionContext === "access") {
          drawBrandMark(x + 18, topY - 10, palette, { badge: true, accent: [0.29, 0.46, 0.78] });
          drawPanel(x + 96, topY - 16, 64, 74, [1, 1, 1], palette.line);
          page.drawRectangle({ x: x + 106, y: topY - 40, width: 28, height: 22, color: color(palette.accent) });
          page.drawRectangle({ x: x + 102, y: topY - 61, width: 36, height: 10, color: rgb(1, 1, 1) });
          page.drawRectangle({ x: x + 108, y: topY - 76, width: 44, height: 8, color: color(palette.line) });
          page.drawCircle({ x: x + 145, y: topY - 36, size: 8, color: color(palette.accent) });
          page.drawRectangle({ x: x + 142, y: topY - 49, width: 6, height: 10, color: color(palette.accent) });
        } else if (sectionContext === "models") {
          drawBrandMark(x + 20, topY - 8, palette, { visor: true, glow: true, accent: [0.15, 0.63, 0.59] });
          page.drawCircle({ x: x + 134, y: topY - 42, size: 24, color: color(palette.accent) });
          page.drawCircle({ x: x + 134, y: topY - 42, size: 13, color: rgb(1, 1, 1) });
          page.drawRectangle({ x: x + 103, y: topY - 88, width: 62, height: 10, color: rgb(1, 1, 1) });
          page.drawRectangle({ x: x + 103, y: topY - 103, width: 48, height: 8, color: color(palette.line) });
          page.drawRectangle({ x: x + 103, y: topY - 116, width: 36, height: 8, color: color(palette.accent) });
        } else if (sectionContext === "jobs") {
          drawBrandMark(x + 16, topY - 8, palette, { scarf: true, accent: [0.83, 0.61, 0.23] });
          for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
            const rowTop = topY - 30 - rowIndex * 22;
            page.drawRectangle({ x: x + 92, y: rowTop - 14, width: 72, height: 14, color: rgb(1, 1, 1) });
            page.drawRectangle({ x: x + 98, y: rowTop - 10, width: 18 + rowIndex * 14, height: 6, color: color(palette.accent) });
            page.drawCircle({ x: x + 155, y: rowTop - 7, size: 4.5, color: rowIndex === 1 ? color(palette.line) : color(palette.accent) });
          }
          page.drawLine({ start: { x: x + 92, y: topY - 98 }, end: { x: x + 164, y: topY - 98 }, thickness: 2, color: color(palette.line) });
        } else {
          drawBrandMark(x + 16, topY - 8, palette, { badge: true, accent: [0.67, 0.47, 0.76], glow: true });
          page.drawLine({ start: { x: x + 106, y: topY - 24 }, end: { x: x + 106, y: topY - 106 }, thickness: 2, color: color(palette.line) });
          for (let nodeIndex = 0; nodeIndex < 3; nodeIndex += 1) {
            const nodeY = topY - 34 - nodeIndex * 24;
            page.drawCircle({ x: x + 106, y: nodeY, size: 5, color: color(palette.accent) });
            page.drawRectangle({ x: x + 118, y: nodeY - 8, width: 40, height: 14, color: rgb(1, 1, 1) });
          }
          page.drawCircle({ x: x + 150, y: topY - 38, size: 10, color: color(palette.soft) });
        }
      };

      const drawCoverHero = (
        x: number,
        topY: number,
        width: number,
        height: number,
        palette: (typeof contextPalette)[HelpContext],
      ) => {
        drawPanel(x, topY, width, height, [1, 1, 1], palette.line);
        page.drawRectangle({
          x: x + 12,
          y: topY - height + 12,
          width: width - 24,
          height: height - 24,
          color: color([0.985, 0.95, 0.91]),
        });
        page.drawCircle({ x: x + 20, y: topY - 18, size: 4, color: color(palette.accent) });
        page.drawCircle({ x: x + 34, y: topY - 18, size: 4, color: color(palette.line) });
        page.drawCircle({ x: x + 48, y: topY - 18, size: 4, color: rgb(1, 1, 1) });

        drawPanel(x + 22, topY - 34, 66, 34, [1, 1, 1], palette.line);
        page.drawRectangle({ x: x + 30, y: topY - 61, width: 50, height: 6, color: color(palette.accent) });
        page.drawRectangle({ x: x + 30, y: topY - 75, width: 38, height: 4, color: color(palette.line) });
        page.drawRectangle({ x: x + 30, y: topY - 87, width: 28, height: 4, color: color(palette.line) });

        drawPanel(x + width - 84, topY - 12, 58, 30, [1, 1, 1], palette.line);
        page.drawRectangle({ x: x + width - 74, y: topY - 36, width: 38, height: 5, color: color(palette.accent) });
        page.drawRectangle({ x: x + width - 74, y: topY - 48, width: 28, height: 4, color: color(palette.line) });
        page.drawRectangle({ x: x + width - 74, y: topY - 59, width: 20, height: 4, color: color(palette.line) });

        drawBrandMark(x + 42, topY - 16, palette, { glow: true, scaleMultiplier: 1.08 });
      };

      const drawSectionOverview = (section: (typeof localizedHelpSections)[number], sectionNumber: number) => {
        const palette = contextPalette[section.context];
        const cardHeight = 228;
        const illustrationWidth = 188;
        const walkthroughWidth = (contentWidth - 44) / 3;
        const sectionWalkthrough = [
          {
            label: literal("Spot it"),
            text: section.summary,
          },
          {
            label: literal("Use it"),
            text: section.plainLanguage[0] ?? section.body[0] ?? section.summary,
          },
          {
            label: literal("Remember"),
            text: section.keyPoints[0] ?? section.summary,
          },
        ];

        ensureSpace(cardHeight, sectionNumber > 1);
        const cardTop = cursorY;
        const illustrationTop = cardTop - 24;
        drawPanel(margin, cardTop, contentWidth, cardHeight, palette.soft, palette.line);
        drawPill(`${literal("Step")} ${sectionNumber}`, margin + 16, cardTop - 12, palette.accent, [1, 1, 1]);
        drawPill(contextLabel(section.context), margin + 98, cardTop - 12, [1, 1, 1], palette.ink);

        page.drawText(section.title, {
          x: margin + 18,
          y: cardTop - 44,
          size: 18,
          font: boldFont,
          color: color(palette.ink),
        });

        let summaryY = cardTop - 64;
        for (const line of wrapText(section.summary, 43).slice(0, 5)) {
          page.drawText(line, {
            x: margin + 18,
            y: summaryY,
            size: 10,
            font: regularFont,
            color: rgb(0.26, 0.23, 0.2),
          });
          summaryY -= 12;
        }

        drawSectionScene(section.context, margin + contentWidth - illustrationWidth - 16, illustrationTop, illustrationWidth, 118);

        sectionWalkthrough.forEach((step, stepIndex) => {
          const cardX = margin + 16 + stepIndex * (walkthroughWidth + 6);
          const cardTopY = cardTop - 146;
          drawPanel(cardX, cardTopY, walkthroughWidth, 62, [1, 1, 1], palette.line);
          page.drawText(step.label, {
            x: cardX + 8,
            y: cardTopY - 16,
            size: 9,
            font: boldFont,
            color: color(palette.ink),
          });
          let stepTextY = cardTopY - 30;
          for (const line of wrapText(step.text, 20).slice(0, 2)) {
            page.drawText(line, {
              x: cardX + 8,
              y: stepTextY,
              size: 8.5,
              font: regularFont,
              color: rgb(0.3, 0.28, 0.24),
            });
            stepTextY -= 10;
          }
        });

        cursorY = cardTop - cardHeight - 10;
      };

      const drawSectionContinuationHeader = (
        section: (typeof localizedHelpSections)[number],
        palette: (typeof contextPalette)[HelpContext],
      ) => {
        const blockHeight = 44;
        ensureSpace(blockHeight + 10);
        drawPill(contextLabel(section.context), margin, cursorY - 2, palette.accent, [1, 1, 1]);
        page.drawText(section.title, {
          x: margin,
          y: cursorY - 30,
          size: 17,
          font: boldFont,
          color: color(palette.ink),
        });
        drawDivider(margin, cursorY - 36, contentWidth, palette.line, 1.5);
        cursorY -= blockHeight + 10;
      };

      const drawSectionHeading = (label: string, palette: (typeof contextPalette)[HelpContext], minimumFollowingHeight = 54) => {
        const blockHeight = 26;
        ensureSpace(estimateSectionHeadingHeight(minimumFollowingHeight));
        drawPanel(margin, cursorY, contentWidth, blockHeight, [1, 1, 1], palette.line);
        page.drawText(label, {
          x: margin + 12,
          y: cursorY - 16,
          size: 11,
          font: boldFont,
          color: color(palette.ink),
        });
        drawDivider(margin + 12, cursorY - 20, contentWidth - 24, palette.accent, 1.5);
        cursorY -= blockHeight + 10;
      };

      const drawLinkBadge = (
        label: string,
        url: string,
        x: number,
        topY: number,
        options?: {
          fillColor?: [number, number, number];
          textColor?: [number, number, number];
        },
      ) => {
        const width = Math.min(contentWidth - 24, Math.max(96, label.length * 5.1 + 18));
        const height = 16;
        page.drawRectangle({
          x,
          y: topY - height,
          width,
          height,
          color: color(options?.fillColor ?? [0.93, 0.96, 0.99]),
        });
        page.drawText(label, {
          x: x + 7,
          y: topY - 11.5,
          size: 8,
          font: boldFont,
          color: color(options?.textColor ?? [0.18, 0.28, 0.44]),
        });
        addUriLink(page, toPdfRect(x, topY, width, height), url);
        return width;
      };

      const renderTocPage = (tocPage: typeof page) => {
        const previousPage = page;
        const previousCursorY = cursorY;
        const tocEntries = [
          {
            label: literal("Quick-start walkthrough"),
            targetId: "quick-start",
          },
          ...localizedHelpSections.map((section) => ({
            label: section.title,
            targetId: section.id,
          })),
          {
            label: t("glossary"),
            targetId: "glossary",
          },
          {
            label: literal("Licensing appendix"),
            targetId: "licensing",
          },
          {
            label: t("references"),
            targetId: "references",
          },
        ];

        page = tocPage;
        cursorY = pageSize.height - margin;
        resetPageChrome();

        drawLines([literal("Table of contents")], { bold: true, fontSize: 18, color: [0.23, 0.18, 0.13] });
        drawParagraph(literal("Use the links below to jump straight into the matching manual section, glossary, or licensing note."), {
          fontSize: 10,
          color: [0.34, 0.3, 0.25],
          maxCharacters: 88,
        });

        for (const entry of tocEntries) {
          const destination = anchors.get(entry.targetId);
          if (!destination) {
            continue;
          }

          ensureSpace(26);
          const pageNumber = pdfDocument.getPages().indexOf(destination.page) + 1;
          const rowTop = cursorY;

          page.drawRectangle({
            x: margin,
            y: rowTop - 18,
            width: contentWidth,
            height: 18,
            color: rgb(0.985, 0.98, 0.97),
          });
          page.drawText(entry.label, {
            x: margin + 10,
            y: rowTop - 12.5,
            size: 10,
            font: boldFont,
            color: rgb(0.23, 0.18, 0.13),
          });
          page.drawText(String(pageNumber), {
            x: pageSize.width - margin - 18,
            y: rowTop - 12.5,
            size: 9,
            font: boldFont,
            color: rgb(0.42, 0.36, 0.31),
          });
          addInternalLink(page, toPdfRect(margin, rowTop, contentWidth, 18), destination);
          cursorY -= 24;
        }

        page = previousPage;
        cursorY = previousCursorY;
      };

      const quickStartCards = [
        {
          title: literal("Open Chat"),
          detail: literal("Start in the conversation surface to draft the request and watch replies stream back live."),
          targetId: "chat-overview",
        },
        {
          title: literal("Pick the route"),
          detail: literal("Choose the model path, assistant profile, and reply style that fit the task before sending."),
          targetId: "prompting-and-control",
        },
        {
          title: literal("Use grounding deliberately"),
          detail: literal("Turn on shared knowledge when you want retrieval-backed answers. That improves this run; it does not retrain the model."),
          targetId: "knowledge-operations",
        },
        {
          title: literal("Configure in Admin"),
          detail: literal("Use Access, Models, Jobs, and Activity to handle identity, providers, runtime state, queue work, and audit review."),
          targetId: "access-control",
        },
        {
          title: literal("Keep Help nearby"),
          detail: literal("The manual, glossary, references, and replay walkthrough give you the same guidance in both quick and deep formats."),
          targetId: "glossary",
        },
      ];

      const licensingAppendix = [
        {
          title: literal("Oload installer legal flow"),
          body: literal("The shipped installers require explicit EULA acceptance and then present a source-available proprietary licensing notice before runtime setup continues on either Windows or Linux."),
          links: [
            {
              title: literal("End-user license agreement overview"),
              url: "https://en.wikipedia.org/wiki/End-user_license_agreement",
            },
            {
              title: literal("Source-available software overview"),
              url: "https://en.wikipedia.org/wiki/Source-available_software",
            },
          ],
        },
        {
          title: literal("EULA note for operators"),
          body: literal("Treat the EULA as the acceptance gate for using the installed product. In this workspace the installer documentation describes that legal flow as source-available proprietary licensing, not a blanket open-source grant."),
          links: [
            {
              title: literal("End-user license agreement overview"),
              url: "https://en.wikipedia.org/wiki/End-user_license_agreement",
            },
          ],
        },
        {
          title: literal("GNU GPL reference context"),
          body: literal("GNU GPL material matters when reviewing third-party copyleft components and redistribution duties. The installer README does not describe Oload itself as GPL software, so the GNU links here are included as legal reference context rather than as the primary Oload product license."),
          links: [
            {
              title: literal("GNU GPL v3 text"),
              url: "https://www.gnu.org/licenses/gpl-3.0.en.html",
            },
            {
              title: literal("GNU GPL FAQ"),
              url: "https://www.gnu.org/licenses/gpl-faq.html",
            },
          ],
        },
      ];

      ensureSpace(260);
      drawPanel(margin, cursorY, contentWidth, 208, [0.99, 0.965, 0.935], [0.84, 0.7, 0.57]);
      page.drawText(t("helpManualTitle"), {
        x: margin + 18,
        y: cursorY - 38,
        size: 24,
        font: boldFont,
        color: rgb(0.42, 0.19, 0.11),
      });
      let heroY = cursorY - 62;
      for (const line of wrapText(t("helpManualSubtitle"), 62).slice(0, 3)) {
        page.drawText(line, {
          x: margin + 18,
          y: heroY,
          size: 11,
          font: regularFont,
          color: rgb(0.32, 0.28, 0.24),
        });
        heroY -= 14;
      }
      drawPill(`${t("currentFocus")}: ${focusSummary.badge}`, margin + 18, cursorY - 112, [0.84, 0.73, 0.63], [0.29, 0.19, 0.13]);
      drawPill(status.isReachable ? t("gatewayOnline") : t("attentionNeeded"), margin + 134, cursorY - 112, [1, 1, 1], [0.25, 0.22, 0.18]);
      drawPill(currentUser ? currentUser.displayName : t("localAccount"), margin + 252, cursorY - 112, [1, 1, 1], [0.25, 0.22, 0.18]);
      drawCoverHero(margin + contentWidth - 210, cursorY - 22, 186, 126, contextPalette.chat);
      cursorY -= 228;

      addPage();
      setAnchor("quick-start", page, cursorY);
      drawLines([literal("Quick-start walkthrough")], { bold: true, fontSize: 15, color: [0.23, 0.18, 0.13] });
      drawParagraph(literal("This PDF now mirrors the in-app walkthrough. Each card below links to the matching detailed section so you can jump directly from the quick-start to the full explanation."), {
        color: [0.34, 0.3, 0.25],
        fontSize: 10,
        maxCharacters: 88,
      });

      for (const [quickStepIndex, step] of quickStartCards.entries()) {
        ensureSpace(70);
        const cardBounds = drawQuickStepCard(quickStepIndex + 1, step.title, step.detail, cursorY);
        pendingInternalLinks.push({
          sourcePage: page,
          rect: toPdfRect(cardBounds.x, cardBounds.topY, cardBounds.width, cardBounds.height),
          targetId: step.targetId,
        });
        cursorY -= 70;
      }

      for (const [sectionIndex, section] of localizedHelpSections.entries()) {
        const palette = contextPalette[section.context];
        drawSectionOverview(section, sectionIndex + 1);
        const technicalDetailMinimumHeight = Math.max(
          72,
          estimateWrappedHeight(section.body[0] ?? "", { maxCharacters: 84 }) + 18,
        );

        if (cursorY - (estimateSectionHeadingHeight(technicalDetailMinimumHeight) + 12) < margin) {
          addPage();
          setAnchor(section.id, page, cursorY);
          drawSectionContinuationHeader(section, palette);
        } else {
          setAnchor(section.id, page, cursorY);
        }

        drawSectionHeading(
          t("technicalDetail"),
          palette,
          technicalDetailMinimumHeight,
        );
        for (const paragraph of section.body) {
          drawParagraph(paragraph, { fontSize: 10, color: [0.2, 0.2, 0.2] });
        }

        drawSectionHeading(
          literal("Operator walkthrough"),
          palette,
          Math.max(72, estimateWrappedHeight(section.plainLanguage[0] ?? "", { maxCharacters: 84 }) + 18),
        );
        for (const paragraph of section.plainLanguage) {
          drawParagraph(paragraph, { fontSize: 10, color: [0.28, 0.28, 0.28] });
        }

        if (section.comparison) {
          drawParagraph(`${t("thinkingOfItAs")} ${section.comparison}`, {
            fontSize: 9,
            color: [0.34, 0.3, 0.28],
            maxCharacters: 86,
          });
        }

        drawSectionHeading(
          t("operationalSteps"),
          palette,
          Math.max(72, estimateWrappedHeight(`- ${section.keyPoints[0] ?? ""}`, { maxCharacters: 82 }) + 18),
        );
        for (const point of section.keyPoints) {
          drawParagraph(`- ${point}`, { fontSize: 10, color: [0.2, 0.2, 0.2], maxCharacters: 82 });
        }
      }

      addPage();
      setAnchor("glossary", page, cursorY);
      drawLines([t("glossary")], { bold: true, fontSize: 18, color: [0.23, 0.18, 0.13] });
      drawParagraph(literal("Shared language keeps operators aligned. Use the glossary as the quick reference layer when the walkthrough uses a term that deserves a tighter definition."), {
        fontSize: 10,
        color: [0.34, 0.3, 0.25],
        maxCharacters: 88,
      });

      for (const entry of localizedGlossary) {
        const definitionLines = wrapText(entry.definition, 84).slice(0, 4);
        const linkRows = entry.links?.length ? entry.links.length * 18 + 4 : 0;
        const cardHeight = 28 + definitionLines.length * 11 + linkRows;
        ensureSpace(cardHeight + 8);
        drawPanel(margin, cursorY, contentWidth, cardHeight, [0.985, 0.98, 0.97], [0.86, 0.8, 0.74]);
        page.drawText(entry.term, {
          x: margin + 12,
          y: cursorY - 16,
          size: 10,
          font: boldFont,
          color: rgb(0.23, 0.18, 0.13),
        });
        for (const [definitionLineIndex, line] of definitionLines.entries()) {
          page.drawText(line, {
            x: margin + 12,
            y: cursorY - 30 - definitionLineIndex * 11,
            size: 9,
            font: regularFont,
            color: rgb(0.34, 0.3, 0.25),
          });
        }

        if (entry.links && entry.links.length > 0) {
          let linkTop = cursorY - 30 - definitionLines.length * 11 - 4;
          for (const link of entry.links) {
            drawLinkBadge(link.title, link.url, margin + 12, linkTop, {
              fillColor: [0.93, 0.96, 0.99],
              textColor: [0.18, 0.28, 0.44],
            });
            linkTop -= 18;
          }
        }

        cursorY -= cardHeight + 8;
      }

      addPage();
      setAnchor("licensing", page, cursorY);
      drawLines([literal("Licensing appendix")], { bold: true, fontSize: 18, color: [0.23, 0.18, 0.13] });
      drawParagraph(literal("This appendix stays grounded in the shipped installer flow. Oload requires EULA acceptance and then presents a source-available proprietary notice before runtime setup continues; GNU GPL material is included here as external legal reference context for third-party evaluation."), {
        fontSize: 10,
        color: [0.34, 0.3, 0.25],
        maxCharacters: 88,
      });

      for (const note of licensingAppendix) {
        const bodyLines = wrapText(note.body, 84).slice(0, 5);
        const cardHeight = 30 + bodyLines.length * 11 + note.links.length * 18 + 6;
        ensureSpace(cardHeight + 10);
        drawPanel(margin, cursorY, contentWidth, cardHeight, [0.975, 0.98, 0.99], [0.78, 0.82, 0.9]);
        page.drawText(note.title, {
          x: margin + 12,
          y: cursorY - 16,
          size: 10,
          font: boldFont,
          color: rgb(0.18, 0.28, 0.44),
        });
        for (const [lineIndex, line] of bodyLines.entries()) {
          page.drawText(line, {
            x: margin + 12,
            y: cursorY - 30 - lineIndex * 11,
            size: 9,
            font: regularFont,
            color: rgb(0.28, 0.36, 0.45),
          });
        }

        let linkTop = cursorY - 30 - bodyLines.length * 11 - 4;
        for (const link of note.links) {
          drawLinkBadge(link.title, link.url, margin + 12, linkTop);
          linkTop -= 18;
        }

        cursorY -= cardHeight + 10;
      }

      addPage();
      setAnchor("references", page, cursorY);
      drawLines([t("references")], { bold: true, fontSize: 18, color: [0.23, 0.18, 0.13] });
      drawParagraph(literal("Use these external references when the local walkthrough tells you what the app is doing but you want the underlying provider, model, or retrieval concepts in their broader context."), {
        fontSize: 10,
        color: [0.34, 0.3, 0.25],
        maxCharacters: 88,
      });

      for (const entry of localizedReferences) {
        const descriptionLines = wrapText(entry.description, 84).slice(0, 2);
        const urlLines = wrapText(entry.url, 72).slice(0, 2);
        const cardHeight = 34 + descriptionLines.length * 10 + urlLines.length * 9;
        const categoryPillWidth = Math.max(72, entry.category.length * 5.4 + 20);

        ensureSpace(cardHeight + 8);
        drawPanel(margin, cursorY, contentWidth, cardHeight, [0.975, 0.985, 0.995], [0.77, 0.84, 0.91]);
        drawPill(entry.category, margin + contentWidth - categoryPillWidth - 12, cursorY - 10, [0.82, 0.9, 0.98], [0.18, 0.28, 0.44]);
        page.drawText(entry.title, {
          x: margin + 12,
          y: cursorY - 26,
          size: 10,
          font: boldFont,
          color: rgb(0.18, 0.28, 0.44),
        });
        for (const [descriptionLineIndex, line] of descriptionLines.entries()) {
          page.drawText(line, {
            x: margin + 12,
            y: cursorY - 39 - descriptionLineIndex * 10,
            size: 8.5,
            font: regularFont,
            color: rgb(0.28, 0.36, 0.45),
          });
        }

        for (const [urlLineIndex, line] of urlLines.entries()) {
          page.drawText(line, {
            x: margin + 12,
            y: cursorY - 43 - descriptionLines.length * 10 - urlLineIndex * 9,
            size: 8,
            font: regularFont,
            color: rgb(0.2, 0.32, 0.45),
          });
        }

        addUriLink(page, toPdfRect(margin, cursorY, contentWidth, cardHeight), entry.url);
        cursorY -= cardHeight + 8;
      }

      const tocPage = pdfDocument.insertPage(1, [pageSize.width, pageSize.height]);
      renderTocPage(tocPage);

      for (const link of pendingInternalLinks) {
        const destination = anchors.get(link.targetId);
        if (!destination) {
          continue;
        }
        addInternalLink(link.sourcePage, link.rect, destination);
      }

      pdfDocument.getPages().forEach((pdfPage, index) => {
        pdfPage.drawText(t("helpManualTitle"), {
          x: margin,
          y: 18,
          size: 8,
          font: regularFont,
          color: rgb(0.42, 0.36, 0.31),
        });
        pdfPage.drawText(`${index + 1}`, {
          x: pageSize.width - margin - 8,
          y: 18,
          size: 8,
          font: boldFont,
          color: rgb(0.42, 0.36, 0.31),
        });
      });

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
    <section data-tour-id="help-shell" className={`glass-panel flex flex-col rounded-[32px] p-4 sm:rounded-[36px] sm:p-6 ${isPageSurface ? "" : "h-full min-h-0 overflow-hidden"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label text-xs font-semibold">{t("help")}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:mt-3 sm:text-2xl">
            {t("helpManualTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted sm:mt-3">
            {isPageSurface
              ? t("helpPageIntro")
              : t("helpManualSubtitle")}
          </p>
        </div>
        <div data-tour-id="help-actions" className="flex flex-col items-end gap-2">
          <span className="ui-pill ui-pill-label">{contextLabel(context)}</span>
          <button
            data-tour-id="help-replay"
            className="ui-button ui-button-secondary px-4 py-2 text-sm"
            type="button"
            onClick={() => onReplayWalkthrough?.()}
          >
            {literal("Replay walkthrough")}
          </button>
          <button
            className="ui-button ui-button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={() => {
              void exportPdf();
            }}
            disabled={isExportingPdf}
          >
            {isExportingPdf ? t("saving") : t("downloadPdfManual")}
          </button>
        </div>
      </div>

      {isPageSurface ? (
        <div className="theme-surface-elevated mt-5 rounded-[28px] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="eyebrow text-muted">{t("currentFocus")}</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{focusSummary.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{focusSummary.intro}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={`ui-pill ${status.isReachable ? "ui-pill-success" : "ui-pill-warning"}`}>
                {status.isReachable ? t("gatewayOnline") : t("attentionNeeded")}
              </span>
              <span className="ui-pill ui-pill-label">
                {currentUser ? currentUser.displayName : t("localAccount")}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.02fr)_minmax(360px,0.98fr)]">
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
                  <span className="text-xs text-muted">{literal("Jump")}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 xl:gap-4">
              <PlushLlamaHero
                badge="Brand direction"
                title="OL icon, shared family"
                description="The Help surface now follows the OL monogram lane instead of the older llama placeholder art."
                summary="The same OL icon language now anchors the Help manual, PDF export illustrations, and the theme-aware brand family."
                detailLeftTitle="Recognition cues"
                detailLeftBody="A clear O ring with the inline L locked to the right side so the mark still reads at small sizes."
                detailRightTitle="Theme variants"
                detailRightBody="Light stays warm and premium, Tech shifts cooler with signal highlights, and Dark moves into a deeper midnight finish."
              />
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-3">
                <div className="theme-surface-soft rounded-[20px] px-3 py-3">
                  <p className="eyebrow text-muted">{literal("Sections in view")}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{contextSections.length}</p>
                </div>
                <div className="theme-surface-soft rounded-[20px] px-3 py-3">
                  <p className="eyebrow text-muted">{t("manualSections")}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{totalSectionCount}</p>
                </div>
                <div className="theme-surface-soft rounded-[20px] px-3 py-3">
                  <p className="eyebrow text-muted">{t("glossaryTerms")}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{localizedGlossary.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <div className="theme-surface-soft rounded-[24px] px-4 py-4">
          <p className="eyebrow text-muted">{t("currentFocus")}</p>
          <p className="mt-2 text-base font-semibold text-foreground">
            {focusSummary.title}
          </p>
          {isPageSurface ? (
            <p className="mt-1 text-xs leading-5 text-muted">{contextSections.length} focused section{contextSections.length === 1 ? "" : "s"}</p>
          ) : null}
        </div>
        <div className="theme-surface-soft rounded-[24px] px-4 py-4">
          <p className="eyebrow text-muted">{t("gatewayStatus")}</p>
          <p className="mt-2 text-base font-semibold text-foreground">
            {status.isReachable ? t("online") : t("attentionNeeded")}
          </p>
          {isPageSurface ? (
            <p className="mt-1 text-xs leading-5 text-muted">{literal("Status here helps explain whether local AI paths are currently usable.")}</p>
          ) : null}
        </div>
        <div className="theme-surface-soft rounded-[24px] px-4 py-4">
          <p className="eyebrow text-muted">{literal("User")}</p>
          <p className="mt-2 text-base font-semibold text-foreground">{currentUser ? currentUser.displayName : t("localAccount")}</p>
          {isPageSurface ? (
            <p className="mt-1 text-xs leading-5 text-muted">{currentUser ? `${t("signedInRole")}: ${currentUser.role}.` : t("manualAvailableWithoutSignIn")}</p>
          ) : null}
        </div>
      </div>

      <div className={isPageSurface ? "mt-5 pr-1" : "mt-5 min-h-0 flex-1 overflow-y-auto pr-1"}>
        <div className={isPageSurface ? "grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]" : "space-y-3"}>
          {isPageSurface ? (
            <div className="space-y-3 xl:sticky xl:top-3 xl:self-start">
              <div className="theme-surface-soft rounded-[28px] p-5">
                <p className="eyebrow text-muted">{t("manualSections")}</p>
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
                      <span className="text-xs text-muted">{t("currentFocus")}</span>
                    </button>
                  ))}
                </div>
              </div>

              {currentUser && currentUser.role !== "admin" ? (
                <div className="theme-surface-soft rounded-[28px] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow text-muted">{t("yourAccount")}</p>
                      <p className="mt-2 text-base font-semibold text-foreground">{currentUser.displayName}</p>
                      <p className="mt-1 text-xs text-muted">@{currentUser.username}</p>
                    </div>
                      <span className="ui-pill ui-pill-meta text-xs">{currentUser.role}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                      <span className="ui-pill ui-pill-meta text-xs text-muted">
                      {currentUser.authProvider === "google" ? literal("Google sign-in") : t("localAccount")}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {literal("Your account details stay visible here even without full admin tooling. Use Access for your defaults and sign-in controls.")}
                  </p>
                </div>
              ) : null}

              <div className="theme-surface-soft rounded-[28px] p-5">
                <p className="eyebrow text-muted">{t("manualSections")}</p>
                <div className="mt-3 space-y-2">
                  {localizedHelpSections.map((section, index) => (
                    <button
                      key={section.id}
                      className="ui-button ui-button-secondary w-full justify-between rounded-[20px] px-4 py-3 text-left text-sm"
                      type="button"
                      onClick={() => {
                        document.getElementById(`help-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      <span>{index + 1}. {section.title}</span>
                      <span className="text-xs text-muted">{contextLabel(section.context)}</span>
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
                  <p className="eyebrow text-muted">{t("overview")}</p>
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
                    <p className="eyebrow text-muted">{t("yourAccount")}</p>
                    <p className="mt-2 text-base font-semibold text-foreground">{currentUser.displayName}</p>
                    <p className="mt-1 text-xs text-muted">@{currentUser.username}</p>
                  </div>
                  <span className="ui-pill ui-pill-surface text-xs">{currentUser.role}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                    {currentUser.authProvider === "google" ? literal("Google sign-in") : t("localAccount")}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {literal("Your account details stay visible here even without full admin tooling. Use Access for your defaults and sign-in controls.")}
                </p>
              </div>
            ) : null}

            {!isPageSurface ? (
              <div className="theme-surface-soft rounded-[28px] p-5">
                <p className="eyebrow text-muted">{t("manualSections")}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {localizedHelpSections.map((section, index) => (
                    <button
                      key={section.id}
                      className="ui-button ui-button-secondary justify-between rounded-[20px] px-4 py-3 text-left text-sm"
                      type="button"
                      onClick={() => {
                        document.getElementById(`help-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      <span>{index + 1}. {section.title}</span>
                      <span className="text-xs text-muted">{contextLabel(section.context)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {localizedHelpSections.map((section, index) => (
            <div
              id={`help-section-${section.id}`}
              key={section.id}
              data-tour-id={`help-section-card-${section.id}`}
              className="theme-surface-soft rounded-[28px] p-5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{section.title}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">{contextLabel(section.context)}</p>
                </div>
              </div>
              <div className="theme-surface-strong mt-4 rounded-[22px] px-4 py-4">
                <p className="eyebrow text-muted">{t("technicalSummary")}</p>
                <p className="mt-3 text-sm leading-7 text-muted">{section.summary}</p>
              </div>
              <div className="mt-4 rounded-[22px] border border-line/70 px-4 py-4">
                <p className="eyebrow text-muted">{t("technicalDetail")}</p>
                <div className="mt-3 space-y-3">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-7 text-muted">{paragraph}</p>
                  ))}
                </div>
              </div>
              <div className="theme-surface-panel mt-4 rounded-[22px] px-4 py-4">
                <p className="eyebrow text-muted">{t("plainLanguage")}</p>
                <div className="mt-3 space-y-3">
                  {section.plainLanguage.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-7 text-muted">{paragraph}</p>
                  ))}
                </div>
                {section.comparison ? (
                  <div className="theme-surface-chip mt-4 rounded-[18px] px-3 py-3 text-sm leading-6 text-foreground">
                    <span className="font-semibold">{t("thinkingOfItAs")}</span> {section.comparison}
                  </div>
                ) : null}
              </div>
              <div className="theme-surface-elevated mt-4 rounded-[22px] px-4 py-4">
                <p className="eyebrow text-muted">{t("operationalSteps")}</p>
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
              <p className="eyebrow text-muted">{t("glossary")}</p>
              <div className="mt-3 space-y-3">
                {localizedGlossary.map((item) => (
                  <div key={item.term} className="theme-surface-strong rounded-[22px] px-4 py-4">
                    <p className="text-sm font-semibold text-foreground">{item.term}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.definition}</p>
                    {item.links && item.links.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.links.map((link) => (
                          <a
                            key={`${item.term}-${link.url}`}
                            className="ui-pill ui-pill-soft border border-line px-3 py-1 text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                            href={link.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {link.title}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="theme-surface-soft rounded-[28px] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-muted">{t("references")}</p>
                  <p className="mt-2 text-base font-semibold text-foreground">{t("referencesTitle")}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{t("referencesIntro")}</p>
                </div>
                <span className="ui-pill ui-pill-surface">{literal("External")}</span>
              </div>
              <div className="mt-4 space-y-3">
                {localizedReferences.map((item) => (
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