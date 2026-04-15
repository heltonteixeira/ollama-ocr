import { readFile } from "node:fs/promises";
import { extname } from "node:path";

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"] as const;

const IMAGE_EXT_SET = new Set(IMAGE_EXTENSIONS);

export function isSupportedImageExtension(ext: string): boolean {
  return IMAGE_EXT_SET.has(ext.toLowerCase() as typeof IMAGE_EXTENSIONS[number]);
}

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
};

export interface ImageData {
  base64: string;
  mimeType: string;
}

export async function loadImage(filePath: string): Promise<ImageData> {
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext];

  if (!mimeType) {
    throw new Error(`Unsupported image format: ${ext}`);
  }

  const buffer = await readFile(filePath);
  const base64 = buffer.toString("base64");

  return { base64, mimeType };
}
