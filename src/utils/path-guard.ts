import { realpathSync } from "node:fs";
import { sep, resolve } from "node:path";

/**
 * Check whether a resolved path falls within any of the allowed directory roots.
 * Both the target and the allowed dirs must already be real paths.
 */
export function isWithinAllowed(realPath: string, allowedDirs: string[]): boolean {
  return allowedDirs.some(
    (dir) => realPath === dir || realPath.startsWith(dir + sep),
  );
}

/**
 * Resolve a path to its real (canonical) form and assert it is within one of
 * the allowed directories. If the path doesn't exist yet, resolves the parent
 * and checks the full resolved path lexicographically against allowed dirs.
 * Throws PermissionError if not within scope.
 */
export function assertPath(
  rawPath: string,
  allowedDirs: string[],
  label: string,
): string {
  const resolved = resolve(rawPath);

  // Try real path first (works for existing files/dirs)
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
    // Path doesn't exist yet — resolve parent and check the full path
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
