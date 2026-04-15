import { writeFile, rename } from "node:fs/promises";
import { basename, join, extname } from "node:path";
import { assertPath } from "../utils/path-guard.js";

export interface PageResult {
  pageNumber: number;
  text: string | null;
  characterCount: number;
  status: "success" | "failed";
  error?: string;
}

export interface OutputMetadata {
  source: string;
  sourceType: "pdf" | "image";
  model: string;
  format: "json" | "markdown" | "text";
  extractedAt: string;
  totalPages: number;
  successfulPages: number;
  failedPages: number;
  failedPageNumbers: number[];
  totalCharacters: number;
  processingTimeMs: number;
}

const EXT_MAP: Record<string, string> = {
  json: "json",
  markdown: "md",
  text: "txt",
};

export function generateOutputFilename(inputPath: string, format: string): string {
  const name = basename(inputPath, extname(inputPath));
  const now = new Date();
  const ts = formatDate(now);
  const ext = EXT_MAP[format] ?? "txt";
  return `${name}_${ts}.${ext}`;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${h}${min}${s}`;
}

export function formatJsonOutput(metadata: OutputMetadata, pages: PageResult[]): string {
  const output = {
    metadata,
    pages: pages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
      characterCount: p.characterCount,
      status: p.status,
      ...(p.error ? { error: p.error } : {}),
    })),
  };
  return JSON.stringify(output, null, 2);
}

export function formatMarkdownOutput(metadata: OutputMetadata, pages: PageResult[], filename: string): string {
  const lines: string[] = [];

  lines.push(`# OCR Extraction: ${filename}`);
  lines.push("");
  lines.push(`**Source:** \`${metadata.source}\``);
  lines.push(`**Model:** ${metadata.model}`);
  lines.push(`**Extracted:** ${metadata.extractedAt}`);
  lines.push(`**Pages:** ${metadata.totalPages} total, ${metadata.successfulPages} successful, ${metadata.failedPages} failed${formatFailedPages(metadata.failedPageNumbers)}`);
  lines.push(`**Characters:** ${metadata.totalCharacters.toLocaleString()}`);
  lines.push("");

  for (const page of pages) {
    lines.push(`---`);
    lines.push(`## Page ${page.pageNumber} of ${metadata.totalPages}`);
    lines.push(`---`);
    lines.push("");

    if (page.status === "failed") {
      lines.push(`[EXTRACTION FAILED: ${page.error ?? "Unknown error"}]`);
    } else {
      lines.push(page.text ?? "");
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatTextOutput(metadata: OutputMetadata, pages: PageResult[], filename: string): string {
  const lines: string[] = [];

  lines.push(`OCR Extraction: ${filename}`);
  lines.push(`${"=".repeat(30)}`);
  lines.push(`Source: ${metadata.source}`);
  lines.push(`Model: ${metadata.model}`);
  lines.push(`Extracted: ${metadata.extractedAt}`);
  lines.push(`Pages: ${metadata.totalPages} total, ${metadata.successfulPages} successful, ${metadata.failedPages} failed${formatFailedPages(metadata.failedPageNumbers)}`);
  lines.push(`Characters: ${metadata.totalCharacters.toLocaleString()}`);
  lines.push("");

  for (const page of pages) {
    lines.push(`---`);
    lines.push(`Page ${page.pageNumber} of ${metadata.totalPages}`);
    lines.push(`---`);
    lines.push("");

    if (page.status === "failed") {
      lines.push(`[EXTRACTION FAILED: ${page.error ?? "Unknown error"}]`);
    } else {
      lines.push(page.text ?? "");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatFailedPages(failedPageNumbers: number[]): string {
  if (failedPageNumbers.length === 0) return "";
  return ` (page${failedPageNumbers.length === 1 ? "" : "s"} ${failedPageNumbers.join(", ")})`;
}

export async function writeOutput(
  outputDir: string,
  filename: string,
  content: string,
  writeDirs?: string[],
): Promise<string> {
  const outputPath = join(outputDir, filename);

  // Validate write path against allowed dirs (if configured)
  if (writeDirs && writeDirs.length > 0) {
    assertPath(outputPath, writeDirs, "Write");
  }

  // Atomic write: temp file + rename
  const tmpdir = process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? "/data/data/com.termux/files/usr/tmp";
  const tmpPath = join(tmpdir, `.ocr_tmp_${Date.now()}_${filename}`);
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, outputPath);

  return outputPath;
}
