import { existsSync, accessSync, constants } from "node:fs";
import { extname, resolve, basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { getConfig } from "../utils/config.js";
import { PermissionError, assertPath } from "../utils/path-guard.js";
import { info, warn } from "../utils/progress.js";
import { retry } from "../utils/retry.js";
import { splitBatches, processBatch } from "../utils/concurrency.js";
import { loadImage, IMAGE_EXTENSIONS } from "../services/image-loader.js";
import { renderPdf, cleanupTempFiles } from "../services/pdf-renderer.js";
import { extractTextFromImage } from "../services/ollama-client.js";
import {
  formatJsonOutput,
  formatMarkdownOutput,
  formatTextOutput,
  generateOutputFilename,
  writeOutput,
  type PageResult,
  type OutputMetadata,
} from "../services/output-writer.js";
import { OCR_USER_PROMPT } from "../prompts/ocr.js";

const SUPPORTED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ".pdf"]);

const ExtractTextInputSchema = z.object({
  filePath: z.string().describe("Absolute path to a PDF or image file"),
  format: z.enum(["json", "markdown", "text"]).optional().default("json").describe("Output format: json, markdown, or text"),
  model: z.string().optional().describe("Ollama vision model identifier. Overrides OLLAMA_OCR_MODEL"),
  pages: z.string().optional().describe("Page range for PDFs. Formats: \"1-5\", \"1,3,7\", \"1-3,7,10-12\""),
}).strict();

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

interface PageImage {
  pageNumber: number;
  base64: string;
}

export { ExtractTextInputSchema };

