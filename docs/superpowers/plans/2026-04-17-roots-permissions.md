# Roots-Based Permission System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `OLLAMA_OCR_OUTPUT_DIR` with MCP Roots protocol for dynamic directory discovery, keeping `--read`/`--write` CLI args as fallback.

**Architecture:** On server init, discover workspace roots via `listRoots()`. Roots define both read and write boundaries. CLI args provide the same for non-Roots clients. Output is co-located with source by default, or explicit via `outputPath` param. A new `list_allowed_directories` tool exposes current permission state.

**Tech Stack:** TypeScript, MCP SDK v1.29.0 (already has `listRoots`/`oninitialized`/`notifications/roots/list_changed` support), Vitest

**Spec:** `docs/superpowers/specs/2026-04-17-roots-permissions-design.md`

---

### Task 1: Create `allowed-dirs.ts` module

**Files:**
- Create: `src/utils/allowed-dirs.ts`
- Create: `tests/utils/allowed-dirs.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/utils/allowed-dirs.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  setAllowedReadDirs,
  setAllowedWriteDirs,
  getAllowedReadDirs,
  getAllowedWriteDirs,
  getPermissionSource,
  resetAllowedDirs,
} from "../../src/utils/allowed-dirs.js";

describe("allowed-dirs", () => {
  beforeEach(() => {
    resetAllowedDirs();
  });

  describe("setAllowedReadDirs / getAllowedReadDirs", () => {
    it("should set and return read dirs", () => {
      setAllowedReadDirs(["/home/user/project"]);
      expect(getAllowedReadDirs()).toEqual(["/home/user/project"]);
    });

    it("should replace (not merge) on subsequent calls", () => {
      setAllowedReadDirs(["/first"]);
      setAllowedReadDirs(["/second"]);
      expect(getAllowedReadDirs()).toEqual(["/second"]);
    });

    it("should return empty array when not set", () => {
      expect(getAllowedReadDirs()).toEqual([]);
    });
  });

  describe("setAllowedWriteDirs / getAllowedWriteDirs", () => {
    it("should set and return write dirs", () => {
      setAllowedWriteDirs(["/home/user/output"]);
      expect(getAllowedWriteDirs()).toEqual(["/home/user/output"]);
    });

    it("should replace (not merge) on subsequent calls", () => {
      setAllowedWriteDirs(["/first"]);
      setAllowedWriteDirs(["/second", "/third"]);
      expect(getAllowedWriteDirs()).toEqual(["/second", "/third"]);
    });

    it("should return empty array when not set", () => {
      expect(getAllowedWriteDirs()).toEqual([]);
    });
  });

  describe("getPermissionSource", () => {
    it("should return 'none' when no dirs are set", () => {
      expect(getPermissionSource()).toBe("none");
    });

    it("should return 'roots' when dirs were set from roots", () => {
      setAllowedReadDirs(["/project"], "roots");
      setAllowedWriteDirs(["/project"], "roots");
      expect(getPermissionSource()).toBe("roots");
    });

    it("should return 'cli-args' when dirs were set from CLI args", () => {
      setAllowedReadDirs(["/docs"], "cli-args");
      setAllowedWriteDirs(["/output"], "cli-args");
      expect(getPermissionSource()).toBe("cli-args");
    });
  });

  describe("resetAllowedDirs", () => {
    it("should clear all state", () => {
      setAllowedReadDirs(["/project"], "roots");
      setAllowedWriteDirs(["/project"], "roots");
      resetAllowedDirs();
      expect(getAllowedReadDirs()).toEqual([]);
      expect(getAllowedWriteDirs()).toEqual([]);
      expect(getPermissionSource()).toBe("none");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/allowed-dirs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/allowed-dirs.ts
type PermissionSource = "roots" | "cli-args" | "none";

let readDirs: string[] = [];
let writeDirs: string[] = [];
let source: PermissionSource = "none";

export function setAllowedReadDirs(dirs: string[], from?: PermissionSource): void {
  readDirs = dirs;
  if (from) source = from;
}

export function setAllowedWriteDirs(dirs: string[], from?: PermissionSource): void {
  writeDirs = dirs;
  if (from) source = from;
}

export function getAllowedReadDirs(): string[] {
  return readDirs;
}

export function getAllowedWriteDirs(): string[] {
  return writeDirs;
}

export function getPermissionSource(): PermissionSource {
  return source;
}

export function resetAllowedDirs(): void {
  readDirs = [];
  writeDirs = [];
  source = "none";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/allowed-dirs.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/allowed-dirs.ts tests/utils/allowed-dirs.test.ts
git commit -m "feat: add allowed-dirs module for mutable permission state"
```

