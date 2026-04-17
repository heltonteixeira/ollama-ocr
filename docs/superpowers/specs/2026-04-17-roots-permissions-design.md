# Roots-Based Permission System

Replace hardcoded `OLLAMA_OCR_OUTPUT_DIR` env var and static CLI args with MCP Roots protocol for dynamic directory discovery.

## Problem

The server requires `OLLAMA_OCR_OUTPUT_DIR` as a required env var and accepts `--read`/`--write` CLI args for path restrictions. This forces users to hardcode paths at configuration time, making it difficult to use the server across multiple projects — especially with Claude Code, where the workspace changes per session.

## Solution

Use the MCP Roots protocol to dynamically discover the client's workspace directories at runtime. Roots define the allowed read/write boundary. CLI args remain as a fallback for clients that don't support Roots.

## Permission Discovery

### Priority Chain

```
oninitialized → listRoots()
  ├── Roots available → use as allowedDirs
  ├── No roots, but --read/--write CLI args → use as allowedDirs
  └── Neither → deny all file operations, return error to caller
```

### Roots Protocol Integration

- On `oninitialized`, call `listRoots()` to discover client workspace roots
- Parse `file://` URIs to filesystem paths
- Store parsed paths as the allowed directories
- Listen for `notifications/roots/list_changed` to update dynamically when the client changes workspace
- Roots take priority over CLI args when both are present

### Fallback Behavior

- `--read` and `--write` CLI args are still accepted but only used when Roots is unavailable (e.g. Claude Desktop)
- When neither Roots nor CLI args are configured, the tool returns an error: `"No allowed directories configured. The client must support MCP Roots, or --read/--write must be provided."`
- This follows the official filesystem server's fail-secure model — deny operations, not allow unrestricted access

## Output Location

### Default: Co-located with Source

When no `outputPath` is provided, the output file is written to the same directory as the source file with an auto-generated filename.

Example: `/projects/my-doc/report.pdf` → `/projects/my-doc/report_20260417_143052.json`

### Explicit: outputPath Parameter

The tool accepts an optional `outputPath` parameter for explicit control over the output location.

| `outputPath` provided? | Behavior |
|---|---|
| No | Write next to source file (same directory, auto-generated filename) |
| Yes | Write to specified path |

Both cases validate against `allowedDirs` — the write destination must be within the roots or CLI-arg boundary. Writes outside the boundary are rejected with a permission error.

## Configuration Changes

### Removed

- `OLLAMA_OCR_OUTPUT_DIR` env var — removed entirely
- `config.outputDir` field
- `config.readDirs` and `config.writeDirs` fields

### Kept

- `OLLAMA_API_KEY` env var (required)
- `OLLAMA_OCR_MODEL` env var (optional, default: `gemini-3-flash-preview`)
- `OLLAMA_OCR_FALLBACK_MODEL` env var (optional)
- `--read` and `--write` CLI args (fallback for non-Roots clients)

### New

- `allowed-dirs.ts` module — mutable state for directory permissions
  - `setAllowedDirs(dirs: string[])` — called from roots discovery or CLI arg fallback
  - `getAllowedDirs(): string[]` — called by tools at invocation time
  - `addAllowedDirs(dirs: string[])` — for `roots/list_changed` notifications (merges)

## Tool Schema Changes

### Updated Schema

```typescript
const ExtractTextInputSchema = z.object({
  filePath: z.string().describe("Absolute path to a PDF or image file"),
  format: z.enum(["json", "markdown", "text"]).optional().default("json"),
  model: z.string().optional(),
  pages: z.string().optional(),
  outputPath: z.string().optional().describe(
    "Absolute path for the output file. Defaults to the source file's directory with an auto-generated filename."
  ),
}).strict();
```

### Tool Description Update

Mention that permissions are derived from the client workspace and that files are written next to the source by default.

### Tool Annotations

Unchanged: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.

## File Changes

### `config.ts`

Simplify to only env vars + model config. Remove `outputDir`, `readDirs`, `writeDirs` fields. Remove `OLLAMA_OCR_OUTPUT_DIR` requirement. Keep `--read`/`--write` parsing but store separately for roots fallback.

### `allowed-dirs.ts` (new)

Mutable state module managing the allowed directories list. Initialized empty, populated by roots discovery or CLI arg fallback.

### `server.ts`

Wire up `oninitialized` handler to call `listRoots()` and populate allowed dirs. Subscribe to `notifications/roots/list_changed` for dynamic updates.

### `path-guard.ts`

Read from `getAllowedDirs()` instead of receiving dirs as function parameters. Update `assertPath()` signature accordingly.

### `output-writer.ts`

`writeOutput()` takes a full output path directly instead of `outputDir` + `filename`. Remove `writeDirs` parameter.

### `extract-text.ts`

Add `outputPath` to schema. Derive output path from source file directory (default) or use explicit `outputPath`. Remove references to `config.outputDir`, `config.readDirs`, `config.writeDirs`. Use `getAllowedDirs()` for permission checks.

## Untouched

- PDF/image processing pipeline (`pdf-renderer.ts`, `image-loader.ts`)
- Ollama client, retry logic, concurrency (`ollama-client.ts`, `retry.ts`, `concurrency.ts`)
- Output formatting (JSON/markdown/text in `output-writer.ts`)
- All existing tool params (`filePath`, `format`, `model`, `pages`)
- Test structure (updated for new APIs)
