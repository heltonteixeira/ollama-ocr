import { describe, it, expect } from "vitest";
import { isWithinAllowed, assertPath, PermissionError } from "../../src/utils/path-guard.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
    // /home/user/project-other should NOT match /home/user/project
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
});

describe("assertPath", () => {
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

describe("PermissionError", () => {
  it("should have the correct name", () => {
    const err = new PermissionError("test");
    expect(err.name).toBe("PermissionError");
    expect(err.message).toBe("test");
  });
});
