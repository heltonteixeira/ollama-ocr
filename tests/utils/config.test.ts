// tests/utils/config.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";

describe("config", () => {
  const originalEnv = { ...process.env };
  let testDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    const tmpBase = process.env.TMPDIR ?? "/tmp";
    testDir = join(tmpBase, `ocr-cfg-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("should return config when all required env vars are set", async () => {
    process.env.OLLAMA_API_KEY = "test-key";
    process.env.OLLAMA_OCR_MODEL = "test-model";
    process.env.OLLAMA_OCR_FALLBACK_MODEL = "fallback-model";
    process.argv = ["node", "index.js"];

    vi.resetModules();
    const { getConfig } = await import("../../src/utils/config.js");
    const config = getConfig();

    expect(config.apiKey).toBe("test-key");
    expect(config.model).toBe("test-model");
    expect(config.fallbackModel).toBe("fallback-model");
  });

  it("should use default model when OLLAMA_OCR_MODEL is not set", async () => {
    process.env.OLLAMA_API_KEY = "test-key";
    delete process.env.OLLAMA_OCR_MODEL;
    delete process.env.OLLAMA_OCR_FALLBACK_MODEL;
    process.argv = ["node", "index.js"];

    vi.resetModules();
    const { getConfig } = await import("../../src/utils/config.js");
    const config = getConfig();

    expect(config.model).toBe("gemini-3-flash-preview");
    expect(config.fallbackModel).toBeUndefined();
  });

  it("should exit when OLLAMA_API_KEY is missing", async () => {
    delete process.env.OLLAMA_API_KEY;
    process.argv = ["node", "index.js"];

    const mockExit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as never);

    vi.resetModules();
    const { getConfig } = await import("../../src/utils/config.js");
    expect(() => getConfig()).toThrow("process.exit:1");

    mockExit.mockRestore();
  });

  it("should parse --read and --write CLI args", async () => {
    process.env.OLLAMA_API_KEY = "test-key";
    process.argv = ["node", "index.js", "--read", testDir, "--write", testDir];

    vi.resetModules();
    const { getConfig } = await import("../../src/utils/config.js");
    const config = getConfig();

    expect(config.readDirs).toEqual([realpathSync(testDir)]);
    expect(config.writeDirs).toEqual([realpathSync(testDir)]);
  });

  it("should default readDirs to writeDirs when --read is omitted", async () => {
    process.env.OLLAMA_API_KEY = "test-key";
    process.argv = ["node", "index.js", "--write", testDir];

    vi.resetModules();
    const { getConfig } = await import("../../src/utils/config.js");
    const config = getConfig();

    expect(config.readDirs).toEqual(config.writeDirs);
  });

  it("should exit when --write dir does not exist", async () => {
    process.env.OLLAMA_API_KEY = "test-key";
    process.argv = ["node", "index.js", "--write", "/nonexistent/dir"];

    const mockExit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as never);

    vi.resetModules();
    const { getConfig } = await import("../../src/utils/config.js");
    expect(() => getConfig()).toThrow("process.exit:1");

    mockExit.mockRestore();
  });
});
