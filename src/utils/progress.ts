import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

let serverInstance: McpServer | null = null;

export function setProgressServer(server: McpServer): void {
  serverInstance = server;
}

function formatMessage(level: string, message: string): string {
  return `[${level}] ${message}`;
}

export async function info(message: string): Promise<void> {
  const formatted = formatMessage("INFO", message);
  process.stderr.write(`${formatted}\n`);

  if (serverInstance) {
    await serverInstance.sendLoggingMessage({
      level: "info",
      data: message,
    });
  }
}

export async function warn(message: string): Promise<void> {
  const formatted = formatMessage("WARN", message);
  process.stderr.write(`${formatted}\n`);

  if (serverInstance) {
    await serverInstance.sendLoggingMessage({
      level: "warning",
      data: message,
    });
  }
}

export async function error(message: string): Promise<void> {
  const formatted = formatMessage("ERROR", message);
  process.stderr.write(`${formatted}\n`);

  if (serverInstance) {
    await serverInstance.sendLoggingMessage({
      level: "error",
      data: message,
    });
  }
}
