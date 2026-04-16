import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface RenderedPage {
  pageNumber: number;
  imagePath: string;
}

const DPI = 150;
const PDF_TO_CANVAS_SCALE = DPI / 72;

export function parsePageRange(range: string, totalPages: number): number[] {
  const pages: number[] = [];
  const parts = range.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-", 2);
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
        throw new Error(`Invalid page range: "${trimmed}"`);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (isNaN(page) || page < 1 || page > totalPages) {
        throw new Error(`Invalid page number: "${trimmed}"`);
      }
      pages.push(page);
    }
  }

  return [...new Set(pages)].sort((a, b) => a - b);
}

function getTempDir(): string {
  return process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? "/tmp";
}

export async function renderPdf(
  filePath: string,
  pageRange?: string,
): Promise<RenderedPage[]> {
  const data = await readFile(filePath);
  const dataUint8 = new Uint8Array(data);
  const doc = await getDocument({ data: dataUint8, useSystemFonts: true }).promise;
  const totalPages = doc.numPages;

  const pages = pageRange
    ? parsePageRange(pageRange, totalPages)
    : Array.from({ length: totalPages }, (_, i) => i + 1);

  const tmpDir = getTempDir();
  const rendered: RenderedPage[] = [];

  for (const pageNum of pages) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: PDF_TO_CANVAS_SCALE });

    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    const pngBuffer = canvas.encodeSync("png");
    const tempPath = join(tmpDir, `ocr_page_${pageNum}_${Date.now()}.png`);
    await writeFile(tempPath, pngBuffer);

    rendered.push({ pageNumber: pageNum, imagePath: tempPath });
  }

  return rendered;
}

export async function cleanupTempFiles(files: string[]): Promise<void> {
  await Promise.all(
    files.map(async (filePath) => {
      try {
        await unlink(filePath);
      } catch {
        // Ignore cleanup errors — best effort
      }
    }),
  );
}