---

### Task 2: Simplify `config.ts` — remove `OLLAMA_OCR_OUTPUT_DIR`

**Files:**
- Modify: `src/utils/config.ts`
- Modify: `tests/utils/config.test.ts`

- [ ] **Step 1: Update config tests — remove outputDir tests, adjust remaining tests**

The test file currently tests `OLLAMA_OCR_OUTPUT_DIR` as required, outputDir field, and outputDir-outside-writeDirs validation. Remove those tests. Update `getConfig` mock returns throughout all test files to remove `outputDir`.

Replace `tests/utils/config.test.ts` entirely:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/config.test.ts`
Expected: FAIL — config still requires `OLLAMA_OCR_OUTPUT_DIR`

- [ ] **Step 3: Update `config.ts` — remove outputDir field and env var requirement**

Replace `src/utils/config.ts`:

```typescript
import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export interface Config {
  apiKey: string;
  model: string;
  fallbackModel: string | undefined;
  readDirs: string[];
  writeDirs: string[];
}

const DEFAULT_MODEL = "gemini-3-flash-preview";

function parseDirs(value: string, label: string): string[] {
  return value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      try {
        return realpathSync(resolve(p));
      } catch {
        process.stderr.write(`Error: ${label} directory does not exist: ${resolve(p)}\n`);
        process.exit(1);
      }
    });
}

function parseCliArgs(argv: string[]): { readRaw?: string; writeRaw?: string } {
  let readRaw: string | undefined;
  let writeRaw: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--read" && i + 1 < argv.length) {
      readRaw = argv[++i];
    } else if (arg === "--write" && i + 1 < argv.length) {
      writeRaw = argv[++i];
    }
  }

  return { readRaw, writeRaw };
}

let cachedConfig: Config | undefined;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const apiKey = process.env.OLLAMA_API_KEY;

  if (!apiKey) {
    process.stderr.write("Error: OLLAMA_API_KEY environment variable is required\n");
    process.exit(1);
  }

  const { readRaw, writeRaw } = parseCliArgs(process.argv);

  let readDirs: string[] = [];
  let writeDirs: string[] = [];

  if (writeRaw) {
    writeDirs = parseDirs(writeRaw, "--write");
  }

  if (readRaw) {
    readDirs = parseDirs(readRaw, "--read");
  } else if (writeDirs.length > 0) {
    readDirs = [...writeDirs];
  }

  cachedConfig = {
    apiKey,
    model: process.env.OLLAMA_OCR_MODEL ?? DEFAULT_MODEL,
    fallbackModel: process.env.OLLAMA_OCR_FALLBACK_MODEL,
    readDirs,
    writeDirs,
  };

  return cachedConfig;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/config.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: May have errors in other files referencing `config.outputDir` — those will be fixed in later tasks. For this task, just verify config.ts itself is clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/config.ts tests/utils/config.test.ts
