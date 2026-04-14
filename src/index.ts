import { getConfig } from "./utils/config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  // Validate required config on startup — exits on failure
  getConfig();

  await createServer();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
