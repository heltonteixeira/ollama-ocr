import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerExtractTextTool } from "./tools/extract-text.js";
import { setProgressServer } from "./utils/progress.js";

export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "ollama-ocr",
    version: "0.0.1",
  });

  setProgressServer(server);
  registerExtractTextTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}
