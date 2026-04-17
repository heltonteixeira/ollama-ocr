import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerExtractTextTool } from "./tools/extract-text.js";
import { registerListAllowedDirsTool } from "./tools/list-allowed-dirs.js";
import { setAllowedReadDirs, setAllowedWriteDirs, parseRootUris } from "./utils/allowed-dirs.js";
import { getConfig } from "./utils/config.js";
import { setProgressServer } from "./utils/progress.js";

export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "ollama-ocr",
    version: "0.0.1",
  });

  setProgressServer(server);
  registerExtractTextTool(server);
  registerListAllowedDirsTool(server);

  server.server.oninitialized = async () => {
    const clientCapabilities = server.server.getClientCapabilities();

    if (clientCapabilities?.roots) {
      try {
        const response = await server.server.listRoots();
        if (response?.roots && response.roots.length > 0) {
          const dirs = parseRootUris(response.roots);
          setAllowedReadDirs(dirs, "roots");
          setAllowedWriteDirs(dirs, "roots");
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[WARN] listRoots() failed: ${msg} — falling back to CLI args\n`);
      }
    }

    // Fallback: use CLI args from config
    const config = getConfig();
    if (config.readDirs.length > 0 || config.writeDirs.length > 0) {
      setAllowedReadDirs(config.readDirs, "cli-args");
      setAllowedWriteDirs(config.writeDirs, "cli-args");
    }
  };

  server.server.setNotificationHandler(
    RootsListChangedNotificationSchema,
    async () => {
      try {
        const response = await server.server.listRoots();
        if (response?.roots) {
          const dirs = parseRootUris(response.roots);
          setAllowedReadDirs(dirs, "roots");
          setAllowedWriteDirs(dirs, "roots");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[WARN] listRoots() on update failed: ${msg}\n`);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}
