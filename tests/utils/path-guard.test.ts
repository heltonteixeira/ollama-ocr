// tests/utils/path-guard.test.ts
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { isWithinAllowed, assertPath, assertReadPath, assertWritePath, PermissionError } from "../../src/utils/path-guard.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setAllowedReadDirs, setAllowedWriteDirs, resetAllowedDirs } from "../../src/utils/allowed-dirs.js";

describe("isWithinAllowed", () => {
  it("should return true for exact match", () => {
    expect(isWithinAllowed("/home/user/project", ["/home/user/project"])).toBe(true);
  });

  it("should return true for a child path", () => {
    expect(isWithinAllowed("/home/user/project/src/file.txt", ["/home/user/project"])).toBe(true);
  });

  it("should return false for a sibling path", () => {
    expect(isWithinAllowed("/home/user/other/file.txt", ["/home/user/project"])).toBe(false);
  });

  it("should return false for a prefix-only match (no trailing sep)", () => {
    expect(isWithinAllowed("/home/user/project-other/file.txt", ["/home/user/project"])).toBe(false);
  });

  it("should match against any dir in the list", () => {
    expect(
      isWithinAllowed("/opt/data/file.txt", ["/home/user/project", "/opt/data"]),
    ).toBe(true);
  });

  it("should return false when list is empty", () => {
    expect(isWithinAllowed("/any/path", [])).toBe(false);
  });

  describe("cross-platform separator handling", () => {
    it("should match child path with mixed separators (allowed=/ realPath=\\)", () => {
      // On Linux, backslash is just a char — only test mixed separators on Windows
      if (process.platform === "win32") {
        expect(isWithinAllowed("C:\\Users\\project\\file.txt", ["C:/Users/project"])).toBe(true);
      } else {
        // On POSIX: forward slashes in both, verify normalize handles trailing/etc
        expect(isWithinAllowed("/home/user/project/file.txt", ["/home/user/project"])).toBe(true);
      }
    });

    it("should match child path with mixed separators (allowed=\\ realPath=/)", () => {
      if (process.platform === "win32") {
        expect(isWithinAllowed("C:/Users/project/file.txt", ["C:\\Users\\project"])).toBe(true);
      } else {
        expect(isWithinAllowed("/home/user/project/file.txt", ["/home/user/project"])).toBe(true);
      }
    });

    it("should match exact path with mixed separators", () => {
      if (process.platform === "win32") {
        expect(isWithinAllowed("C:\\Users\\project", ["C:/Users/project"])).toBe(true);
      } else {
        expect(isWithinAllowed("/home/user/project", ["/home/user/project"])).toBe(true);
      }
    });

    it("should reject sibling with mixed separators (no partial prefix match)", () => {
      if (process.platform === "win32") {
        expect(isWithinAllowed("C:\\Users\\project-other\\file.txt", ["C:/Users/project"])).toBe(false);
      } else {
        expect(isWithinAllowed("/home/user/project-other/file.txt", ["/home/user/project"])).toBe(false);
      }
    });

    it("should match when both have consistent separators", () => {
      if (process.platform === "win32") {
        expect(isWithinAllowed("C:\\Users\\project\\src\\file.txt", ["C:\\Users\\project"])).toBe(true);
      } else {
        expect(isWithinAllowed("/home/user/project/src/file.txt", ["/home/user/project"])).toBe(true);
      }
    });
  });
});

