import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  formatJsonOutput,
  formatMarkdownOutput,
  formatTextOutput,
  generateOutputFilename,
  writeOutput,
  type PageResult,
  type OutputMetadata,
} from "../../src/services/output-writer.js";

function makeMetadata(overrides?: Partial<OutputMetadata>): OutputMetadata {
  return {
    source: "/path/to/report.pdf",
    sourceType: "pdf",
    model: "gemini-3-flash-preview",
    format: "json",
    extractedAt: "2026-04-12T10:30:00.000Z",
    totalPages: 12,
    successfulPages: 11,
    failedPages: 1,
    failedPageNumbers: [7],
    totalCharacters: 45230,
    processingTimeMs: 154000,
    ...overrides,
  };
}

const pages: PageResult[] = [
  { pageNumber: 1, text: "Extracted text content here...", characterCount: 29, status: "success" },
  { pageNumber: 7, text: null, characterCount: 0, status: "failed", error: "Failed after 3 retries: API timeout" },
  { pageNumber: 12, text: "Final page text", characterCount: 16, status: "success" },
];

describe("generateOutputFilename", () => {
  it("should generate filename with json extension", () => {
    const filename = generateOutputFilename("/path/to/report.pdf", "json");
    expect(filename).toMatch(/^report_\d{8}_\d{6}\.json$/);
  });

  it("should generate filename with md extension for markdown", () => {
    const filename = generateOutputFilename("/path/to/report.pdf", "markdown");
    expect(filename).toMatch(/^report_\d{8}_\d{6}\.md$/);
  });

  it("should generate filename with txt extension for text", () => {
    const filename = generateOutputFilename("/path/to/report.pdf", "text");
    expect(filename).toMatch(/^report_\d{8}_\d{6}\.txt$/);
  });
});

describe("formatJsonOutput", () => {
  it("should produce valid JSON with metadata and pages", () => {
    const result = formatJsonOutput(makeMetadata(), pages);
    const parsed = JSON.parse(result);

    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.source).toBe("/path/to/report.pdf");
    expect(parsed.metadata.sourceType).toBe("pdf");
    expect(parsed.metadata.model).toBe("gemini-3-flash-preview");
    expect(parsed.metadata.totalPages).toBe(12);
    expect(parsed.metadata.successfulPages).toBe(11);
    expect(parsed.metadata.failedPages).toBe(1);
    expect(parsed.metadata.failedPageNumbers).toEqual([7]);
    expect(parsed.metadata.totalCharacters).toBe(45230);
    expect(parsed.metadata.processingTimeMs).toBe(154000);

    expect(parsed.pages).toHaveLength(3);
    expect(parsed.pages[0].pageNumber).toBe(1);
    expect(parsed.pages[0].text).toBe("Extracted text content here...");
    expect(parsed.pages[0].status).toBe("success");

    expect(parsed.pages[1].pageNumber).toBe(7);
    expect(parsed.pages[1].text).toBeNull();
    expect(parsed.pages[1].status).toBe("failed");
    expect(parsed.pages[1].error).toBe("Failed after 3 retries: API timeout");
  });

  it("should include error field only for failed pages", () => {
    const result = formatJsonOutput(makeMetadata(), pages);
    const parsed = JSON.parse(result);

    expect(parsed.pages[0].error).toBeUndefined();
    expect(parsed.pages[1].error).toBe("Failed after 3 retries: API timeout");
  });
});

describe("formatMarkdownOutput", () => {
  it("should produce markdown with headers and separators", () => {
    const result = formatMarkdownOutput(makeMetadata({ format: "markdown" }), pages, "report.pdf");

    expect(result).toContain("# OCR Extraction: report.pdf");
    expect(result).toContain("**Source:** `/path/to/report.pdf`");
    expect(result).toContain("**Model:** gemini-3-flash-preview");
    expect(result).toContain("**Extracted:** 2026-04-12T10:30:00.000Z");
    expect(result).toContain("**Pages:** 12 total, 11 successful, 1 failed (page 7)");
    expect(result).toContain("**Characters:** 45,230");

    expect(result).toContain("## Page 1 of 12");
    expect(result).toContain("## Page 7 of 12");
    expect(result).toContain("## Page 12 of 12");

    expect(result).toContain("Extracted text content here...");
    expect(result).toContain("[EXTRACTION FAILED: Failed after 3 retries: API timeout]");
    expect(result).toContain("Final page text");
  });
});

describe("formatTextOutput", () => {
  it("should produce plain text with separators", () => {
    const result = formatTextOutput(makeMetadata({ format: "text" }), pages, "report.pdf");

    expect(result).toContain("OCR Extraction: report.pdf");
    expect(result).toContain("Source: /path/to/report.pdf");
    expect(result).toContain("Model: gemini-3-flash-preview");
    expect(result).toContain("Extracted: 2026-04-12T10:30:00.000Z");
    expect(result).toContain("Pages: 12 total, 11 successful, 1 failed (page 7)");
    expect(result).toContain("Characters: 45,230");

    expect(result).toContain("Page 1 of 12");
    expect(result).toContain("Page 7 of 12");
    expect(result).toContain("Page 12 of 12");

    expect(result).not.toContain("## Page"); // No markdown headers in text format
    expect(result).toContain("Extracted text content here...");
    expect(result).toContain("[EXTRACTION FAILED: Failed after 3 retries: API timeout]");
  });
});

describe("output formats for image source", () => {
  it("should use sourceType 'image' for single image files", () => {
    const imageMetadata = makeMetadata({
      source: "/path/to/photo.png",
      sourceType: "image",
      format: "json",
      totalPages: 1,
      successfulPages: 1,
      failedPages: 0,
      failedPageNumbers: [],
      totalCharacters: 500,
    });
    const imagePages: PageResult[] = [
      { pageNumber: 1, text: "Text from image", characterCount: 15, status: "success" },
    ];

    const result = formatJsonOutput(imageMetadata, imagePages);
    const parsed = JSON.parse(result);

    expect(parsed.metadata.sourceType).toBe("image");
    expect(parsed.metadata.totalPages).toBe(1);
    expect(parsed.pages[0].pageNumber).toBe(1);
  });
});

describe("writeOutput", () => {
  const tmpBase = process.env.TMPDIR ?? "/tmp";
  let outputDir: string;

  beforeEach(async () => {
    outputDir = join(tmpBase, `ocr-write-test-${Date.now()}`);
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    try { await rm(outputDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("should write content to the specified output path", async () => {
    const outputPath = join(outputDir, "result.json");
    const result = await writeOutput(outputPath, "test content");

    expect(result).toBe(outputPath);
    const written = await readFile(outputPath, "utf-8");
    expect(written).toBe("test content");
  });

  it("should overwrite existing file", async () => {
    const outputPath = join(outputDir, "result.json");
    await writeFile(outputPath, "old content");
    await writeOutput(outputPath, "new content");

    const written = await readFile(outputPath, "utf-8");
    expect(written).toBe("new content");
  });
});