async function processPage(
  pageImage: PageImage,
  totalPages: number,
  model: string,
  fallbackModel: string | undefined,
): Promise<PageResult> {
  try {
    const result = await retry(
      async () => {
        const response = await extractTextFromImage(
          pageImage.base64,
          model,
          OCR_USER_PROMPT,
          fallbackModel,
        );
        return response;
      },
      {
        maxRetries: 3,
        onRetry: async (attempt, maxRetries, delay, err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          await warn(`Page ${pageImage.pageNumber}/${totalPages} failed (attempt ${attempt}/${maxRetries}): ${errMsg} — retrying in ${delay / 1000}s`);
        },
      },
    );

    const charCount = result.text.length;
    await info(`Page ${pageImage.pageNumber}/${totalPages} complete (${charCount.toLocaleString()} chars)`);

    return {
      pageNumber: pageImage.pageNumber,
      text: result.text,
      characterCount: charCount,
      status: "success",
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await warn(`Page ${pageImage.pageNumber}/${totalPages} failed (attempt 3/3): ${errMsg} — skipping`);
    return {
      pageNumber: pageImage.pageNumber,
      text: null,
      characterCount: 0,
      status: "failed",
      error: `Failed after 3 retries: ${errMsg}`,
    };
  }
}

export async function handleExtractText(
  args: {
    filePath: string;
    format?: "json" | "markdown" | "text";
    model?: string;
    pages?: string;
  },
  _extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  const config = getConfig();
  const format = args.format ?? "json";
  const model = args.model ?? config.model;
  const startTime = Date.now();

  const absolutePath = resolve(args.filePath);

  if (config.readDirs.length > 0) {
    try {
      assertPath(absolutePath, config.readDirs, "Read");
    } catch (err) {
      if (err instanceof PermissionError) {
        return {
          content: [{ type: "text", text: err.message }],
          isError: true,
        };
      }
      throw err;
    }
  }

  if (!existsSync(absolutePath)) {
    return {
      content: [{ type: "text", text: `File not found: ${absolutePath}` }],
      isError: true,
    };
  }

  const ext = extname(absolutePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return {
      content: [{ type: "text", text: `Unsupported file type: ${ext}. Supported: ${[...SUPPORTED_EXTENSIONS].join(", ")}` }],
      isError: true,
    };
  }

  if (config.writeDirs.length === 0) {
    return {
      content: [{ type: "text", text: "No output directory configured. Use --write to specify an output directory." }],
      isError: true,
    };
  }

  if (args.pages) {
    const pagesRegex = /^\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*$/;
    if (!pagesRegex.test(args.pages)) {
      return {
        content: [{ type: "text", text: `Invalid page range format: "${args.pages}". Use formats like "1-5", "1,3,7", "1-3,7,10-12"` }],
        isError: true,
      };
    }
  }

  const isPdf = ext === ".pdf";
  const sourceType = isPdf ? "pdf" : "image";

  let pageImages: PageImage[] = [];
  let totalPages = 1;
  const tempFiles: string[] = [];

  try {
    if (isPdf) {
      const renderedPages = await renderPdf(absolutePath, args.pages);
      totalPages = renderedPages.length;
      tempFiles.push(...renderedPages.map((p) => p.imagePath));

      pageImages = await Promise.all(
        renderedPages.map(async (rp) => {
          const imgData = await loadImage(rp.imagePath);
          return { pageNumber: rp.pageNumber, base64: imgData.base64 };
        }),
      );
    } else {
      const imgData = await loadImage(absolutePath);
      pageImages = [{ pageNumber: 1, base64: imgData.base64 }];
      totalPages = 1;
    }

    await info(`Starting extraction: ${absolutePath} (${totalPages} page${totalPages > 1 ? "s" : ""}, model: ${model})`);

    const batches = splitBatches(pageImages, 10);
    const results: PageResult[] = [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const firstPage = batch[0].pageNumber;
      const lastPage = batch[batch.length - 1].pageNumber;
      await info(`Batch ${batchIdx + 1}/${batches.length}: Processing pages ${firstPage}-${lastPage}`);

      const batchResults = await processBatch(
        batch,
        (pageImage) => processPage(pageImage, totalPages, model, config.fallbackModel),
        3,
      );

      results.push(...batchResults);

      const batchSuccessCount = batchResults.filter((r) => r.status === "success").length;
      await info(`Batch ${batchIdx + 1}/${batches.length} complete: ${batchSuccessCount}/${batch.length} successful`);
    }

    results.sort((a, b) => a.pageNumber - b.pageNumber);

    const successfulPages = results.filter((r) => r.status === "success");
    const failedPages = results.filter((r) => r.status === "failed");
    const totalChars = successfulPages.reduce((sum, r) => sum + r.characterCount, 0);
    const processingTimeMs = Date.now() - startTime;

    const metadata: OutputMetadata = {
      source: absolutePath,
      sourceType,
      model,
      format,
      extractedAt: new Date().toISOString(),
      totalPages,
      successfulPages: successfulPages.length,
      failedPages: failedPages.length,
      failedPageNumbers: failedPages.map((p) => p.pageNumber),
      totalCharacters: totalChars,
      processingTimeMs,
    };

    const filename = generateOutputFilename(absolutePath, format);
    let content: string;
    const docName = basename(absolutePath);

    switch (format) {
      case "json":
        content = formatJsonOutput(metadata, results);
        break;
      case "markdown":
        content = formatMarkdownOutput(metadata, results, docName);
        break;
      case "text":
        content = formatTextOutput(metadata, results, docName);
        break;
    }

    const outputDir = config.writeDirs[0];
    const outputPath = await writeOutput(outputDir, filename, content, config.writeDirs);

    if (successfulPages.length === 0) {
      return {
        content: [{
          type: "text",
          text: `Extraction failed. All ${totalPages} page(s) failed to process.`,
        }],
        isError: true,
      };
    }

    const duration = formatDuration(processingTimeMs);
    const failedInfo = failedPages.length > 0
      ? ` | ${failedPages.length} failed (page${failedPages.length === 1 ? "" : "s"} ${failedPages.map((p) => p.pageNumber).join(", ")})`
      : "";

    await info(`Extraction complete: ${successfulPages.length}/${totalPages} pages, ${totalChars.toLocaleString()} characters, ${duration}`);

    return {
      content: [{
        type: "text",
        text: [
          "Extraction complete.",
          `Source: ${absolutePath}`,
          `Output: ${outputPath}`,
          `Format: ${format} | Model: ${model}`,
          `Pages: ${totalPages} total | ${successfulPages.length} successful${failedInfo}`,
          `Characters extracted: ${totalChars.toLocaleString()}`,
          `Processing time: ${duration}`,
        ].join("\n"),
      }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Extraction error: ${message}` }],
      isError: true,
    };
  } finally {
    if (tempFiles.length > 0) {
      await cleanupTempFiles(tempFiles);
    }
  }
}

export function registerExtractTextTool(server: McpServer): void {
  server.registerTool(
    "extract-text",
    {
      description: "Extract verbatim text from a PDF or image file using Ollama Cloud vision models",
      inputSchema: ExtractTextInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    handleExtractText,
  );
}
