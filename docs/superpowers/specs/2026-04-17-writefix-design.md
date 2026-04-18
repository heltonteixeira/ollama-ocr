# Write Output & Permission System Fix Design

**Date:** 2026-04-17
**Status:** Approved

## Problem

Three issues make the MCP server unusable on Android/Termux:

1. **EXDEV cross-device rename** — `writeOutput` writes a temp file to `$TMPDIR` (`/data/data/com.termux/files/usr/tmp/`) then `rename()`s it to the output path (e.g., `/storage/emulated/0/`). On Android these are different filesystems, so `rename()` fails with `EXDEV`.

2. **Write permission denied for temp file** — The temp file lands in `$TMPDIR`, which is outside the allowed directories. The permission system correctly blocks it.

3. **Orphaned output files on failure** — `writeOutput` is called unconditionally (line 278 of `extract-text.ts`), then only after writing does the code check `successfulPages.length === 0`. When all pages fail, a file containing metadata + errors is left on disk.

A secondary finding: the `list_allowed_directories` tool is unnecessary for this specialized server and should be removed.

## Root Cause Analysis

### EXDEV and permission denied share one root cause

`writeOutput` (lines 127-138 of `src/services/output-writer.ts`) uses `$TMPDIR` for temp files:

```
$TMPDIR/.ocr_tmp_<timestamp>_<filename>  →  rename()  →  <outputPath>
```

The atomic-write-via-temp-file pattern is over-engineering for this use case:
- Content is a fully-constructed in-memory string
- Output is regenerable (user can re-run extraction)
- Almost always a new file (timestamped name)
- No concurrent readers expecting atomicity

The official `@modelcontextprotocol/server-filesystem` uses direct `writeFile()` for new files and reserves temp-file-then-rename only for overwrites (as a symlink-race defense).

### Why tests missed everything

All tests create `testDir` under `$TMPDIR` and add it to allowed dirs. Source, output, and temp file are always in the same directory on the same filesystem. Cross-device and cross-permission scenarios are never exercised.

### `list_allowed_directories` is unnecessary

Research findings:
- No specialized MCP server (OCR, database, web fetch, git) exposes a permission introspection tool
- Only the generic `@modelcontextprotocol/server-filesystem` has it, where the LLM browses an unknown directory tree
- For this OCR server, the user provides the file path — there is no discovery phase
- LLMs don't naturally pre-flight with permission discovery; they call the tool and handle errors
- The tool wastes context window tokens on every request
- Real-world bugs: Claude Desktop issue #21320 — `list_allowed_directories` caused endless retry loops

## Design

### 1. Remove `list_allowed_directories` tool

**Remove:**
- `src/tools/list-allowed-dirs.ts`
- `tests/tools/list-allowed-dirs.test.ts`
- Registration in `src/server.ts` (`registerListAllowedDirsTool` import and call)
- Reference in `extract-text.ts` tool description

**Keep:** `src/utils/allowed-dirs.ts` — still needed internally for roots/CLI-args state management.

**Replace with:** Enhanced `PermissionError` messages that include the list of allowed directories:

```
Write denied: /denied/path is outside allowed directories. Allowed: /home/user/project, /docs
```

This gives the LLM (and user) the same information, but only when it's actually needed — at the point of failure.

### 2. Simplify `writeOutput` — direct write, no temp file

Replace:

```typescript
const tmpdir = process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? "/tmp";
const filename = basename(outputPath);
const tmpPath = join(tmpdir, `.ocr_tmp_${Date.now()}_${filename}`);
await writeFile(tmpPath, content, "utf-8");
await rename(tmpPath, outputPath);
return outputPath;
```

With:

```typescript
await writeFile(outputPath, content, "utf-8");
return outputPath;
```

Removes `$TMPDIR` dependency and `rename()` call, eliminating both the EXDEV and permission bugs. The `rename` import from `node:fs/promises` becomes unused and should be removed. (`basename` and `join` are still used by other functions in the same file.)

### 3. Gate file writes on success

In `extract-text.ts`, move `writeOutput` inside a success check:

```typescript
// Only persist output when there are successful extractions
if (successfulPages.length > 0) {
  await writeOutput(finalOutputPath, content);
}
```

When `successfulPages.length === 0`, the function returns `isError: true` without writing any file. No orphaned error-metadata files on disk.

### 4. Update tests

**Remove:**
- `tests/tools/list-allowed-dirs.test.ts` — entire file

**Update `tests/services/output-writer.test.ts`:**
- Remove temp-file/renames tests
- Test direct write behavior (write content, overwrite existing file)

**Update `tests/tools/extract-text.test.ts`:**
- Add test: no file created when all pages fail
- Add test: file created with correct content when extraction succeeds
- Remove any references to `list_allowed_directories`

**Update `tests/utils/path-guard.test.ts`:**
- Enhance `PermissionError` tests to verify allowed dirs appear in the error message

### 5. Cleanup

- Remove unused `sep` import in `src/utils/config.ts` (line 3)
- Remove `registerListAllowedDirsTool` import and call from `src/server.ts`
- Update `README.md` — remove `list_allowed_directories` tool documentation
- Update `extract-text.ts` tool description — remove the sentence referencing `list_allowed_directories`

## Files Changed

| File | Action |
|------|--------|
| `src/tools/list-allowed-dirs.ts` | Delete |
| `tests/tools/list-allowed-dirs.test.ts` | Delete |
| `src/tools/extract-text.ts` | Gate writeOutput, update description |
| `src/services/output-writer.ts` | Simplify to direct writeFile |
| `src/utils/path-guard.ts` | Enhance PermissionError with allowed dirs |
| `src/utils/config.ts` | Remove unused `sep` import |
| `src/server.ts` | Remove listAllowedDirs registration |
| `tests/services/output-writer.test.ts` | Update for direct write |
| `tests/tools/extract-text.test.ts` | Add failure-no-file test |
| `tests/utils/path-guard.test.ts` | Test enhanced error messages |
| `README.md` | Remove list_allowed_directories section |
