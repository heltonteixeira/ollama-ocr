import { describe, it, expect } from "vitest";
import { isSupportedImageExtension } from "../../src/services/image-loader.js";

describe("image-loader", () => {
  describe("isSupportedImageExtension", () => {
    it("should accept supported extensions", () => {
      expect(isSupportedImageExtension(".png")).toBe(true);
      expect(isSupportedImageExtension(".jpg")).toBe(true);
      expect(isSupportedImageExtension(".jpeg")).toBe(true);
      expect(isSupportedImageExtension(".webp")).toBe(true);
      expect(isSupportedImageExtension(".bmp")).toBe(true);
      expect(isSupportedImageExtension(".tiff")).toBe(true);
      expect(isSupportedImageExtension(".tif")).toBe(true);
    });

    it("should reject unsupported extensions", () => {
      expect(isSupportedImageExtension(".gif")).toBe(false);
      expect(isSupportedImageExtension(".svg")).toBe(false);
      expect(isSupportedImageExtension(".pdf")).toBe(false);
      expect(isSupportedImageExtension(".txt")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isSupportedImageExtension(".PNG")).toBe(true);
      expect(isSupportedImageExtension(".Jpg")).toBe(true);
      expect(isSupportedImageExtension(".JPEG")).toBe(true);
    });
  });
});