describe("assertPath (with explicit dirs)", () => {
  const tmpBase = process.env.TMPDIR ?? "/tmp";
  const testDir = join(tmpBase, `path-guard-test-${Date.now()}`);
  const allowedDir = join(testDir, "allowed");
  const outsideDir = join(testDir, "outside");

  beforeAll(() => {
    mkdirSync(allowedDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(allowedDir, "file.txt"), "test");
    writeFileSync(join(outsideDir, "secret.txt"), "secret");
  });

  afterAll(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("should return real path when within allowed dirs", () => {
    const filePath = join(allowedDir, "file.txt");
    const result = assertPath(filePath, [allowedDir], "Read");
    expect(result).toContain("file.txt");
  });

  it("should throw PermissionError when outside allowed dirs", () => {
    const filePath = join(outsideDir, "secret.txt");
    expect(() => assertPath(filePath, [allowedDir], "Read")).toThrow(PermissionError);
  });

  it("should include the label in the error message", () => {
    const filePath = join(outsideDir, "secret.txt");
    try {
      assertPath(filePath, [allowedDir], "Write");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionError);
      expect((err as PermissionError).message).toContain("Write denied");
    }
  });
});

describe("assertReadPath", () => {
  beforeEach(() => {
    resetAllowedDirs();
  });

  it("should return real path when within read dirs", () => {
    const tmpBase = process.env.TMPDIR ?? "/tmp";
    const allowedDir = join(tmpBase, `read-test-${Date.now()}`);
    mkdirSync(allowedDir, { recursive: true });
    writeFileSync(join(allowedDir, "file.txt"), "test");

    setAllowedReadDirs([allowedDir]);
    const result = assertReadPath(join(allowedDir, "file.txt"));
    expect(result).toContain("file.txt");

    try { rmSync(allowedDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("should throw PermissionError when outside read dirs", () => {
    setAllowedReadDirs(["/some/allowed/dir"]);
    expect(() => assertReadPath("/outside/dir/file.txt")).toThrow(PermissionError);
  });
});

describe("assertWritePath", () => {
  beforeEach(() => {
    resetAllowedDirs();
  });

  it("should return real path when within write dirs", () => {
    const tmpBase = process.env.TMPDIR ?? "/tmp";
    const allowedDir = join(tmpBase, `write-test-${Date.now()}`);
    mkdirSync(allowedDir, { recursive: true });

    setAllowedWriteDirs([allowedDir]);
    const result = assertWritePath(join(allowedDir, "output.json"));
    expect(result).toContain("output.json");

    try { rmSync(allowedDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("should throw PermissionError when outside write dirs", () => {
    setAllowedWriteDirs(["/some/allowed/dir"]);
    expect(() => assertWritePath("/outside/dir/file.txt")).toThrow(PermissionError);
  });
});

describe("PermissionError", () => {
  it("should have the correct name", () => {
    const err = new PermissionError("test");
    expect(err.name).toBe("PermissionError");
    expect(err.message).toBe("test");
  });

  it("should include allowed directories in assertPath error message", () => {
    const tmpBase = process.env.TMPDIR ?? "/tmp";
    const outsideDir = join(tmpBase, `permission-test-${Date.now()}`);
    mkdirSync(outsideDir, { recursive: true });
    const allowedDirs = ["/home/user/project", "/docs"];

    try {
      assertPath(join(outsideDir, "file.txt"), allowedDirs, "Write");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionError);
      const msg = (err as PermissionError).message;
      expect(msg).toContain("Write denied");
      expect(msg).toContain("/home/user/project");
      expect(msg).toContain("/docs");
      expect(msg).toContain("Allowed:");
    } finally {
      try { rmSync(outsideDir, { recursive: true, force: true }); } catch { /* ok */ }
    }
  });

  it("should include allowed directories in assertReadPath error message", () => {
    resetAllowedDirs();
    setAllowedReadDirs(["/home/user/project"]);

    try {
      assertReadPath("/outside/file.txt");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionError);
      expect((err as PermissionError).message).toContain("/home/user/project");
      expect((err as PermissionError).message).toContain("Allowed:");
    }
  });

  it("should include allowed directories in assertWritePath error message", () => {
    resetAllowedDirs();
    setAllowedWriteDirs(["/home/user/project", "/output"]);

    try {
      assertWritePath("/outside/file.txt");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionError);
      expect((err as PermissionError).message).toContain("/home/user/project");
      expect((err as PermissionError).message).toContain("/output");
      expect((err as PermissionError).message).toContain("Allowed:");
    }
  });
});
