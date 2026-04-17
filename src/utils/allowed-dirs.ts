// src/utils/allowed-dirs.ts
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
