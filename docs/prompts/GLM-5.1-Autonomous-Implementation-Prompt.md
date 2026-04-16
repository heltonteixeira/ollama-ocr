# GLM-5.1 Autonomous Implementation Prompt: MCP Ollama OCR Server

> **Purpose:** This prompt instructs GLM-5.1 to autonomously implement the complete MCP Ollama OCR Server project in a single extended session. It is designed to exploit GLM-5.1's long-horizon capability — the ability to sustain focus, self-validate, and iteratively improve across hundreds of operations over hours of continuous work.

---

## The Prompt

Copy everything between the `---PROMPT START---` and `---PROMPT END---` markers.

---

```
---PROMPT START---

# MISSION

You are an autonomous software engineer operating in long-horizon mode. Your mission is to implement the complete MCP Ollama OCR Server project from scratch, strictly following the specification provided below.

You will work continuously through all phases without stopping for human input. After each phase, you will validate your work against the specification before proceeding. If you detect any deviation, you will correct it immediately and re-validate.

# SPECIFICATION

The complete project specification follows. Every line is a requirement. Nothing is optional. Nothing is suggested. Everything described below MUST be implemented exactly as written.

---

## Objective

Build a Model Context Protocol (MCP) server that uses Ollama Cloud vision models to extract verbatim text from PDFs and images. The server connects to ollama.com (not self-hosted instances) and provides a single tool that handles file ingestion, OCR processing, and output generation.

Target users: Developers using Claude Code, Claude Desktop, or any MCP-compatible client who need OCR capabilities without local model infrastructure.

Core principle: Extract exact text as written. No descriptions, no summaries, no commentary. Treat the vision model as an OCR engine.

---

## Tool: `extract-text`

A single MCP tool that accepts a file path and extraction options, processes the document through an Ollama Cloud vision model, saves structured output to disk, and returns a processing summary.

### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| filePath | string | yes | - | Absolute path to a PDF or image file (PNG, JPG, JPEG, WebP, BMP, TIFF) |
| format | enum | no | "json" | Output format: json, markdown, or text |
| model | string | no | env default | Ollama vision model identifier. Overrides OLLAMA_OCR_MODEL |
| pages | string | no | all pages | Page range for PDFs. Formats: "1-5", "1,3,7", "1-3,7,10-12" |

### Output

A text summary — NOT the extracted content. Example:

Extraction complete.
Source: /path/to/report.pdf
Output: /path/to/output/report_20260412_103000.json
Format: json | Model: gemini-3-flash-preview
Pages: 12 total | 11 successful | 1 failed (page 7)
Characters extracted: 45,230
Processing time: 2m 34s

If all pages fail: return an error with isError: true and a summary of what went wrong.

---

## Configuration

MCP client config passes environment variables via the env block:

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

| Variable | Required | Description |
|----------|----------|-------------|
| OLLAMA_API_KEY | yes | API key from ollama.com/settings/keys |
| OLLAMA_OCR_OUTPUT_DIR | yes | Directory where output files are saved |
| OLLAMA_OCR_MODEL | no | Default vision model (default: "gemini-3-flash-preview"). Overridden by model tool parameter |
| OLLAMA_OCR_FALLBACK_MODEL | no | Model to use if the primary model fails (auth error, vision unsupported). Default: "qwen3-vl:235b" |

OLLAMA_API_KEY and OLLAMA_OCR_OUTPUT_DIR MUST be set. The server logs an error to stderr and exits if either is missing.

Model fallback behavior: If the primary model returns a vision-unsupported error or auth error, the server retries with the fallback model. If no fallback is configured, the error is returned to the client.

---

## Output Formats

### File Naming

{input_filename}_{YYYYMMDD_HHmmss}.{ext}

Example: report_20260412_103000.json

The timestamp uses local time at the moment extraction begins.

### JSON Format

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

For single image files (not PDFs): sourceType is "image", totalPages is 1, and there is one page entry with pageNumber: 1.

### Markdown Format

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
## Page 7 of 12
---

[EXTRACTION FAILED: Failed after 3 retries: API timeout]

### Plain Text Format

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
Page 7 of 12
---

[EXTRACTION FAILED: Failed after 3 retries: API timeout]

The --- separator with page header is the same across both markdown and text, differing only in the ## prefix for markdown.

---

## Processing Pipeline

### 1. Input Validation
- Verify filePath exists and is readable
- Verify file extension is supported (.pdf, .png, .jpg, .jpeg, .webp, .bmp, .tiff, .tif)
- Verify OLLAMA_API_KEY and OLLAMA_OCR_OUTPUT_DIR are set and output dir exists
- Validate pages format if provided
- Return isError: true with a clear message if validation fails

### 2. File Preparation

PDF files:
- Render each page to a PNG image at 150 DPI using pdfjs-dist + @napi-rs/canvas
- If a specific page range is given, only render those pages
- Store rendered images as temporary files in $TMPDIR (Termux-safe)
- Clean up temp files when processing completes (success or failure)

Image files:
- Read the file directly and convert to base64
- Treat as a single-page document

### 3. Page Processing

Batching:
- Pages are split into batches of 10
- Within each batch, up to 3 pages are processed concurrently
- When one batch completes, the next begins

Per-page processing:
1. Send the page image (base64) to the Ollama Cloud chat API
2. Use the OCR user prompt (see OCR Prompting section)
3. Parse the response text
4. On failure: retry up to 3 times with exponential backoff (1s, 2s, 4s)
5. After 3 failed retries: mark page as failed, log the error, continue to next page
6. Record character count of extracted text

Concurrency control: Use a semaphore (limit 3) per batch. Do not exceed 3 in-flight API requests at any time.

### 4. Output Generation
- Build the output structure for the selected format
- Write to OLLAMA_OCR_OUTPUT_DIR/{filename}_{timestamp}.{ext}
- Return the summary text to the MCP client (not the file contents)

### 5. Cleanup
- Delete all temporary rendered images
- Report final results

---

## OCR Prompting

### User Prompt (per page)

No system prompt is used. A single user prompt with explicit format rules:

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

### Model Parameters

| Parameter | Value | Reason |
|-----------|-------|--------|
| temperature | not set | Use model default |
| stream | false | Need full response before processing |

---

## Progress Reporting

Use MCP logging to report progress to the client via stderr:

[INFO] Starting extraction: report.pdf (12 pages, model: gemini-3-flash-preview)
[INFO] Batch 1/2: Processing pages 1-10
[INFO] Page 1/12 complete (3,780 chars)
[WARN] Page 7/12 failed (attempt 1/3): API timeout — retrying in 1s
[WARN] Page 7/12 failed (attempt 3/3): API timeout — skipping
[INFO] Batch 1/2 complete: 9/10 successful
[INFO] Extraction complete: 11/12 pages, 45,230 characters, 2m 34s

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing env vars | Exit with error on startup |
| File not found | Return isError: true |
| Unsupported file type | Return isError: true |
| Single page fails after 3 retries | Mark page as failed, continue processing |
| All pages fail | Return isError: true with summary |
| Ollama API auth error | Try fallback model. Otherwise isError: true |
| Ollama API rate limit | Retry with backoff |
| Model doesn't support vision | Try fallback model. Otherwise isError: true |
| Output dir not writable | Return isError: true |
| PDF rendering fails for a page | Mark page as failed, continue processing |

---

## Project Structure

mcp-ollama-ocr/
├── package.json
├── tsconfig.json
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
│       └── ocr.ts            # User prompt, model params
└── dist/                     # Compiled output

---

## Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Runtime | Node.js 20+ | User preference |
| Language | TypeScript (strict) | Type safety for MCP schemas |
| MCP SDK | @modelcontextprotocol/sdk v2 | Official SDK, stdio transport |
| Schema | zod | Required peer dep of MCP SDK v2 |
| Ollama client | ollama npm package | Official SDK, handles base64 images |
| PDF rendering | pdfjs-dist + @napi-rs/canvas | Pure JS PDF parsing + canvas, ARM/Termux compatible |
| Concurrency | p-limit | Lightweight semaphore |

---

## Code Style

- ESM only ("type": "module" in package.json)
- Strict TypeScript — no any, no non-null assertions without guards
- Functional style — prefer pure functions and composition over classes
- Named exports only — no default exports
- Error types — create specific error classes for validation, API, and processing errors
- Logging — all logging to stderr via MCP logging facility; stdout is reserved for MCP protocol
- No unnecessary abstractions — if something is used once, inline it

---

## Testing Strategy

- Unit tests for: config validation, page range parsing, output formatting, retry logic, batch splitting
- Integration tests for: full pipeline with single test image (mocked API), multi-page PDF (mocked), error scenarios
- Test framework: vitest
- Mocking: vitest built-in mocking

---

## Boundaries

### Always Do
- Use $TMPDIR for all temporary files
- Retry failed pages up to 3 times with backoff before skipping
- Log progress via MCP logging (stderr)
- Clean up temporary files in all cases
- Return summary text, not full content, to the MCP client
- Validate all inputs before starting processing
- Use absolute file paths throughout

### Never Do
- Return extracted text content in the MCP tool response
- Use /tmp/ directly (always $TMPDIR)
- Fail the entire job because one page failed
- Send image descriptions or summaries — only verbatim text
- Use commands/ format for any plugin structure (use skills/ format)
- Hardcode model names — always use env vars or tool parameters
- Process more than 3 pages concurrently at any time
- Store API keys in code or config files — only via environment variables

---

# EXECUTION PROTOCOL

You will execute this project in 6 sequential phases. After completing each phase, you MUST run the validation checkpoint before proceeding to the next phase. If validation fails, you MUST correct the deviation and re-validate before moving forward.

## Phase 1: Project Scaffolding

Actions:
1. Initialize package.json with ESM ("type": "module"), TypeScript strict mode
2. Create tsconfig.json with strict settings, ESM module resolution
3. Install dependencies: @modelcontextprotocol/sdk, zod, ollama, pdfjs-dist, @napi-rs/canvas, p-limit
4. Install dev dependencies: typescript, vitest, @types/node
5. Create the full directory structure as specified in Project Structure
6. Create empty source files with proper module structure

VALIDATION CHECKPOINT 1:
□ package.json has "type": "module"
□ tsconfig.json has "strict": true
□ All directories from Project Structure exist
□ All source files exist (can be empty/stub)
□ Dependencies install without errors
□ `npx tsc --noEmit` passes on empty stubs

## Phase 2: Foundation Layer (utils/)

Implement these files in order:

1. src/utils/config.ts
   - Read and validate OLLAMA_API_KEY, OLLAMA_OCR_OUTPUT_DIR, OLLAMA_OCR_MODEL, OLLAMA_OCR_FALLBACK_MODEL
   - Exit with error to stderr if required vars are missing
   - Export a getConfig function that returns a typed config object

2. src/utils/progress.ts
   - Create structured logger that writes to stderr
   - Functions: info, warn, error with [LEVEL] prefix format
   - Must use MCP logging facility when available

3. src/utils/retry.ts
   - Generic retry with exponential backoff (1s, 2s, 4s delays)
   - Configurable max retries (default 3)
   - Returns last error after exhausting retries

4. src/utils/concurrency.ts
   - Batch splitter: split array into batches of N (default 10)
   - Semaphore using p-limit: process up to 3 items concurrently per batch
   - Process batches sequentially, items within batch concurrently (limit 3)

VALIDATION CHECKPOINT 2:
□ Each file compiles without errors
□ Config validation rejects missing required env vars
□ Progress logger outputs to stderr (not stdout)
□ Retry logic applies correct backoff sequence (1s, 2s, 4s)
□ Concurrency splits correctly and limits to 3 concurrent operations
□ Unit tests pass for: config validation, batch splitting, retry logic

## Phase 3: Service Layer (services/)

Implement these files in order:

1. src/services/image-loader.ts
   - Read image file from disk
   - Convert to base64
   - Validate file extension (.png, .jpg, .jpeg, .webp, .bmp, .tiff, .tif)
   - Return { base64, mimeType } object

2. src/services/pdf-renderer.ts
   - Use pdfjs-dist to parse PDF
   - Use @napi-rs/canvas to render each page at 150 DPI to PNG
   - Parse page range parameter ("1-5", "1,3,7", "1-3,7,10-12")
   - Write rendered pages to $TMPDIR as temp files
   - Return array of { pageNumber, imagePath } objects
   - Clean up temp files on completion or failure

3. src/services/ollama-client.ts
   - Use ollama npm package
   - Send base64 image with OCR user prompt
   - Handle model fallback: if primary model returns vision-unsupported or auth error, retry with fallback
   - Use stream: false, do not set temperature
   - Return extracted text string

4. src/services/output-writer.ts
   - Format extracted pages into JSON, markdown, or text format
   - Generate filename: {input_filename}_{YYYYMMDD_HHmmss}.{ext}
   - Write to OLLAMA_OCR_OUTPUT_DIR
   - Calculate total characters, processing time
   - Return absolute path to output file

VALIDATION CHECKPOINT 3:
□ Each file compiles without errors
□ Image loader handles all supported formats
□ Image loader rejects unsupported formats
□ PDF renderer correctly parses all page range formats
□ PDF renderer uses $TMPDIR (not /tmp/)
□ PDF renderer cleans up temp files
□ Ollama client sends correct prompt (user prompt only, no system prompt)
□ Ollama client does NOT set temperature
□ Ollama client handles fallback model correctly
□ Output writer generates correct JSON structure with metadata and pages
□ Output writer generates correct markdown format with --- separators
□ Output writer generates correct text format
□ File naming follows {name}_{YYYYMMDD_HHmmss}.{ext} pattern
□ Unit tests pass for: output formatting (all 3 formats), page range parsing

## Phase 4: Tool and Server Integration

Implement:

1. src/prompts/ocr.ts
   - Export the OCR user prompt as a constant string
   - Exact prompt text from the OCR Prompting section above
   - Do NOT add a system prompt

2. src/tools/extract-text.ts
   - Register the extract-text MCP tool with zod input schema
   - Implement the full processing pipeline:
     a. Validate inputs (file exists, supported type, env vars set)
     b. Prepare file (render PDF pages OR load image)
     c. Process pages in batches of 10, max 3 concurrent per batch
     d. For each page: call Ollama client with OCR prompt, retry on failure
     e. Generate output file in selected format
     f. Clean up all temp files
     g. Return summary text (NOT extracted content)
   - Track processing time, character counts, success/failure per page
   - Handle all error scenarios from Error Handling table

3. src/server.ts
   - Create McpServer instance
   - Register the extract-text tool
   - Use stdio transport

4. src/index.ts
   - Entry point
   - Bootstrap server
   - Handle startup errors (missing env vars → log to stderr and exit)

VALIDATION CHECKPOINT 4:
□ Full project compiles without errors (npx tsc --noEmit)
□ Tool schema matches the Input Schema table exactly
□ Processing pipeline follows all 5 steps from Processing Pipeline section
□ Concurrency never exceeds 3 in-flight requests
□ Summary output matches the specified format exactly
□ isError: true returned for: file not found, unsupported type, all pages failed
□ Individual page failures do NOT fail the entire job
□ Temp files are cleaned up in ALL code paths (success, failure, partial)
□ MCP server starts and connects via stdio transport
□ Progress logging follows the specified format with [INFO] and [WARN] prefixes

## Phase 5: Testing

Create test files mirroring the source structure:

1. tests/utils/config.test.ts — config validation tests
2. tests/utils/concurrency.test.ts — batch splitting and semaphore tests
3. tests/utils/retry.test.ts — retry with backoff tests
4. tests/services/output-writer.test.ts — output formatting tests for all 3 formats
5. tests/services/image-loader.test.ts — image loading and validation tests
6. tests/services/pdf-renderer.test.ts — page range parsing tests
7. tests/tools/extract-text.test.ts — integration test with mocked Ollama API

VALIDATION CHECKPOINT 5:
□ All tests pass (npx vitest run)
□ Unit tests cover: config validation, page range parsing, output formatting, retry, batching
□ Integration tests cover: full pipeline with mocked API, error scenarios
□ No test uses /tmp/ — all use $TMPDIR
□ Test mocking uses vitest built-in mocking

## Phase 6: Final Verification

Actions:
1. Run full TypeScript compilation: npx tsc — must succeed
2. Run full test suite: npx vitest run — all tests must pass
3. Run lint-level check on every source file
4. Verify no `any` types exist in the codebase
5. Verify no default exports exist
6. Verify all exports are named
7. Verify stdout contains ONLY MCP protocol (no stray console.log)
8. Verify $TMPDIR is used everywhere (no /tmp/ references)
9. Verify the exact OCR prompt text is used (no system prompt, no temperature)
10. Verify the output JSON structure matches the spec exactly (metadata + pages)
11. Verify concurrency is bounded at 3 per batch, batches of 10
12. Verify model fallback logic handles auth errors and vision-unsupported errors

VALIDATION CHECKPOINT 6:
□ TypeScript compiles with zero errors
□ All tests pass
□ No `any` types in codebase (grep for : any, as any)
□ No default exports (grep for export default)
□ No /tmp/ references (grep for /tmp/)
□ No console.log (only stderr logging)
□ OCR prompt matches spec verbatim
□ Output formats match spec examples character-by-character
□ Error handling covers every scenario in the Error Handling table
□ Code style matches all rules in Code Style section

---

# SELF-VALIDATION PROTOCOL

After completing each phase, execute these steps BEFORE proceeding:

## Step 1: Specification Compliance Check

For each file you created or modified in this phase, ask yourself:
- Does this file match the exact path specified in Project Structure?
- Does it export exactly what other files need?
- Does it follow the Code Style rules?
- Does it handle the error cases specified for its responsibility?

## Step 2: Cross-Reference Check

Compare your implementation against the relevant SPEC sections:
- Read the relevant SPEC section
- Read your implementation
- List every requirement in the SPEC section
- Mark each requirement as MET or UNMET
- If UNMET: stop and fix before proceeding

## Step 3: Build Verification

Run these commands and verify they succeed:
1. npx tsc --noEmit — must show zero errors
2. npx vitest run (if tests exist for this phase) — all must pass

## Step 4: Deviation Log

If you find ANY deviation from the SPEC during validation:
1. Log the deviation: what SPEC says vs what you implemented
2. Fix the deviation immediately
3. Re-run the validation from Step 1
4. Do NOT proceed to the next phase until all deviations are resolved

---

# SELF-CORRECTION PROTOCOL

When you detect an error, bug, or SPEC deviation during any phase:

## For Code Errors (type errors, runtime errors, test failures):

1. Read the error message carefully
2. Identify the root cause — do NOT add workarounds or patches
3. Fix the root cause directly
4. Re-run the failing check
5. If it fails again, re-read the SPEC section related to the failing code
6. Re-implement according to the SPEC, not according to what you think should work

## For Specification Deviations:

1. Stop immediately
2. Re-read the relevant SPEC section in full
3. Identify exactly where your implementation diverges
4. Rewrite the divergent code to match the SPEC exactly
5. Re-validate against the SPEC
6. Run all existing tests to ensure the correction didn't break anything

## For Architectural Drift:

If you catch yourself adding abstractions, classes, or patterns NOT specified in the SPEC:

1. Delete the extra code
2. Re-read the Code Style section: "No unnecessary abstractions — if something is used once, inline it"
3. Re-read the Boundaries section
4. Implement the simplest solution that meets the SPEC requirement
5. Validate that the simpler solution passes all tests

---

# CRITICAL REMINDERS

These apply throughout ALL phases. Violate any of these and you must stop and fix immediately:

1. NEVER use /tmp/ — always use $TMPDIR for temporary files
2. NEVER return extracted text content in the MCP tool response — return summary only
3. NEVER set temperature in API calls — use model default
4. NEVER use a system prompt for OCR — user prompt only
5. NEVER process more than 3 pages concurrently
6. NEVER use default exports — named exports only
7. NEVER use `any` type — strict TypeScript
8. NEVER log to stdout — stderr only (stdout is MCP protocol)
9. NEVER fail the entire job because one page failed — mark page failed and continue
10. NEVER hardcode model names — always use env vars or tool parameters
11. NEVER store API keys in code — environment variables only
12. NEVER add features, abstractions, or patterns not specified in the SPEC

---

# BEHAVIORAL DIRECTIVES

You are operating in autonomous long-horizon mode. This means:

1. **Do not stop to ask questions.** The SPEC is your authority. If something seems ambiguous, re-read the SPEC. The SPEC is the source of truth.

2. **Do not skip validation.** After each phase, run the full validation checkpoint. Every checkbox must be checked. This is not optional.

3. **Do not rush.** Each phase builds on the previous one. A mistake in Phase 2 compounds through Phases 3, 4, 5, and 6. Take the time to get each phase right.

4. **Do not improvise.** The SPEC defines the architecture, the tech stack, the code style, the error handling, and the boundaries. Your job is to implement what the SPEC says, not to improve upon it.

5. **Do track your progress.** After completing each file, log what you completed and what remains. This prevents you from losing track during the long session.

6. **Do re-read the SPEC frequently.** Before implementing each file, re-read the SPEC section that describes what that file should do. Before each validation checkpoint, re-read the full SPEC.

7. **Do fix deviations immediately.** The longer a deviation sits, the more code builds on top of it. Fix it now, validate, then proceed.

8. **Do maintain a clean mental model.** You are building a pipeline: validate → prepare → process → output → cleanup. Every piece of code fits into this pipeline. If something doesn't fit, re-read the SPEC.

---

BEGIN NOW. Start with Phase 1. Do not stop until Phase 6 validation passes completely.

---PROMPT END---
```

