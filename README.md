# mcp-ollama-ocr

MCP server that uses Ollama Cloud vision models to extract verbatim text from PDFs and images.

## Setup

### Prerequisites

- Node.js 20+
- An Ollama Cloud API key from [ollama.com/settings/keys](https://ollama.com/settings/keys)

### Install

**Local development:**
```bash
git clone https://github.com/heltonteixeira/ollama-ocr.git && cd ollama-ocr
npm install
npm run build
```

**Global npm install** (after publishing):
```bash
npm install -g @mcpservers/ollama-ocr
```

### Configure with Claude Code

**Local:**
```bash
claude mcp add ollama-ocr \
  -e OLLAMA_API_KEY=your-api-key \
  -e OLLAMA_OCR_MODEL=gemini-3-flash-preview \
  -- node /absolute/path/to/ollama-ocr/dist/index.js
```

**Global:**
```bash
claude mcp add ollama-ocr \
  -e OLLAMA_API_KEY=your-api-key \
  -e OLLAMA_OCR_MODEL=gemini-3-flash-preview \
  -- mcp-ollama-ocr
```

### Configure with Claude Desktop

**Local install:**
```json
{
  "mcpServers": {
    "ollama-ocr": {
      "command": "node",
      "args": ["/absolute/path/to/ollama-ocr/dist/index.js"],
      "env": {
        "OLLAMA_API_KEY": "your-api-key",
        "OLLAMA_OCR_MODEL": "gemini-3-flash-preview",
        "OLLAMA_OCR_FALLBACK_MODEL": "qwen3-vl:235b"
      }
    }
  }
}
```

**Global install:**
```json
{
  "mcpServers": {
    "ollama-ocr": {
      "command": "mcp-ollama-ocr",
      "env": {
        "OLLAMA_API_KEY": "your-api-key",
        "OLLAMA_OCR_MODEL": "gemini-3-flash-preview",
        "OLLAMA_OCR_FALLBACK_MODEL": "qwen3-vl:235b"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OLLAMA_API_KEY` | yes | - | API key from ollama.com |
| `OLLAMA_OCR_MODEL` | no | `gemini-3-flash-preview` | Vision model for extraction |
| `OLLAMA_OCR_FALLBACK_MODEL` | no | - | Fallback model on auth/vision errors |

## File Access Permissions

The server restricts file access to directories provided by the client workspace.

### MCP Roots (automatic)

When connected to a client that supports MCP Roots (Claude Code, Claude Desktop), the server automatically discovers workspace roots and restricts read/write access to those directories. No additional configuration needed.

### CLI Arguments (fallback)

For clients that don't support MCP Roots, use `--read` and `--write` CLI arguments:

```bash
node dist/index.js --read /project/src,/home/user/docs --write /project/output
```

| Argument | Description |
|----------|-------------|
| `--read <dirs>` | Comma-separated directories allowed for reading. Defaults to `--write` dirs if omitted. |
| `--write <dirs>` | Comma-separated directories allowed for writing. |

If neither MCP Roots nor CLI arguments are provided, all file access is denied.

### Checking Permissions

Use the `list_allowed_directories` tool to check which directories the server can access:

```
list_allowed_directories
```

Returns:
```json
{
  "readDirs": ["/home/user/project"],
  "writeDirs": ["/home/user/project"],
  "source": "roots"
}
```

`source` indicates how permissions were configured: `"roots"` (MCP Roots), `"cli-args"`, or `"none"`.

## Tool: `extract-text`

Extracts verbatim text from a PDF or image file and saves structured output to disk.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filePath` | string | yes | - | Absolute path to a PDF or image file |
| `format` | enum | no | `json` | Output format: `json`, `markdown`, or `text` |
| `model` | string | no | env default | Override the default vision model |
| `pages` | string | no | all pages | Page range for PDFs: `"1-5"`, `"1,3,7"`, `"1-3,7,10-12"` |
| `outputPath` | string | no | co-located | Absolute path for the output file |

### Output Location

By default, the output file is written next to the source file with an auto-generated filename. Use `outputPath` to specify a different location — the path must be within an allowed write directory.

### Supported File Types

`.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tiff`, `.tif`

### Response

Returns a processing summary — not the extracted text. Example:

```
Extraction complete.
Source: /path/to/report.pdf
Output: /path/to/report/report_20260412_103000.json
Format: json | Model: gemini-3-flash-preview
Pages: 12 total | 11 successful | 1 failed (page 7)
Characters extracted: 45,230
Processing time: 2m 34s
```

### Output Formats

Files are saved as `{filename}_{YYYYMMDD_HHmmss}.{ext}`.

**JSON** — Structured metadata + per-page results:

```json
{
  "metadata": {
    "source": "/path/to/input.pdf",
    "sourceType": "pdf",
    "model": "gemini-3-flash-preview",
    "totalPages": 12,
    "successfulPages": 11,
    "failedPages": 1,
    "failedPageNumbers": [7],
    "totalCharacters": 45230,
    "processingTimeMs": 154000
  },
  "pages": [
    { "pageNumber": 1, "text": "...", "characterCount": 3780, "status": "success" },
    { "pageNumber": 7, "text": null, "characterCount": 0, "status": "failed", "error": "..." }
  ]
}
```

**Markdown** — Header with metadata, page-separated content with `## Page N of M` headings.

**Text** — Same structure as Markdown but without `##` heading prefixes.

## Development

```bash
npm run build      # Compile TypeScript
npm run start      # Run the server
npm test           # Run test suite (vitest)
npm run typecheck  # Type-check without emitting
```
