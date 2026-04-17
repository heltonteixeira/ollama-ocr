# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.2](https://github.com/heltonteixeira/ollama-ocr/compare/v0.0.1...v0.0.2) (2026-04-17)


### Bug Fixes

* add strict validation and tool annotations to extract-text tool ([#4](https://github.com/heltonteixeira/ollama-ocr/issues/4)) ([d6ceb67](https://github.com/heltonteixeira/ollama-ocr/commit/d6ceb67b3ff2f0c47f8b445e7b129513fcf1fd66))
* configure git user in release workflow ([b44249d](https://github.com/heltonteixeira/ollama-ocr/commit/b44249d0c40e8d75b0461e3306e1d68fb080a64c))
* remove non-existent labels from dependabot config ([42e93aa](https://github.com/heltonteixeira/ollama-ocr/commit/42e93aa82abcbc4aa2f1b7147b92bfab4cadcc5b))
* remove unsupported line-length rule from commitlint config ([71ca8b7](https://github.com/heltonteixeira/ollama-ocr/commit/71ca8b7956b5111223e38dbf793256d686ad02d7))
* replace Termux-specific temp paths with cross-platform /tmp ([bbab06d](https://github.com/heltonteixeira/ollama-ocr/commit/bbab06d78457fb810a774785cddeffba88ceb3e8))


### Build

* remove test file ([4da21b9](https://github.com/heltonteixeira/ollama-ocr/commit/4da21b92ab1f509236c821e7b425d5eb50a60404))
* upgrade all dependencies from Dependabot PR[#1](https://github.com/heltonteixeira/ollama-ocr/issues/1) ([59691d0](https://github.com/heltonteixeira/ollama-ocr/commit/59691d05a90259d381bcfc7077c793352a230d9a))

### 0.0.1 (2026-04-16)


### Features

* implement MCP OCR server with Ollama integration ([cb7fa4c](https://github.com/heltonteixeira/ollama-ocr/commit/cb7fa4c1f64f6c9950e8e9b5c88442c8ee3f4527))


### Build

* add standard-version for automated releases ([4bdece0](https://github.com/heltonteixeira/ollama-ocr/commit/4bdece08a50d9f327c486dc1a6e355f61ee5d0ef))

## [0.0.1] - 2025-04-13

### Added
- Initial release
- Basic OCR functionality with Ollama Cloud API integration
- Support for PDF, PNG, JPG, JPEG, WebP, BMP, TIFF, TIF formats
- Model selection and fallback capabilities
- Path restriction CLI arguments
- Structured output with metadata
