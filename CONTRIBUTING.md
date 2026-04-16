# Contributing to @mcpservers/ollama-ocr

Thank you for your interest in contributing to this MCP server! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/heltonteixeira/ollama-ocr.git
   cd ollama-ocr
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting and style
- Run `npm run typecheck` before committing
- Add tests for new features
- Update documentation as needed

## Making Changes

1. Create a new branch for your feature or bugfix
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```

2. Make your changes and test them thoroughly

3. Run tests and type checking
   ```bash
   npm test
   npm run typecheck
   ```

4. Commit your changes with a clear message
   ```bash
   git commit -m "feat: add support for new image format"
   ```

## Submitting Changes

1. Push your branch to your fork
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a pull request to the main branch

3. Wait for review and address any feedback

## Reporting Issues

When reporting bugs or requesting features, please include:

- **Environment**: OS, Node.js version
- **Steps to reproduce**: Clear reproduction steps
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Error messages**: Any error messages or logs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
