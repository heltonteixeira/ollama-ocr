// src/tools/list-allowed-dirs.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { getAllowedReadDirs, getAllowedWriteDirs, getPermissionSource } from "../utils/allowed-dirs.js";

const ListAllowedDirsSchema = z.object({}).strict();

export async function handleListAllowedDirs(
  _args: Record<string, unknown>,
  _extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        readDirs: getAllowedReadDirs(),
        writeDirs: getAllowedWriteDirs(),
        source: getPermissionSource(),
      }, null, 2),
    }],
  };
}

export function registerListAllowedDirsTool(server: McpServer): void {
  server.registerTool(
    "list_allowed_directories",
    {
      description: "List all directories the server is allowed to read from and write to",
      inputSchema: ListAllowedDirsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    handleListAllowedDirs,
  );
}
