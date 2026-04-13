# SPEC: MCP Ollama OCR Server

## Objective

Build a Model Context Protocol (MCP) server that uses Ollama Cloud vision models to extract **verbatim text** from PDFs and images. The server connects to `ollama.com` (not self-hosted instances) and provides a single tool that handles file ingestion, OCR processing, and output generation.

**Target users:** Developers using Claude Code, Claude Desktop, or any MCP-compatible client who need OCR capabilities without local model infrastructure.

**Core principle:** Extract exact text as written. No descriptions, no summaries, no commentary. Treat the vision model as an OCR engine.

---

## Tool

### `extract-text`

A single MCP tool that accepts a file path and extraction options, processes the document through an Ollama Cloud vision model, saves structured output to disk, and returns a processing summary.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filePath` | string | yes | - | Absolute path to a PDF or image file (PNG, JPG, JPEG, WebP, BMP, TIFF) |
| `format` | enum | no | `"json"` | Output format: `json`, `markdown`, or `text` |
| `model` | string | no | env default | Ollama vision model identifier. Overrides `OLLAMA_OCR_MODEL` |
| `pages` | string | no | all pages | Page range for PDFs. Formats: `"1-5"`, `"1,3,7"`, `"1-3,7,10-12"` |

#### Output (returned to MCP client)

A text summary — **not the extracted content**. Example:

```
Extraction complete.
Source: /path/to/report.pdf
Output: /path/to/output/report_20260412_103000.json
Format: json | Model: gemini-3-flash-preview
Pages: 12 total | 11 successful | 1 failed (page 7)
Characters extracted: 45,230
Processing time: 2m 34s
```

If all pages fail: return an error with `isError: true` and a summary of what went wrong.

---

## Configuration

MCP client config passes environment variables via the `env` block:

```json
{
  "mcpServers": {
    "ollama-ocr": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-ollama-ocr/dist/index.js"],
      "env": {
        "OLLAMA_API_KEY": "your-api-key",
        "OLLAMA_OCR_OUTPUT_DIR": "/path/to/output/directory",
        "OLLAMA_OCR_MODEL": "gemini-3-flash-preview",
        "OLLAMA_OCR_FALLBACK_MODEL": "qwen3-vl:235b"
      }
    }
  }
}
```

| Variable | Required | Description |
|----------|----------|-------------|
| `OLLAMA_API_KEY` | yes | API key from `ollama.com/settings/keys` |
| `OLLAMA_OCR_OUTPUT_DIR` | yes | Directory where output files are saved |
| `OLLAMA_OCR_MODEL` | no | Default vision model (default: `"gemini-3-flash-preview"`). Overridden by `model` tool parameter |
| `OLLAMA_OCR_FALLBACK_MODEL` | no | Model to use if the primary model fails (auth error, vision unsupported). Default: `"qwen3-vl:235b"` |

`OLLAMA_API_KEY` and `OLLAMA_OCR_OUTPUT_DIR` MUST be set. The server logs an error to stderr and exits if either is missing.

**Model fallback behavior**: If the primary model returns a vision-unsupported error or auth error, the server retries with the fallback model. If no fallback is configured, the error is returned to the client.

---

## Output Formats

### File Naming

`{input_filename}_{YYYYMMDD_HHmmss}.{ext}`

Example: `report_20260412_103000.json`

The timestamp uses local time at the moment extraction begins.

### JSON Format

```json
{
  "metadata": {
    "source": "/absolute/path/to/input.pdf",
    "sourceType": "pdf",
    "model": "gemini-3-flash-preview",
    "format": "json",
    "extractedAt": "2026-04-12T10:30:00.000Z",
    "totalPages": 12,
    "successfulPages": 11,
    "failedPages": 1,
    "failedPageNumbers": [7],
    "totalCharacters": 45230,
    "processingTimeMs": 154000
  },
  "pages": [
    {
      "pageNumber": 1,
      "text": "Extracted verbatim text content...",
      "characterCount": 3780,
      "status": "success"
    },
    {
      "pageNumber": 7,
      "text": null,
      "characterCount": 0,
      "status": "failed",
      "error": "Failed after 3 retries: API timeout"
    }
  ]
}
```

For single image files (not PDFs): `sourceType` is `"image"`, `totalPages` is `1`, and there is one page entry with `pageNumber: 1`.

### Markdown Format

```markdown
# OCR Extraction: report.pdf

