import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export interface Config {
  apiKey: string;
  outputDir: string;
  model: string;
  fallbackModel: string | undefined;
  readDirs: string[];
  writeDirs: string[];
}

const DEFAULT_MODEL = "gemini-3-flash-preview";

function parseDirs(value: string, label: string): string[] {
  return value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      try {
        return realpathSync(resolve(p));
      } catch {
        process.stderr.write(`Error: ${label} directory does not exist: ${resolve(p)}\n`);
        process.exit(1);
      }
    });
}

function parseCliArgs(argv: string[]): { readRaw?: string; writeRaw?: string } {
  let readRaw: string | undefined;
  let writeRaw: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--read" && i + 1 < argv.length) {
      readRaw = argv[++i];
    } else if (arg === "--write" && i + 1 < argv.length) {
      writeRaw = argv[++i];
    }
  }

  return { readRaw, writeRaw };
}

let cachedConfig: Config | undefined;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const apiKey = process.env.OLLAMA_API_KEY;
  const outputDirRaw = process.env.OLLAMA_OCR_OUTPUT_DIR;

  if (!apiKey) {
    process.stderr.write("Error: OLLAMA_API_KEY environment variable is required\n");
    process.exit(1);
  }

  if (!outputDirRaw) {
    process.stderr.write("Error: OLLAMA_OCR_OUTPUT_DIR environment variable is required\n");
    process.exit(1);
  }

  const { readRaw, writeRaw } = parseCliArgs(process.argv);

  let readDirs: string[] = [];
  let writeDirs: string[] = [];

  if (writeRaw) {
    writeDirs = parseDirs(writeRaw, "--write");
  }

  if (readRaw) {
    readDirs = parseDirs(readRaw, "--read");
  } else if (writeDirs.length > 0) {
    readDirs = [...writeDirs];
  }

  let outputDir: string;
  try {
    outputDir = realpathSync(resolve(outputDirRaw));
  } catch {
    process.stderr.write(`Error: OLLAMA_OCR_OUTPUT_DIR does not exist: ${resolve(outputDirRaw)}\n`);
    process.exit(1);
  }

  if (writeDirs.length > 0) {
    const inWriteDir = writeDirs.some(
      (d) => outputDir === d || outputDir.startsWith(d + sep),
    );
    if (!inWriteDir) {
      process.stderr.write(
        `Error: OLLAMA_OCR_OUTPUT_DIR (${outputDir}) is outside --write directories\n`,
      );
      process.exit(1);
    }
  }

  if (readDirs.length === 0 && writeDirs.length === 0) {
    process.stderr.write(
      "[WARN] No --read/--write directories specified — all paths allowed. Use --read and --write to restrict file access.\n",
    );
  }

  cachedConfig = {
    apiKey,
    outputDir,
    model: process.env.OLLAMA_OCR_MODEL ?? DEFAULT_MODEL,
    fallbackModel: process.env.OLLAMA_OCR_FALLBACK_MODEL,
    readDirs,
    writeDirs,
  };

  return cachedConfig;
}
