# Roots-Based Permission System

Replace hardcoded `OLLAMA_OCR_OUTPUT_DIR` env var with MCP Roots protocol for dynamic directory discovery. CLI args remain as a fallback for non-Roots clients.

## Problem

The server requires `OLLAMA_OCR_OUTPUT_DIR` as a required env var and accepts `--read`/`--write` CLI args for path restrictions. This forces users to hardcode paths at configuration time, making it difficult to use the server across multiple projects — especially with Claude Code, where the workspace changes per session.

## Solution

Use the MCP Roots protocol to dynamically discover the client's workspace directories at runtime. Roots define the allowed read/write boundary. CLI args remain as a fallback for clients that don't support Roots.

## Permission Discovery

### Priority Chain

```
oninitialized
  → check clientCapabilities.roots
    ├── Client supports roots → listRoots()
    │     ├── Success, roots returned → setAllowedReadDirs(roots), setAllowedWriteDirs(roots)
    │     └── Failure (error/timeout) → fall through to CLI args check
    ├── Client does not support roots → check CLI args
    │     ├── --read and/or --write provided → setAllowedReadDirs/WriteDirs from args
    │     └── Neither → deny all file operations
    └── Neither roots nor CLI args → deny all file operations
```

### Roots Protocol Integration

- On `oninitialized`, check `clientCapabilities.roots` before calling `listRoots()`
- Only call `listRoots()` if the client declares roots capability — calling on a non-supporting client returns an error
- Parse `file://` URI roots to filesystem paths (see URI Parsing section)
- Store parsed paths as both allowed read and write directories
- Listen for `notifications/roots/list_changed` to update dynamically — **full replacement**, not merge. If a user removes a folder from their workspace, the server must lose access immediately
- Roots take priority over CLI args when both are present

### Read/Write Permission Separation

The server maintains separate `allowedReadDirs` and `allowedWriteDirs` lists:

- **When populated from Roots**: both lists receive the same values (roots represent the full workspace boundary with no read/write distinction in the protocol)
- **When populated from CLI args**: `--read` and `--write` populate their respective lists independently, preserving the current least-privilege capability (e.g. `--read /docs --write /output`)
- If only `--write` is provided, `--read` defaults to the same directories as `--write` (current behavior)

Rationale: unification would be a security regression. Roots provides a unified workspace, but CLI args allow finer-grained control. Keeping both models correct preserves least-privilege for non-Roots clients.

### URI Parsing

Roots arrive as `file://` URIs. Parsing must handle:

- `file:///absolute/path` → `/absolute/path` (standard POSIX)
- `file:///C:/Users/name/path` → `C:/Users/name/path` (Windows)
- Non-`file://` schemes → skip with warning (log and exclude from allowed dirs)
- Empty or malformed URIs → skip with warning

Implementation follows the reference filesystem server's approach: parse the URI, validate scheme is `file`, extract path component, resolve to real path via `realpathSync`.

### Fallback Behavior

- `--read` and `--write` CLI args are still accepted but only used when Roots is unavailable (e.g. Claude Desktop)
- When neither Roots nor CLI args are configured, the tool returns an error: `"No allowed directories configured. The client must support MCP Roots, or --read/--write must be provided."`
- This follows the official filesystem server's fail-secure model — deny operations, not allow unrestricted access

### Error Handling for listRoots() Failure

If `clientCapabilities.roots` is true but `listRoots()` fails (network error, timeout, malformed response):

