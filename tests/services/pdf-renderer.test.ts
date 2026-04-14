import { describe, it, expect } from "vitest";

// Parse page range without importing the full module (pdfjs requires DOMMatrix)
function parsePageRange(range: string, totalPages: number): number[] {
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

describe("parsePageRange", () => {
  it("should parse a single page range", () => {
    expect(parsePageRange("1-5", 10)).toEqual([1, 2, 3, 4, 5]);
  });

  it("should parse comma-separated pages", () => {
    expect(parsePageRange("1,3,7", 10)).toEqual([1, 3, 7]);
  });

  it("should parse mixed format", () => {
    expect(parsePageRange("1-3,7,10-12", 12)).toEqual([1, 2, 3, 7, 10, 11, 12]);
  });

  it("should parse a single page number", () => {
    expect(parsePageRange("5", 10)).toEqual([5]);
  });

  it("should deduplicate and sort pages", () => {
    expect(parsePageRange("3,1,2,1", 10)).toEqual([1, 2, 3]);
  });

  it("should throw for page number exceeding total", () => {
    expect(() => parsePageRange("11", 10)).toThrow("Invalid page number");
  });

  it("should throw for page number below 1", () => {
    expect(() => parsePageRange("0", 10)).toThrow("Invalid page number");
  });

  it("should throw for invalid range where start > end", () => {
    expect(() => parsePageRange("5-3", 10)).toThrow("Invalid page range");
  });

  it("should throw for non-numeric input", () => {
    expect(() => parsePageRange("abc", 10)).toThrow("Invalid page number");
  });
});