---

## Design Notes

### Why This Structure Leverages GLM-5.1's Long-Horizon Capabilities

| Prompt Feature | GLM-5.1 Capability Leveraged |
|---|---|
| **6 sequential phases with explicit checkpoints** | Sustained focus over multi-hour sessions — each phase is a self-contained unit that the model can complete without losing the thread |
| **Validation protocol after every phase** | Self-reflection — the model is instructed to analyze its own output against the SPEC before proceeding, mirroring the self-correction behavior demonstrated in GLM-5.1's benchmark tests |
| **Cross-reference check (SPEC vs implementation)** | Alignment maintenance — prevents the drift that most models exhibit in long sessions by forcing periodic re-alignment with the original specification |
| **Deviation log with immediate correction** | Iterative improvement — when the model detects a gap, it fixes it and re-validates, similar to how GLM-5.1 achieved 6 structural breakthroughs by analyzing results and changing approach |
| **Critical reminders section (12 hard rules)** | Anti-drift anchors — concise, repeated constraints prevent the model from gradually relaxing its standards over the long session |
| **Behavioral directives** | Autonomous operation — explicitly tells the model to work without human input, re-read the SPEC when uncertain, and track its own progress |
| **Self-correction protocol for 3 failure modes** | Resilience — code errors, SPEC deviations, and architectural drift each have a distinct diagnosis and repair procedure, preventing the model from applying the wrong fix |
| **SPEC embedded inline** | Context permanence — the model doesn't need to reference an external file; the complete specification is always in context, reducing the risk of misremembering requirements |
| **"BEGIN NOW" with no stop condition until Phase 6** | Long-horizon execution — the model is authorized to run the full 8-hour arc without interruption |

