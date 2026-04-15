import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/services/ollama-client.js", () => ({
  extractTextFromImage: vi.fn(),
}));

vi.mock("../../src/services/pdf-renderer.js", () => ({
  renderPdf: vi.fn(),
  cleanupTempFiles: vi.fn(),
}));

vi.mock("../../src/services/image-loader.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/image-loader.js")>();
  return {
    ...actual,
    loadImage: vi.fn(),
  };
});

vi.mock("../../src/utils/progress.js", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  setProgressServer: vi.fn(),
}));

vi.mock("../../src/utils/config.js", () => ({
  getConfig: vi.fn(() => ({
    apiKey: "test-key",
    outputDir: "/test/output",
    model: "test-model",
    fallbackModel: "test-fallback",
    readDirs: [],
    writeDirs: [],
  })),
}));

import { extractTextFromImage } from "../../src/services/ollama-client.js";
import { loadImage } from "../../src/services/image-loader.js";
import { getConfig } from "../../src/utils/config.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const mockExtractText = vi.mocked(extractTextFromImage);
const mockLoadImage = vi.mocked(loadImage);
const mockGetConfig = vi.mocked(getConfig);

describe("extract-text tool", () => {
  let testDir: string;
  let testImage: string;

  beforeEach(async () => {
    const tmpDir = process.env.TMPDIR ?? "/data/data/com.termux/files/usr/tmp";
    testDir = join(tmpDir, `ocr-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    testImage = join(testDir, "test.png");
    await writeFile(testImage, Buffer.from("fake png data"));

    mockGetConfig.mockReturnValue({
      apiKey: "test-key",
      outputDir: testDir,
      model: "test-model",
      fallbackModel: "test-fallback",
      readDirs: [testDir],
      writeDirs: [testDir],
    });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("should return error for non-existent file", async () => {
    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: join(testDir, "nonexistent.png") },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("File not found");
  });

  it("should return error for unsupported file type", async () => {
    const unsupportedFile = join(testDir, "test.xyz");
    await writeFile(unsupportedFile, "data");

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: unsupportedFile },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unsupported file type");
  });

  it("should process a single image file successfully", async () => {
    mockLoadImage.mockResolvedValue({
      base64: "fakebase64",
      mimeType: "image/png",
    });
    mockExtractText.mockResolvedValue({
      text: "Extracted text from image",
      usedFallback: false,
    });

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: testImage, format: "json" },
      {} as never,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Extraction complete");
    expect(result.content[0].text).toContain("Source:");
    expect(result.content[0].text).toContain("Output:");
    expect(result.content[0].text).toContain("Format: json");
    // "Extracted text from image" is 25 chars
    expect(result.content[0].text).toContain("Characters extracted: 25");
    // Should NOT include extracted text in the response
    expect(result.content[0].text).not.toContain("Extracted text from image");
  });

  it("should return error when all pages fail", async () => {
    mockLoadImage.mockResolvedValue({
      base64: "fakebase64",
      mimeType: "image/png",
    });
    mockExtractText.mockRejectedValue(new Error("API error"));

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: testImage },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("failed");
  }, 15000);

  it("should use model from parameter over env default", async () => {
    mockLoadImage.mockResolvedValue({
      base64: "fakebase64",
      mimeType: "image/png",
    });
    mockExtractText.mockResolvedValue({
      text: "text",
      usedFallback: false,
    });

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    await handleExtractText(
      { filePath: testImage, model: "custom-model" },
      {} as never,
    );

    expect(mockExtractText).toHaveBeenCalledWith(
      "fakebase64",
      "custom-model",
      expect.any(String),
      "test-fallback",
    );
  });

  it("should return error for missing output directory", async () => {
    mockGetConfig.mockReturnValue({
      apiKey: "test-key",
      outputDir: "/nonexistent/output/dir",
      model: "test-model",
      fallbackModel: "test-fallback",
      readDirs: [testDir],
      writeDirs: [],
    });

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: testImage },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Output directory does not exist");
  });

  it("should return error for invalid page range format", async () => {
    const pdfFile = join(testDir, "test.pdf");
    await writeFile(pdfFile, Buffer.from("fake pdf data"));

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: pdfFile, pages: "invalid-format" },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid page range format");
  });

  it("should reject file path outside readDirs", async () => {
    // Configure readDirs to only allow a different directory
    const restrictedDir = join(testDir, "restricted");
    await mkdir(restrictedDir, { recursive: true });
    mockGetConfig.mockReturnValue({
      apiKey: "test-key",
      outputDir: testDir,
      model: "test-model",
      fallbackModel: "test-fallback",
      readDirs: [restrictedDir],
      writeDirs: [testDir],
    });

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: testImage },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("denied");
  });
});
