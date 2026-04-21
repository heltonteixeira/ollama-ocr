import { realpathSync } from "node:fs";
import { normalize, sep, resolve } from "node:path";
import { getAllowedReadDirs, getAllowedWriteDirs } from "./allowed-dirs.js";

export function isWithinAllowed(realPath: string, allowedDirs: string[]): boolean {
  const normalizedPath = normalize(realPath);
  return allowedDirs.some(
    (dir) => {
      const normalizedDir = normalize(dir);
      return normalizedPath === normalizedDir || normalizedPath.startsWith(normalizedDir + sep);
    },
  );
}

function formatDeniedMessage(
  label: string,
  resolved: string,
  allowedDirs: string[],
): string {
  return `${label} denied: ${resolved} is outside allowed directories. Allowed: ${allowedDirs.join(", ")}`;
}

export function assertPath(
  rawPath: string,
  allowedDirs: string[],
  label: string,
): string {
  const resolved = resolve(rawPath);

  try {
    const real = realpathSync(resolved);
    if (!isWithinAllowed(real, allowedDirs)) {
      throw new PermissionError(
        formatDeniedMessage(label, resolved, allowedDirs),
      );
    }
    return real;
  } catch (err) {
    if (err instanceof PermissionError) throw err;
    const parent = resolved.substring(0, resolved.lastIndexOf(sep));
    try {
      const realParent = realpathSync(parent);
      const realFull = realParent + resolved.substring(resolved.lastIndexOf(sep));
      if (!isWithinAllowed(realFull, allowedDirs)) {
        throw new PermissionError(
          formatDeniedMessage(label, resolved, allowedDirs),
        );
      }
      return realFull;
    } catch (innerErr) {
      if (innerErr instanceof PermissionError) throw innerErr;
      throw new PermissionError(
        formatDeniedMessage(label, resolved, allowedDirs),
      );
    }
  }
}

export function assertReadPath(rawPath: string): string {
  return assertPath(rawPath, getAllowedReadDirs(), "Read");
}

export function assertWritePath(rawPath: string): string {
  return assertPath(rawPath, getAllowedWriteDirs(), "Write");
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
