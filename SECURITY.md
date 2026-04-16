# Security Policy

## Supported Versions

Currently, only the latest version of @mcpservers/ollama-ocr is supported with security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please send an email to: bossying

Please include:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact of the vulnerability
- Any suggested mitigation (if known)

## Response Timeline

- **Initial response**: Within 48 hours
- **Detailed assessment**: Within 7 days
- **Patch release**: As soon as feasible, based on severity

## Security Best Practices

When using this MCP server:

1. **API Key Security**: Never commit Ollama API keys to version control
2. **File Access**: Be mindful of path restrictions and file permissions
3. **Input Validation**: Only process files from trusted sources
4. **Model Selection**: Use models appropriate for your security requirements
5. **Output Directory**: Ensure the output directory has proper access controls

## Dependency Updates

This project uses Dependabot to automatically monitor and update dependencies. Security vulnerabilities in dependencies will be addressed promptly.