### Key Design Decisions

1. **SPEC is embedded, not referenced.** In a long session, the model's memory of an external file degrades. Embedding ensures every detail remains accessible.

2. **Validation is procedural, not aspirational.** Each checkpoint lists specific, testable conditions (checkboxes), not vague goals. The model can objectively determine pass/fail.

3. **Correction is mandatory before progression.** The prompt enforces that deviations are fixed before moving forward, preventing error compounding.

4. **The 12 critical reminders act as invariant constraints.** These are the rules most likely to be forgotten over a long session. Stating them explicitly in a concentrated list makes them easy to re-scan.

5. **Behavioral directives address common long-session failure modes.** Asking questions, skipping validation, rushing, improvising — these are the behaviors that emerge as context length grows. The directives preempt them.

### Adaptation for Other Models

This prompt structure is portable. To adapt for Claude, GPT, or other models:

- **Claude:** Replace "autonomous long-horizon mode" with "extended agentic mode" and adjust the behavioral directives to match Claude's tendency to ask clarifying questions (override with "the SPEC is your authority").
- **GPT:** Add explicit instructions about maintaining JSON schema precision (GPT models tend to drift on structured output in long sessions).
- **Smaller models:** Reduce to 3-4 phases instead of 6, and simplify the validation protocol to fewer checkpoints.
