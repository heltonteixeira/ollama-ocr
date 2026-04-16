# Project Instructions for Claude

This file contains specific instructions and guidelines for Claude Code when working on this project.

## Commit Message Format

**CRITICAL**: This project uses `standard-version` for automated changelog generation. ALL commits MUST follow the conventional commit format:

```
<type>: <description>

[optional body]

[optional footer]
```

### Commit Types

- **feat**: New feature (triggers minor version bump)
- **fix**: Bug fix (triggers patch version bump)  
- **perf**: Performance improvement
- **docs**: Documentation changes only
- **chore**: Build process, dependencies, tooling updates
- **refactor**: Code refactoring (doesn't change functionality)
- **test**: Adding or updating tests
- **style**: Code style changes (formatting, etc.)

### Commit Examples

✅ **Good commits:**
```bash
feat: add support for WebP image format
fix: resolve PDF page parsing error for encrypted documents
perf: optimize concurrent page processing for large PDFs
docs: update installation instructions with global npm option
chore: upgrade typescript to v5.8
refactor: extract error handling into utility functions
test: add unit tests for path validation logic
```

❌ **Bad commits:**
```bash
update stuff
fix bug
added webp support
changes to readme
```

### Breaking Changes

For breaking changes, add `BREAKING CHANGE:` in the footer:
```bash
feat: redesign configuration file format

BREAKING CHANGE: The configuration file format has changed from JSON to YAML. 
Users will need to migrate their existing configs.
```

## Development Workflow

### Before Making Changes
1. Read the relevant documentation (README.md, SPEC.md if available)
2. Check existing code patterns in the codebase
3. Consider test coverage for new features

### Making Changes
1. Create the implementation
2. Add/update tests as needed
3. Run `npm run typecheck` to verify type safety
4. Run `npm test` to ensure tests pass
5. Update documentation if behavior changes

### Committing Changes
1. Stage files with `git add`
2. Commit with proper conventional format
3. Use descriptive commit messages that explain WHY, not just WHAT

### Release Process
- Use `npm run release` to automate version bumping and changelog
- The system will automatically determine version based on commit types
- Tags are created automatically

## Code Style Guidelines

### TypeScript
- Use strict TypeScript checking (already enabled in tsconfig.json)
- Prefer explicit type annotations over type inference
- Use interfaces for public API shapes, types for internal use
- Avoid `any` type - use `unknown` when type is truly unknown

### Error Handling
- Use proper error classes and error codes
- Include helpful error messages that explain the issue
- Log errors appropriately for debugging
- Consider user-facing vs. developer-facing errors

### Testing
- Write tests for new functionality
- Test edge cases and error conditions
- Use descriptive test names that explain what is being tested
- Keep tests focused and independent

## Project-Specific Notes

### MCP Server Requirements
- This is an MCP server - maintain compatibility with MCP SDK
- Don't break existing tool interfaces
- Consider backward compatibility when making changes
- Test with both Claude Desktop and Claude Code if possible

### Ollama Integration  
- The project integrates with Ollama Cloud API
- Handle API errors gracefully
- Implement proper fallback behavior
- Respect rate limits and API constraints

### Path Security
- Path restrictions are a key security feature
- Never bypass path validation logic
- Test path handling on different operating systems
- Consider symbolic links and edge cases

## When in Doubt

- Follow existing patterns in the codebase
- Ask for clarification if requirements are unclear
- Prefer simplicity over complexity
- Document non-obvious decisions
- Consider maintainability for future contributors
