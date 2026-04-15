import { realpathSync } from "node:fs";
import { sep, resolve } from "node:path";

export function isWithinAllowed(realPath: string, allowedDirs: string[]): boolean {
  return allowedDirs.some(
    (dir) => realPath === dir || realPath.startsWith(dir + sep),
  );
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
        `${label} denied: ${resolved} is outside allowed directories`,
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
          `${label} denied: ${resolved} is outside allowed directories`,
        );
      }
      return realFull;
    } catch (innerErr) {
      if (innerErr instanceof PermissionError) throw innerErr;
      throw new PermissionError(
        `${label} denied: ${resolved} is outside allowed directories`,
      );
    }
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
