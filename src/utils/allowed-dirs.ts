// src/utils/allowed-dirs.ts
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

type PermissionSource = "roots" | "cli-args" | "none";

let readDirs: string[] = [];
let writeDirs: string[] = [];
let source: PermissionSource = "none";

export function setAllowedReadDirs(dirs: string[], from?: PermissionSource): void {
  readDirs = dirs;
  if (from) source = from;
}

export function setAllowedWriteDirs(dirs: string[], from?: PermissionSource): void {
  writeDirs = dirs;
  if (from) source = from;
}

export function getAllowedReadDirs(): string[] {
  return readDirs;
}

export function getAllowedWriteDirs(): string[] {
  return writeDirs;
}

export function getPermissionSource(): PermissionSource {
  return source;
}

export function resetAllowedDirs(): void {
  readDirs = [];
  writeDirs = [];
  source = "none";
}

function isWindowsPath(p: string): boolean {
  return /^[A-Za-z]:\//.test(p);
}

export function parseRootUris(
  roots: Array<{ uri: string; name?: string }>,
): string[] {
  const paths: string[] = [];
  for (const root of roots) {
    if (!root.uri.startsWith("file://")) {
      process.stderr.write(`[WARN] Skipping non-file root URI: ${root.uri}\n`);
      continue;
    }
    const filePath = fileUriToPath(root.uri);
    const resolved = isWindowsPath(filePath) ? filePath : resolve(filePath);
    try {
      paths.push(realpathSync(resolved));
    } catch {
      paths.push(resolved);
    }
  }
  return paths;
}

function fileUriToPath(uri: string): string {
  const path = uri.replace(/^file:\/\//, "");
  if (path.match(/^\/[A-Za-z]:\//)) {
    return path.substring(1);
  }
  return path;
}