git commit -m "refactor: remove OLLAMA_OCR_OUTPUT_DIR from config"
```

---

### Task 3: Update `path-guard.ts` to use `allowed-dirs` module

**Files:**
- Modify: `src/utils/path-guard.ts`
- Modify: `tests/utils/path-guard.test.ts`

- [ ] **Step 1: Update path-guard tests to use the new internal-dirs API**

The `assertPath` function will read from `allowed-dirs` internally instead of receiving dirs as a parameter. Add new describe blocks for `assertReadPath` and `assertWritePath`, keep `isWithinAllowed` tests as-is (it's a pure utility that still takes dirs as param).

Replace `tests/utils/path-guard.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { isWithinAllowed, assertPath, assertReadPath, assertWritePath, PermissionError } from "../../src/utils/path-guard.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setAllowedReadDirs, setAllowedWriteDirs, resetAllowedDirs } from "../../src/utils/allowed-dirs.js";

describe("isWithinAllowed", () => {
  it("should return true for exact match", () => {
    expect(isWithinAllowed("/home/user/project", ["/home/user/project"])).toBe(true);
  });

  it("should return true for a child path", () => {
    expect(isWithinAllowed("/home/user/project/src/file.txt", ["/home/user/project"])).toBe(true);
  });

  it("should return false for a sibling path", () => {
    expect(isWithinAllowed("/home/user/other/file.txt", ["/home/user/project"])).toBe(false);
  });

  it("should return false for a prefix-only match (no trailing sep)", () => {
    expect(isWithinAllowed("/home/user/project-other/file.txt", ["/home/user/project"])).toBe(false);
  });

  it("should match against any dir in the list", () => {
    expect(
      isWithinAllowed("/opt/data/file.txt", ["/home/user/project", "/opt/data"]),
    ).toBe(true);
  });

  it("should return false when list is empty", () => {
    expect(isWithinAllowed("/any/path", [])).toBe(false);
  });
});

describe("assertPath (with explicit dirs)", () => {
  const tmpBase = process.env.TMPDIR ?? "/tmp";
  const testDir = join(tmpBase, `path-guard-test-${Date.now()}`);
  const allowedDir = join(testDir, "allowed");
  const outsideDir = join(testDir, "outside");

  beforeAll(() => {
    mkdirSync(allowedDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(allowedDir, "file.txt"), "test");
    writeFileSync(join(outsideDir, "secret.txt"), "secret");
  });

  afterAll(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("should return real path when within allowed dirs", () => {
    const filePath = join(allowedDir, "file.txt");
    const result = assertPath(filePath, [allowedDir], "Read");
    expect(result).toContain("file.txt");
  });

  it("should throw PermissionError when outside allowed dirs", () => {
    const filePath = join(outsideDir, "secret.txt");
    expect(() => assertPath(filePath, [allowedDir], "Read")).toThrow(PermissionError);
  });

  it("should include the label in the error message", () => {
    const filePath = join(outsideDir, "secret.txt");
    try {
      assertPath(filePath, [allowedDir], "Write");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionError);
      expect((err as PermissionError).message).toContain("Write denied");
    }
  });
});

