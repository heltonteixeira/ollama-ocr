export const OCR_USER_PROMPT = `Transcribe this document page verbatim. Use the following format rules:
- Headings and titles: Markdown (# ## ###)
- Body text and paragraphs: Plain text with blank line separators
- Tables: HTML table syntax with proper cells
- Mathematical formulas: LaTeX notation
- Lists: Markdown bullet or numbered list syntax
- Form fields: "Label: Value" format
- Images/figures: [FIGURE: brief description]

Do not add any commentary, analysis, or text not present in the original.
Do not skip or summarize any content.`;