1. Log the error to stderr
2. Fall through to CLI args check (same as if client didn't support roots)
3. If CLI args are also absent, deny all operations

This ensures a transient roots failure doesn't leave the server in an unusable state when CLI args are available as backup.

## Discovery Tool

A new read-only tool `list_allowed_directories` allows the client to inspect the current permission state:

```typescript
{
  name: "list_allowed_directories",
  description: "List all directories the server is allowed to read from and write to",
  inputSchema: { type: "object", properties: {} },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  }
}
```

Returns:
```json
{
  "readDirs": ["/projects/my-doc"],
  "writeDirs": ["/projects/my-doc"],
  "source": "roots"
}
```

The `source` field indicates how permissions were derived: `"roots"` or `"cli-args"`.

This follows the pattern used by the reference filesystem server and enables the AI agent to understand the server's access scope.

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

Both cases validate against `allowedWriteDirs` — the write destination must be within the allowed write boundary. Writes outside the boundary are rejected with a permission error.

### Read Validation

Source files must be within `allowedReadDirs`. If the source file is outside the allowed read boundary, the tool returns a permission error.

## Configuration Changes

### Removed

- `OLLAMA_OCR_OUTPUT_DIR` env var — removed entirely
- `config.outputDir` field

### Kept

- `OLLAMA_API_KEY` env var (required)
- `OLLAMA_OCR_MODEL` env var (optional, default: `gemini-3-flash-preview`)
- `OLLAMA_OCR_FALLBACK_MODEL` env var (optional)
- `--read` and `--write` CLI args (fallback for non-Roots clients)
- `config.readDirs` and `config.writeDirs` (populated from CLI args only, used as fallback)

### New

- `allowed-dirs.ts` module — mutable state for directory permissions
  - `setAllowedReadDirs(dirs: string[])` — full replacement of read dirs
  - `setAllowedWriteDirs(dirs: string[])` — full replacement of write dirs
  - `getAllowedReadDirs(): string[]` — called by tools for read validation
  - `getAllowedWriteDirs(): string[]` — called by tools for write validation
  - `getPermissionSource(): "roots" | "cli-args" | "none"` — used by discovery tool

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

### Tool Description

```
Extract verbatim text from a PDF or image file using Ollama Cloud vision models.

The output file is written next to the source file by default. Use outputPath to specify a different location.
File access is restricted to directories provided by the client workspace (MCP Roots) or configured via --read/--write CLI arguments.
Use the list_allowed_directories tool to check which directories are accessible.
```

### Tool Annotations

Unchanged: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.

## File Changes

### `config.ts`

Remove `outputDir` field and `OLLAMA_OCR_OUTPUT_DIR` requirement. Keep `readDirs` and `writeDirs` fields populated from `--read`/`--write` CLI args. These are only used as fallback when roots discovery fails or is unavailable.

### `allowed-dirs.ts` (new)

Mutable state module managing separate read and write directory lists. Initialized empty. Populated by roots discovery (both lists get same values) or CLI arg fallback (lists populated independently). All setters do full replacement, never merge.

### `server.ts`

Wire up `oninitialized` handler: check `clientCapabilities.roots`, call `listRoots()` if supported, populate allowed dirs. Subscribe to `notifications/roots/list_changed` for dynamic updates (full replacement via `setAllowedReadDirs`/`setAllowedWriteDirs`). If roots discovery fails, fall back to CLI args from config. Register `list_allowed_directories` tool.

### `path-guard.ts`

Update `assertPath()` to accept a label and read from `getAllowedReadDirs()` or `getAllowedWriteDirs()` based on the operation context. Remove the `allowedDirs` parameter — the module reads current state internally.

### `output-writer.ts`

`writeOutput()` takes a full output path directly instead of `outputDir` + `filename`. Remove `writeDirs` parameter. Write-path validation happens in `extract-text.ts` using `getAllowedWriteDirs()`.

### `extract-text.ts`

Add `outputPath` to schema. Derive output path from source file directory (default) or use explicit `outputPath`. Validate source against `getAllowedReadDirs()` and output against `getAllowedWriteDirs()`. Remove references to `config.outputDir`. If no allowed dirs are configured, return error immediately.

## Untouched

- PDF/image processing pipeline (`pdf-renderer.ts`, `image-loader.ts`)
- Ollama client, retry logic, concurrency (`ollama-client.ts`, `retry.ts`, `concurrency.ts`)
- Output formatting (JSON/markdown/text in `output-writer.ts`)
- All existing tool params (`filePath`, `format`, `model`, `pages`)
- Test structure (updated for new APIs)