describe("assertReadPath", () => {
  beforeEach(() => {
    resetAllowedDirs();
  });

  it("should return real path when within read dirs", () => {
    const tmpBase = process.env.TMPDIR ?? "/tmp";
    const allowedDir = join(tmpBase, `read-test-${Date.now()}`);
    mkdirSync(allowedDir, { recursive: true });
    writeFileSync(join(allowedDir, "file.txt"), "test");

    setAllowedReadDirs([allowedDir]);
    const result = assertReadPath(join(allowedDir, "file.txt"));
    expect(result).toContain("file.txt");

    try { rmSync(allowedDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("should throw PermissionError when outside read dirs", () => {
    setAllowedReadDirs(["/some/allowed/dir"]);
    expect(() => assertReadPath("/outside/dir/file.txt")).toThrow(PermissionError);
  });
});

describe("assertWritePath", () => {
  beforeEach(() => {
    resetAllowedDirs();
  });

  it("should return real path when within write dirs", () => {
    const tmpBase = process.env.TMPDIR ?? "/tmp";
    const allowedDir = join(tmpBase, `write-test-${Date.now()}`);
    mkdirSync(allowedDir, { recursive: true });

    setAllowedWriteDirs([allowedDir]);
    const result = assertWritePath(join(allowedDir, "output.json"));
    expect(result).toContain("output.json");

    try { rmSync(allowedDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("should throw PermissionError when outside write dirs", () => {
    setAllowedWriteDirs(["/some/allowed/dir"]);
    expect(() => assertWritePath("/outside/dir/file.txt")).toThrow(PermissionError);
  });
});

describe("PermissionError", () => {
  it("should have the correct name", () => {
    const err = new PermissionError("test");
    expect(err.name).toBe("PermissionError");
    expect(err.message).toBe("test");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/path-guard.test.ts`
Expected: FAIL — `assertReadPath` and `assertWritePath` not exported

- [ ] **Step 3: Update `path-guard.ts` — add assertReadPath and assertWritePath**

```typescript
// src/utils/path-guard.ts
import { realpathSync } from "node:fs";
import { sep, resolve } from "node:path";
import { getAllowedReadDirs, getAllowedWriteDirs } from "./allowed-dirs.js";

export function isWithinAllowed(realPath: string, allowedDirs: string[]): boolean {
  return allowedDirs.some(
    (dir) => realPath === dir || realPath.startsWith(dir + sep),
  );
}

export function assertPath(
  rawPath: string,
  allowedDirs: string[],
  label: string,
): string {
  const resolved = resolve(rawPath);

  try {
    const real = realpathSync(resolved);
    if (!isWithinAllowed(real, allowedDirs)) {
      throw new PermissionError(
        `${label} denied: ${resolved} is outside allowed directories`,
      );
    }
    return real;
  } catch (err) {
    if (err instanceof PermissionError) throw err;
    const parent = resolved.substring(0, resolved.lastIndexOf(sep));
    try {
      const realParent = realpathSync(parent);
      const realFull = realParent + resolved.substring(resolved.lastIndexOf(sep));
      if (!isWithinAllowed(realFull, allowedDirs)) {
        throw new PermissionError(
          `${label} denied: ${resolved} is outside allowed directories`,
        );
      }
      return realFull;
    } catch (innerErr) {
      if (innerErr instanceof PermissionError) throw innerErr;
      throw new PermissionError(
        `${label} denied: ${resolved} is outside allowed directories`,
      );
    }
  }
}

export function assertReadPath(rawPath: string): string {
  return assertPath(rawPath, getAllowedReadDirs(), "Read");
}

export function assertWritePath(rawPath: string): string {
  return assertPath(rawPath, getAllowedWriteDirs(), "Write");
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/path-guard.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/path-guard.ts tests/utils/path-guard.test.ts
git commit -m "feat: add assertReadPath/assertWritePath using allowed-dirs module"
```

---

### Task 4: Update `output-writer.ts` — take full output path

**Files:**
- Modify: `src/services/output-writer.ts`
- Modify: `tests/services/output-writer.test.ts`

- [ ] **Step 1: Read current output-writer test to understand writeOutput tests**

Read: `tests/services/output-writer.test.ts`

- [ ] **Step 2: Update `writeOutput` signature and tests**

The `writeOutput` function changes from `(outputDir, filename, content, writeDirs?)` to `(outputPath, content)`.

Update the writeOutput tests in `tests/services/output-writer.test.ts`. Find the existing describe block for `writeOutput` and replace with:

```typescript
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
```

Add these imports at the top of the test file if not already present:
```typescript
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/services/output-writer.test.ts`
Expected: FAIL — `writeOutput` signature mismatch

- [ ] **Step 4: Update `writeOutput` in `src/services/output-writer.ts`**

Replace the `writeOutput` function (around line 128):

```typescript
export async function writeOutput(
  outputPath: string,
  content: string,
): Promise<string> {
  const tmpdir = process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? "/tmp";
  const filename = basename(outputPath);
  const tmpPath = join(tmpdir, `.ocr_tmp_${Date.now()}_${filename}`);
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, outputPath);

  return outputPath;
}
```

Keep the `import { basename, join } from "node:path"` at the top. The `extname` import can stay if used by `generateOutputFilename`. Add `basename` to the path import if not already there.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/services/output-writer.test.ts`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/services/output-writer.ts tests/services/output-writer.test.ts
git commit -m "refactor: simplify writeOutput to take full output path"
```

---

### Task 5: Wire up Roots discovery in `server.ts`

**Files:**
- Modify: `src/server.ts`
- Create: `tests/server.test.ts`

- [ ] **Step 1: Write failing tests for roots discovery**

```typescript
// tests/server.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

vi.mock("./src/utils/config.js", () => ({
  getConfig: vi.fn(() => ({
    apiKey: "test-key",
    model: "test-model",
    fallbackModel: undefined,
    readDirs: [],
    writeDirs: [],
  })),
}));

vi.mock("./src/utils/progress.js", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  setProgressServer: vi.fn(),
}));

- [ ] **Step 2: Add `parseRootUris` to `allowed-dirs.ts` and write failing tests**

Add to `tests/utils/allowed-dirs.test.ts` (append to the file, inside the main describe block):

```typescript
describe("parseRootUris", () => {
  it("should parse file:// URIs to filesystem paths", () => {
    const result = parseRootUris([
      { uri: "file:///home/user/project", name: "Project" },
    ]);
    expect(result).toEqual(["/home/user/project"]);
  });

  it("should skip non-file URIs", () => {
    const result = parseRootUris([
      { uri: "https://example.com", name: "Remote" },
    ]);
    expect(result).toEqual([]);
  });

  it("should handle multiple roots", () => {
    const result = parseRootUris([
      { uri: "file:///home/user/project", name: "Project" },
      { uri: "file:///home/user/docs", name: "Docs" },
    ]);
    expect(result).toEqual(["/home/user/project", "/home/user/docs"]);
  });

  it("should handle empty roots array", () => {
    const result = parseRootUris([]);
    expect(result).toEqual([]);
  });

  it("should handle Windows file URIs", () => {
    const result = parseRootUris([
      { uri: "file:///C:/Users/name/project", name: "Win" },
    ]);
    expect(result).toEqual(["C:/Users/name/project"]);
  });
});
```

Add the import for `parseRootUris` to the test file's import statement.

Run: `npx vitest run tests/utils/allowed-dirs.test.ts`
Expected: FAIL — `parseRootUris` not exported

Add to `src/utils/allowed-dirs.ts`:

```typescript
import { realpathSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function parseRootUris(
  roots: Array<{ uri: string; name?: string }>,
): string[] {
  const paths: string[] = [];
  for (const root of roots) {
    if (!root.uri.startsWith("file://")) {
      process.stderr.write(`[WARN] Skipping non-file root URI: ${root.uri}\n`);
      continue;
    }
    const filePath = fileUriToPath(root.uri);
    try {
      const resolved = realpathSync(resolve(filePath));
      paths.push(resolved);
    } catch {
      if (existsSync(filePath)) {
        paths.push(resolve(filePath));
      } else {
        process.stderr.write(`[WARN] Root path does not exist: ${filePath}\n`);
      }
    }
  }
  return paths;
}

function fileUriToPath(uri: string): string {
  const path = uri.replace(/^file:\/\//, "");
  if (path.match(/^\/[A-Za-z]:\//)) {
    return path.substring(1);
  }
  return path;
}
```

Run: `npx vitest run tests/utils/allowed-dirs.test.ts`
Expected: PASS (all tests including parseRootUris)

- [ ] **Step 3: Update `server.ts` with roots discovery wiring**

```typescript
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerExtractTextTool } from "./tools/extract-text.js";
import { registerListAllowedDirsTool } from "./tools/list-allowed-dirs.js";
import { setAllowedReadDirs, setAllowedWriteDirs, parseRootUris } from "./utils/allowed-dirs.js";
import { getConfig } from "./utils/config.js";
import { setProgressServer } from "./utils/progress.js";

export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "ollama-ocr",
    version: "0.0.1",
  });

  setProgressServer(server);
  registerExtractTextTool(server);
  registerListAllowedDirsTool(server);

  server.server.oninitialized = async () => {
    const clientCapabilities = server.server.getClientCapabilities();

    if (clientCapabilities?.roots) {
      try {
        const response = await server.server.listRoots();
        if (response?.roots && response.roots.length > 0) {
          const dirs = parseRootUris(response.roots);
          setAllowedReadDirs(dirs, "roots");
          setAllowedWriteDirs(dirs, "roots");
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[WARN] listRoots() failed: ${msg} — falling back to CLI args\n`);
      }
    }

    // Fallback: use CLI args from config
    const config = getConfig();
    if (config.readDirs.length > 0 || config.writeDirs.length > 0) {
      setAllowedReadDirs(config.readDirs, "cli-args");
      setAllowedWriteDirs(config.writeDirs, "cli-args");
    }
  };

  server.server.setNotificationHandler(
    { method: "notifications/roots/list_changed" },
    async () => {
      try {
        const response = await server.server.listRoots();
        if (response?.roots) {
          const dirs = parseRootUris(response.roots);
          setAllowedReadDirs(dirs, "roots");
          setAllowedWriteDirs(dirs, "roots");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[WARN] listRoots() on update failed: ${msg}\n`);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: May have errors for `registerListAllowedDirsTool` — that will be created in Task 7. The rest should be clean.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/utils/allowed-dirs.ts tests/utils/allowed-dirs.test.ts
git commit -m "feat: wire up MCP Roots discovery in server initialization"
```

---

### Task 6: Update `extract-text.ts` — use allowed-dirs and outputPath

**Files:**
- Modify: `src/tools/extract-text.ts`
- Modify: `tests/tools/extract-text.test.ts`

- [ ] **Step 1: Update extract-text test to use new permission model**

Replace `tests/tools/extract-text.test.ts`:

```typescript
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
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { setAllowedReadDirs, setAllowedWriteDirs, resetAllowedDirs } from "../../src/utils/allowed-dirs.js";

const mockExtractText = vi.mocked(extractTextFromImage);
const mockLoadImage = vi.mocked(loadImage);
const mockGetConfig = vi.mocked(getConfig);

describe("extract-text tool", () => {
  let testDir: string;
  let testImage: string;

  beforeEach(async () => {
    const tmpDir = process.env.TMPDIR ?? "/tmp";
    testDir = join(tmpDir, `ocr-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    testImage = join(testDir, "test.png");
    await writeFile(testImage, Buffer.from("fake png data"));

    // Set allowed dirs to the test directory
    setAllowedReadDirs([testDir], "roots");
    setAllowedWriteDirs([testDir], "roots");

    mockGetConfig.mockReturnValue({
      apiKey: "test-key",
      model: "test-model",
      fallbackModel: "test-fallback",
      readDirs: [],
      writeDirs: [],
    });
  });

  afterEach(async () => {
    resetAllowedDirs();
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

  it("should process a single image file and write output next to source", async () => {
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
    // Output should be in the same directory as the source
    const files = readdirSync(testDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(1);
  });

  it("should write to explicit outputPath when provided", async () => {
    const outputDir = join(testDir, "output");
    await mkdir(outputDir, { recursive: true });
    setAllowedWriteDirs([testDir, outputDir], "roots");

    mockLoadImage.mockResolvedValue({
      base64: "fakebase64",
      mimeType: "image/png",
    });
    mockExtractText.mockResolvedValue({
      text: "text",
      usedFallback: false,
    });

    const explicitOutput = join(outputDir, "custom.json");
    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: testImage, format: "json", outputPath: explicitOutput },
      {} as never,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(explicitOutput);
    expect(existsSync(explicitOutput)).toBe(true);
  });

  it("should reject outputPath outside allowed write dirs", async () => {
    mockLoadImage.mockResolvedValue({
      base64: "fakebase64",
      mimeType: "image/png",
    });
    mockExtractText.mockResolvedValue({
      text: "text",
      usedFallback: false,
    });

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: testImage, format: "json", outputPath: "/outside/allowed/output.json" },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("denied");
  });

  it("should reject file path outside read dirs", async () => {
    const restrictedDir = join(testDir, "restricted");
    await mkdir(restrictedDir, { recursive: true });
    setAllowedReadDirs([restrictedDir], "roots");
    setAllowedWriteDirs([testDir], "roots");

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: testImage },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("denied");
  });

  it("should return error when no allowed dirs are configured", async () => {
    resetAllowedDirs();

    const { handleExtractText } = await import("../../src/tools/extract-text.js");
    const result = await handleExtractText(
      { filePath: testImage },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No allowed directories configured");
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/extract-text.test.ts`
Expected: FAIL — extract-text still uses old config model

- [ ] **Step 3: Update `extract-text.ts`**

Replace `src/tools/extract-text.ts`:

```typescript
import { existsSync } from "node:fs";
import { extname, resolve, basename, dirname, join } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { getConfig } from "../utils/config.js";
import { PermissionError, assertReadPath, assertWritePath } from "../utils/path-guard.js";
import { getAllowedReadDirs, getAllowedWriteDirs } from "../utils/allowed-dirs.js";
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
  outputPath: z.string().optional().describe("Absolute path for the output file. Defaults to the source file's directory with an auto-generated filename."),
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
    outputPath?: string;
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

  // Check that allowed dirs are configured
  const readDirs = getAllowedReadDirs();
  const writeDirs = getAllowedWriteDirs();
  if (readDirs.length === 0 && writeDirs.length === 0) {
    return {
      content: [{ type: "text", text: "No allowed directories configured. The client must support MCP Roots, or --read/--write must be provided." }],
      isError: true,
    };
  }

  const absolutePath = resolve(args.filePath);

  // Validate read path
  try {
    assertReadPath(absolutePath);
  } catch (err) {
    if (err instanceof PermissionError) {
      return {
        content: [{ type: "text", text: err.message }],
        isError: true,
      };
    }
    throw err;
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

  if (args.pages) {
    const pagesRegex = /^\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*$/;
    if (!pagesRegex.test(args.pages)) {
      return {
        content: [{ type: "text", text: `Invalid page range format: "${args.pages}". Use formats like "1-5", "1,3,7", "1-3,7,10-12"` }],
        isError: true,
      };
    }
  }

  // Determine output path
  let finalOutputPath: string;
  if (args.outputPath) {
    finalOutputPath = resolve(args.outputPath);
  } else {
    const sourceDir = dirname(absolutePath);
    const filename = generateOutputFilename(absolutePath, format);
    finalOutputPath = join(sourceDir, filename);
  }

  // Validate write path
  try {
    assertWritePath(finalOutputPath);
  } catch (err) {
    if (err instanceof PermissionError) {
      return {
        content: [{ type: "text", text: err.message }],
        isError: true,
      };
    }
    throw err;
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

    const docName = basename(absolutePath);
    let content: string;

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

    await writeOutput(finalOutputPath, content);

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
          `Output: ${finalOutputPath}`,
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
      description: [
        "Extract verbatim text from a PDF or image file using Ollama Cloud vision models.",
        "The output file is written next to the source file by default. Use outputPath to specify a different location.",
        "File access is restricted to directories provided by the client workspace (MCP Roots) or configured via --read/--write CLI arguments.",
        "Use the list_allowed_directories tool to check which directories are accessible.",
      ].join(" "),
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/extract-text.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/extract-text.ts tests/tools/extract-text.test.ts
git commit -m "feat: update extract-text to use allowed-dirs and outputPath"
```

---

### Task 7: Add `list_allowed_directories` tool

**Files:**
- Create: `src/tools/list-allowed-dirs.ts`
- Create: `tests/tools/list-allowed-dirs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/list-allowed-dirs.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setAllowedReadDirs, setAllowedWriteDirs, resetAllowedDirs } from "../../src/utils/allowed-dirs.js";

describe("list_allowed_directories tool", () => {
  beforeEach(() => {
    resetAllowedDirs();
  });

  afterEach(() => {
    resetAllowedDirs();
  });

  it("should return empty dirs when none configured", async () => {
    const { handleListAllowedDirs } = await import("../../src/tools/list-allowed-dirs.js");
    const result = await handleListAllowedDirs({}, {} as never);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.readDirs).toEqual([]);
    expect(parsed.writeDirs).toEqual([]);
    expect(parsed.source).toBe("none");
  });

  it("should return dirs from roots", async () => {
    setAllowedReadDirs(["/project"], "roots");
    setAllowedWriteDirs(["/project"], "roots");

    const { handleListAllowedDirs } = await import("../../src/tools/list-allowed-dirs.js");
    const result = await handleListAllowedDirs({}, {} as never);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.readDirs).toEqual(["/project"]);
    expect(parsed.writeDirs).toEqual(["/project"]);
    expect(parsed.source).toBe("roots");
  });

  it("should return separate read and write dirs from CLI args", async () => {
    setAllowedReadDirs(["/docs"], "cli-args");
    setAllowedWriteDirs(["/output"], "cli-args");

    const { handleListAllowedDirs } = await import("../../src/tools/list-allowed-dirs.js");
    const result = await handleListAllowedDirs({}, {} as never);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.readDirs).toEqual(["/docs"]);
    expect(parsed.writeDirs).toEqual(["/output"]);
    expect(parsed.source).toBe("cli-args");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/list-allowed-dirs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/list-allowed-dirs.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { getAllowedReadDirs, getAllowedWriteDirs, getPermissionSource } from "../utils/allowed-dirs.js";

const ListAllowedDirsSchema = z.object({}).strict();

export async function handleListAllowedDirs(
  _args: Record<string, unknown>,
  _extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        readDirs: getAllowedReadDirs(),
        writeDirs: getAllowedWriteDirs(),
        source: getPermissionSource(),
      }, null, 2),
    }],
  };
}

export function registerListAllowedDirsTool(server: McpServer): void {
  server.registerTool(
    "list_allowed_directories",
    {
      description: "List all directories the server is allowed to read from and write to",
      inputSchema: ListAllowedDirsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    handleListAllowedDirs,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/list-allowed-dirs.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/list-allowed-dirs.ts tests/tools/list-allowed-dirs.test.ts
git commit -m "feat: add list_allowed_directories discovery tool"
```

---

### Task 8: Final integration — typecheck and full test suite

**Files:**
- Modify: `src/index.ts` (if needed for import changes)
- Modify: `tests/services/output-writer.test.ts` (update writeOutput call sites)

- [ ] **Step 1: Update output-writer test file**

Read `tests/services/output-writer.test.ts` and find any remaining references to the old `writeOutput(dir, filename, content, writeDirs)` signature. Update them to the new `writeOutput(outputPath, content)` signature. The formatting tests (formatJsonOutput, formatMarkdownOutput, formatTextOutput, generateOutputFilename) should not need changes.

- [ ] **Step 2: Update index.ts if needed**

Read `src/index.ts` to verify the entry point doesn't reference `config.outputDir` or old patterns. It should just call `createServer()`.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — zero type errors across all files

If there are errors, fix them. Common issues:
- Old `config.outputDir` references in test mocks
- Old `writeOutput` call signatures
- Missing imports for new modules

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS — all tests across all files

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve integration issues from permission system refactor"
```

Only commit if there are actual fixes needed. Skip if everything passes cleanly.

---

### Task 9: Update README and configuration docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README to reflect new configuration**

Find the configuration section in README.md and update:
- Remove `OLLAMA_OCR_OUTPUT_DIR` from required env vars
- Document that permissions come from MCP Roots automatically
- Document `--read`/`--write` as fallback for non-Roots clients
- Document the new `outputPath` parameter
- Document the `list_allowed_directories` tool
- Update example MCP server configurations (remove OLLAMA_OCR_OUTPUT_DIR from env)

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for roots-based permission system"
```
