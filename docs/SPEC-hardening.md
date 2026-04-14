# SPEC: Security Hardening — API Key & File Operations

Supersedes and amends relevant sections of `docs/SPEC.md`.

---

## Objective

Harden the MCP server against the MCP security best-practices checklist for API key handling and file operations. Four items currently fail; this spec brings them to pass.

---

## Changes

### 1. Allowed Directories via CLI Args

**Problem:** Input files can be any path on the system. No path traversal protection.

**Solution:** Accept `--read` and `--write` CLI arguments specifying allowed directory roots. Resolve to real paths at startup. Validate every file operation against these scopes.

**CLI convention:**
```
node dist/index.js --read /project/src,/home/user/docs --write /project/output
```

**MCP host config:**
```json
{
  "mcpServers": {
    "ollama-ocr": {
      "command": "node",
      "args": [
        "/absolute/path/to/dist/index.js",
        "--read", "/project/src,/home/user/docs",
        "--write", "/project/output"
      ],
      "env": {
        "OLLAMA_API_KEY": "...",
        "OLLAMA_OCR_OUTPUT_DIR": "/project/output"
      }
    }
  }
}
```

**Behavior:**
- Multiple `--read` dirs allowed (comma-separated)
- Single `--write` dir required (comma-separated also accepted)
- All paths resolved to real paths via `realpathSync` at startup
- Server exits on startup if `--write` is missing or dirs don't exist
- `--read` defaults to `--write` dirs if omitted (convenience: read what you can write to)
- `OLLAMA_OCR_OUTPUT_DIR` must be inside a `--write` dir (validated at startup)

**Path validation function:**
```typescript
function isWithinAllowed(realPath: string, allowedDirs: string[]): boolean {
  return allowedDirs.some(
    (dir) => realPath === dir || realPath.startsWith(dir + sep),
  );
}
```

Applied to:
- `filePath` input — checked against read dirs
- `outputDir` config — checked against write dirs at startup
- Any file written by `output-writer.ts` — checked against write dirs

**Files changed:**
- `src/utils/config.ts` — parse CLI args, add `readDirs` and `writeDirs` to `Config`
- `src/utils/path-guard.ts` — new file with `isWithinAllowed()` and `assertPath()`
- `src/tools/extract-text.ts` — validate `filePath` against read dirs
- `src/services/output-writer.ts` — validate write paths against write dirs

---

### 2. Atomic Writes

**Problem:** `output-writer.ts` writes directly to the target file via `writeFile()`. Process crash during write leaves a corrupt partial file.

**Solution:** Write to a temp file first, then rename atomically.

```typescript
async function writeOutput(outputDir: string, filename: string, content: string): Promise<string> {
  const outputPath = join(outputDir, filename);
  const tmpdir = process.env.TMPDIR ?? "/data/data/com.termux/files/usr/tmp";
  const tmpPath = join(tmpdir, `.ocr_tmp_${Date.now()}_${filename}`);
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, outputPath);
  return outputPath;
}
```

**Why `rename` instead of `writeFile`:** `rename(2)` is atomic on the same filesystem — the target file either has the old content or the new content, never a partial write.

**Files changed:**
- `src/services/output-writer.ts` — replace direct `writeFile` with temp+rename

---

### 3. .gitignore Coverage

**Problem:** Missing `*.key`, `*secret*`, `config.local.*` patterns.

**Solution:** Add them.

**Files changed:**
- `.gitignore` — add 3 patterns

---

### 4. Backward Compatibility

The server MUST still work without `--read`/`--write` args for local-only use (no sandbox), but MUST log a warning to stderr:
```
[WARN] No --read/--write directories specified — all paths allowed. Use --read and --write to restrict file access.
```

This preserves the current behavior while encouraging secure configuration.

---

## Acceptance Criteria

- [ ] `--read` and `--write` CLI args parsed, resolved, validated at startup
- [ ] Every file read validated against read dirs (or warning logged if no dirs)
- [ ] Every file write validated against write dirs (or warning logged if no dirs)
- [ ] `OLLAMA_OCR_OUTPUT_DIR` validated against write dirs at startup
- [ ] Output files written atomically via temp file + rename
- [ ] Temp files use `$TMPDIR`, not `/tmp/`
- [ ] `.gitignore` covers `.env`, `.env.local`, `*.key`, `*secret*`, `config.local.*`
- [ ] Existing tests still pass
- [ ] New tests for: path validation, atomic write behavior, CLI arg parsing
- [ ] SPEC.md updated to reflect new CLI args and config

---

## Implementation Order

Atomic, one task per commit:

1. **`.gitignore` hardening** — simplest, no logic changes
2. **Path guard utility** — new `src/utils/path-guard.ts`, no callers yet
3. **CLI arg parsing + config expansion** — update `config.ts`
4. **Path validation in extract-text.ts** — wire read-dir checks
5. **Path validation in output-writer.ts + atomic writes** — wire write-dir checks + temp+rename
6. **SPEC.md update** — reflect new config schema
7. **Tests** — cover all new behavior