**Source:** `/path/to/report.pdf`
**Model:** gemini-3-flash-preview
**Extracted:** 2026-04-12T10:30:00.000Z
**Pages:** 12 total, 11 successful, 1 failed (page 7)
**Characters:** 45,230

---
## Page 1 of 12
---

Extracted text content here...

---
## Page 2 of 12
---

More extracted text...

---
## Page 7 of 12
---

[EXTRACTION FAILED: Failed after 3 retries: API timeout]

---
## Page 8 of 12
---

Continuing text...
```

### Plain Text Format

```
OCR Extraction: report.pdf
=============================
Source: /path/to/report.pdf
Model: gemini-3-flash-preview
Extracted: 2026-04-12T10:30:00.000Z
Pages: 12 total, 11 successful, 1 failed (page 7)
Characters: 45,230

---
Page 1 of 12
---

Extracted text content here...

---
Page 2 of 12
---

More extracted text...

---
Page 7 of 12
---

[EXTRACTION FAILED: Failed after 3 retries: API timeout]
```

The `---` separator with page header is the same across both markdown and text, differing only in the `##` prefix for markdown.

---

## Processing Pipeline

### 1. Input Validation

- Verify `filePath` exists and is readable
- Verify file extension is supported (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tiff`, `.tif`)
- Verify `OLLAMA_API_KEY` and `OLLAMA_OCR_OUTPUT_DIR` are set and output dir exists
- Validate `pages` format if provided
- Return `isError: true` with a clear message if validation fails

### 2. File Preparation

**PDF files:**
- Render each page to a PNG image at 150 DPI (optimal for OCR quality and API cost) using `pdfjs-dist` + `@napi-rs/canvas`
- If a specific page range is given, only render those pages
- Store rendered images as temporary files in `$TMPDIR` (Termux-safe)
- Clean up temp files when processing completes (success or failure)

**Image files:**
- Read the file directly and convert to base64
- Treat as a single-page document

### 3. Page Processing

**Batching:**
- Pages are split into batches of 10
- Within each batch, up to 3 pages are processed concurrently
- When one batch completes, the next begins

**Per-page processing:**
1. Send the page image (base64) to the Ollama Cloud chat API
2. Use the OCR system prompt and user prompt (see below)
3. Parse the response text
4. On failure: retry up to 3 times with exponential backoff (1s, 2s, 4s)
5. After 3 failed retries: mark page as failed, log the error, continue to next page
6. Record character count of extracted text

**Concurrency control:** Use a semaphore (limit 3) per batch. Do not exceed 3 in-flight API requests at any time.

### 4. Output Generation

- Build the output structure for the selected format
- Write to `OLLAMA_OCR_OUTPUT_DIR/{filename}_{timestamp}.{ext}`
- Return the summary text to the MCP client (not the file contents)

### 5. Cleanup

- Delete all temporary rendered images
- Report final results

---

## OCR Prompting

### User Prompt (per page)

No system prompt is used. A single user prompt with explicit format rules:

```
Transcribe this document page verbatim. Use the following format rules:
- Headings and titles: Markdown (# ## ###)
- Body text and paragraphs: Plain text with blank line separators
- Tables: HTML table syntax with proper cells
- Mathematical formulas: LaTeX notation
- Lists: Markdown bullet or numbered list syntax
- Form fields: "Label: Value" format
- Images/figures: [FIGURE: brief description]

Do not add any commentary, analysis, or text not present in the original.
Do not skip or summarize any content.
```

### Model Parameters

| Parameter | Value | Reason |
|-----------|-------|--------|
| `temperature` | not set | Use model default. Benchmark data shows fixed low temperatures degrade similarity by ~18% with only marginal recall improvement |
| `stream` | false | We need the full response before processing |

### Prompt Design Reference

The active prompt follows a **format-rules** structure proven in benchmark testing (April 2026). This section documents the design so variations can be created for specific layouts.

**Structure**:
```
1. Task instruction   → "Transcribe this document page verbatim."
2. Format rules       → One rule per content type (headings, tables, formulas, etc.)
3. Negative constraints → "Do not add..." / "Do not skip..."
```

**What works (benchmark-validated)**:
- Single user prompt, no system prompt — the Ollama SDK places task instructions best in the user message
- Explicit format rules per content type — models produce consistent, parseable output
- Negative constraints ("do not add commentary") — suppresses hallucination and meta-text
- Short, directive language — brevity beats verbosity ("OCR" alone scores 99.1% accuracy)

**What doesn't work**:
- Verbose system prompts with many rules — the current SPEC's old 7-rule system prompt ranked #7 out of 8 tested prompts
- Temperature forced low (0 or 0.01) — degrades quality by ~18% vs model default
- Uncertainty markers ("write [illegible]") — increased hallucination rate from 0.3% to 8.3%
- Self-verification steps ("review your extraction") — doubles token cost with no quality improvement on capable models

**Creating layout-specific variations**:
When a document type needs different formatting rules, keep the same structure but adjust the format rules list. Examples:

For **financial tables**:
```
Transcribe this document page verbatim. Use the following format rules:
- Table headers: Bold markdown row
- Numeric columns: Right-aligned with consistent decimal places
- Currency: Include currency symbol as shown
- Totals rows: Bold values
- Footnotes: Superscript markers [1], [2], etc.

Do not add any commentary, calculations, or text not present in the original.
Do not skip or summarize any content.
```

For **forms and questionnaires**:
```
Transcribe this document page verbatim. Use the following format rules:
- Form fields: "Label: Value" format (use [EMPTY] for blank fields)
- Checkboxes: [X] checked, [ ] unchecked
- Signatures: [SIGNATURE]
- Stamps and seals: [STAMP: description]

Do not add any commentary, analysis, or text not present in the original.
Do not skip or summarize any content.
```

**Benchmark context**: Tested 8 prompt variants across 5 models on 2 document types (April 2026). The format-rules prompt (P5) achieved CER 0.004 (99.6% accuracy) on the top 3 models, outperforming the previous SPEC prompt (P8) which scored CER 0.005–0.037 depending on model. Full results: `benchmarks/evaluation/report-p2.md`

---

## Progress Reporting

Use MCP logging to report progress to the client via stderr:

```
[INFO] Starting extraction: report.pdf (12 pages, model: gemini-3-flash-preview)
[INFO] Batch 1/2: Processing pages 1-10
[INFO] Page 1/12 complete (3,780 chars)
[INFO] Page 3/12 complete (2,450 chars)
[INFO] Page 2/12 complete (4,120 chars)
[WARN] Page 7/12 failed (attempt 1/3): API timeout — retrying in 1s
[WARN] Page 7/12 failed (attempt 2/3): API timeout — retrying in 2s
[WARN] Page 7/12 failed (attempt 3/3): API timeout — skipping
[INFO] Batch 1/2 complete: 9/10 successful
[INFO] Batch 2/2: Processing pages 11-12
[INFO] Page 11/12 complete (1,890 chars)
[INFO] Page 12/12 complete (3,200 chars)
[INFO] Batch 2/2 complete: 2/2 successful
[INFO] Extraction complete: 11/12 pages, 45,230 characters, 2m 34s
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing env vars | Exit with error on startup |
| File not found | Return `isError: true` with message |
| Unsupported file type | Return `isError: true` with message |
| Single page fails after 3 retries | Mark page as failed, continue processing |
| All pages fail | Return `isError: true` with summary of failures |
| Ollama API auth error | Try fallback model if configured. Otherwise return `isError: true` |
| Ollama API rate limit | Retry with backoff (treated like other API errors) |
| Model doesn't support vision | Try fallback model if configured. Otherwise return `isError: true` |
| Output dir not writable | Return `isError: true` with message |
| PDF rendering fails for a page | Mark page as failed, continue processing |

---

## Project Structure

```
mcp-ollama-ocr/
├── package.json
├── tsconfig.json
├── SPEC.md
├── src/
│   ├── index.ts              # Entry point: bootstrap and connect
│   ├── server.ts             # McpServer creation and tool registration
│   ├── tools/
│   │   └── extract-text.ts   # extract-text tool handler
│   ├── services/
│   │   ├── ollama-client.ts  # Ollama API wrapper (chat with vision)
│   │   ├── pdf-renderer.ts   # PDF to image conversion
│   │   ├── image-loader.ts   # Read image files, convert to base64
│   │   └── output-writer.ts  # Format and write output files
│   ├── utils/
│   │   ├── config.ts         # Read and validate env config
│   │   ├── concurrency.ts    # Batch splitter + semaphore
│   │   ├── retry.ts          # Retry with exponential backoff
│   │   └── progress.ts       # Structured progress logger
│   └── prompts/
│       └── ocr.ts            # System and user prompts, model params
└── dist/                     # Compiled output
```

---

## Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Runtime | Node.js 20+ | User preference |
| Language | TypeScript (strict) | Type safety for MCP schemas |
| MCP SDK | `@modelcontextprotocol/server` v2 | Official SDK, stdio transport |
| Schema | `zod` | Required peer dep of MCP SDK v2 |
| Ollama client | `ollama` npm package | Official SDK, handles base64 images |
| PDF rendering | `pdfjs-dist` + `@napi-rs/canvas` | Pure JS PDF parsing + canvas rendering, ARM/Termux compatible |
| Concurrency | `p-limit` | Lightweight semaphore for controlling concurrent API calls |

---

## Code Style

- **ESM only** (`"type": "module"` in package.json)
- **Strict TypeScript** — no `any`, no non-null assertions without guards
- **Functional style** — prefer pure functions and composition over classes
- **Named exports only** — no default exports
- **Error types** — create specific error classes for validation, API, and processing errors
- **Logging** — all logging to stderr via MCP logging facility; stdout is reserved for MCP protocol
- **No unnecessary abstractions** — if something is used once, inline it

---

## Testing Strategy

- **Unit tests** for:
  - Config validation (missing env vars, invalid values)
  - Page range parsing
  - Output formatting (JSON, markdown, text)
  - Retry logic (mock failures)
  - Batch splitting
- **Integration tests** for:
  - Full pipeline with a single test image (mocked Ollama API)
  - Multi-page PDF with mocked API responses
  - Error scenarios (API failure, file not found)
- **Manual testing** via MCP Inspector (`npx @modelcontextprotocol/inspector`)
- Test framework: `vitest`
- Mocking: `vitest` built-in mocking

---

## Boundaries

### Always Do

- Use `$TMPDIR` for all temporary files (Termux compatibility)
- Retry failed pages up to 3 times with backoff before skipping
- Log progress via MCP logging (stderr)
- Clean up temporary files in all cases (success, failure, partial)
- Return summary text, not full content, to the MCP client
- Validate all inputs before starting processing
- Use absolute file paths throughout

### Ask First About

- Adding support for URL inputs (currently file paths only)
- Adding batch file processing (multiple files in one call)
- Adding a `list-models` tool or similar
- Creating layout-specific prompt variations beyond the default format-rules prompt

### Never Do

- Return extracted text content in the MCP tool response
- Use `/tmp/` directly (always `$TMPDIR`)
- Fail the entire job because one page failed
- Send image descriptions or summaries — only verbatim text
- Use `commands/` format for any plugin structure (use `skills/` format)
- Hardcode model names — always use env vars or tool parameters
- Process more than 3 pages concurrently at any time
- Store API keys in code or config files — only via environment variables
