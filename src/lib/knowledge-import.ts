import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

import JSZip from "jszip";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import WordExtractor from "word-extractor";
import * as XLSX from "xlsx";

import { saveAiKnowledgeEntry } from "@/lib/ai-context";
import type { AiProviderId } from "@/lib/ai-types";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

type KnowledgeImportInput = {
  modelIds?: string[];
  providerIds?: AiProviderId[];
  source?: string;
  tags?: string[];
  title?: string;
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<li>/gi, "- ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeImportedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function guessTitleFromFileName(fileName: string) {
  const withoutExtension = basename(fileName, extname(fileName));
  return withoutExtension.replace(/[._-]+/g, " ").trim() || "Imported knowledge";
}

function guessTitleFromUrl(url: URL) {
  const lastSegment = url.pathname.split("/").filter(Boolean).pop();
  if (lastSegment) {
    return guessTitleFromFileName(decodeURIComponent(lastSegment));
  }

  return url.hostname;
}

function parseHtmlTitle(value: string) {
  const match = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

async function extractTextFromPdf(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return sanitizeImportedText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromDocx(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return sanitizeImportedText(result.value);
}

async function extractTextFromDoc(buffer: Buffer) {
  const tempPath = join(tmpdir(), `oload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.doc`);

  try {
    await writeFile(tempPath, buffer);
    const extractor = new WordExtractor();
    const document = await extractor.extract(tempPath);
    return sanitizeImportedText(document.getBody());
  } finally {
    await rm(tempPath, { force: true });
  }
}

function extractTextFromWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetTexts = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    const body = rows
      .map((row) => row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" | "))
      .filter(Boolean)
      .join("\n");

    return body ? `${sheetName}\n${body}` : "";
  }).filter(Boolean);

  return sanitizeImportedText(sheetTexts.join("\n\n"));
}

async function extractTextFromPptx(buffer: Buffer) {
  const archive = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(archive.files)
    .filter((fileName) => /^ppt\/slides\/slide\d+\.xml$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  const slideTexts = await Promise.all(slideNames.map(async (slideName, index) => {
    const xml = await archive.file(slideName)?.async("string");

    if (!xml) {
      return "";
    }

    const matches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)).map((match) => decodeHtmlEntities(match[1]).trim()).filter(Boolean);
    return matches.length > 0 ? `Slide ${index + 1}\n${matches.join("\n")}` : "";
  }));

  return sanitizeImportedText(slideTexts.filter(Boolean).join("\n\n"));
}

async function extractTextFromBuffer(buffer: Buffer, fileName: string, contentType: string | null) {
  const extension = extname(fileName).toLowerCase();
  const normalizedContentType = (contentType ?? "").toLowerCase();

  if ([".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".log"].includes(extension) || normalizedContentType.startsWith("text/")) {
    return sanitizeImportedText(buffer.toString("utf8"));
  }

  if ([".html", ".htm"].includes(extension) || normalizedContentType.includes("text/html")) {
    return sanitizeImportedText(stripHtml(buffer.toString("utf8")));
  }

  if (extension === ".pdf" || normalizedContentType.includes("pdf")) {
    return extractTextFromPdf(buffer);
  }

  if (extension === ".docx" || normalizedContentType.includes("wordprocessingml.document")) {
    return extractTextFromDocx(buffer);
  }

  if (extension === ".doc" || normalizedContentType.includes("msword")) {
    return extractTextFromDoc(buffer);
  }

  if ([".xlsx", ".xls"].includes(extension) || normalizedContentType.includes("spreadsheet") || normalizedContentType.includes("ms-excel")) {
    return extractTextFromWorkbook(buffer);
  }

  if (extension === ".pptx" || normalizedContentType.includes("presentationml.presentation")) {
    return extractTextFromPptx(buffer);
  }

  if (extension === ".ppt" || normalizedContentType.includes("ms-powerpoint")) {
    throw new Error("Legacy .ppt files are not supported yet. Save the deck as .pptx and import it again.");
  }

  throw new Error(`Unsupported knowledge import type: ${extension || normalizedContentType || "unknown file"}.`);
}

function ensureImportedContent(content: string) {
  if (!content.trim()) {
    throw new Error("The imported source did not contain any readable text.");
  }

  return content.trim();
}

export async function importKnowledgeFromFile(file: File, input: KnowledgeImportInput = {}) {
  if (file.size === 0) {
    throw new Error("The selected file is empty.");
  }

  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`The selected file is too large. Keep imports under ${Math.floor(MAX_IMPORT_BYTES / (1024 * 1024))} MB.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const content = ensureImportedContent(await extractTextFromBuffer(buffer, file.name, file.type || null));
  const title = input.title?.trim() || guessTitleFromFileName(file.name);
  const source = input.source?.trim() || file.name;

  return saveAiKnowledgeEntry({
    title,
    content,
    source,
    tags: input.tags,
    providerIds: input.providerIds,
    modelIds: input.modelIds,
  });
}

export async function importKnowledgeFromUrl(urlValue: string, input: KnowledgeImportInput = {}) {
  const url = new URL(urlValue);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Knowledge import URLs must use http or https.");
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "oload-knowledge-import/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${url.hostname}: ${response.status} ${response.statusText}`.trim());
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMPORT_BYTES) {
    throw new Error(`The remote file is too large. Keep URL imports under ${Math.floor(MAX_IMPORT_BYTES / (1024 * 1024))} MB.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(`The remote file is too large. Keep URL imports under ${Math.floor(MAX_IMPORT_BYTES / (1024 * 1024))} MB.`);
  }

  let content = "";
  let title = input.title?.trim() || guessTitleFromUrl(url);

  if (contentType.includes("text/html")) {
    const html = buffer.toString("utf8");
    content = ensureImportedContent(stripHtml(html));
    title = input.title?.trim() || parseHtmlTitle(html) || title;
  } else {
    content = ensureImportedContent(await extractTextFromBuffer(buffer, basename(url.pathname || "imported"), contentType));
  }

  const source = input.source?.trim() || url.toString();

  return saveAiKnowledgeEntry({
    title,
    content,
    source,
    tags: input.tags,
    providerIds: input.providerIds,
    modelIds: input.modelIds,
  });
}