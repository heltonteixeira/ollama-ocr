// tests/utils/allowed-dirs.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  setAllowedReadDirs,
  setAllowedWriteDirs,
  getAllowedReadDirs,
  getAllowedWriteDirs,
  getPermissionSource,
  resetAllowedDirs,
  parseRootUris,
} from "../../src/utils/allowed-dirs.js";

describe("allowed-dirs", () => {
  beforeEach(() => {
    resetAllowedDirs();
  });

  describe("setAllowedReadDirs / getAllowedReadDirs", () => {
    it("should set and return read dirs", () => {
      setAllowedReadDirs(["/home/user/project"]);
      expect(getAllowedReadDirs()).toEqual(["/home/user/project"]);
    });

    it("should replace (not merge) on subsequent calls", () => {
      setAllowedReadDirs(["/first"]);
      setAllowedReadDirs(["/second"]);
      expect(getAllowedReadDirs()).toEqual(["/second"]);
    });

    it("should return empty array when not set", () => {
      expect(getAllowedReadDirs()).toEqual([]);
    });
  });

  describe("setAllowedWriteDirs / getAllowedWriteDirs", () => {
    it("should set and return write dirs", () => {
      setAllowedWriteDirs(["/home/user/output"]);
      expect(getAllowedWriteDirs()).toEqual(["/home/user/output"]);
    });

    it("should replace (not merge) on subsequent calls", () => {
      setAllowedWriteDirs(["/first"]);
      setAllowedWriteDirs(["/second", "/third"]);
      expect(getAllowedWriteDirs()).toEqual(["/second", "/third"]);
    });

    it("should return empty array when not set", () => {
      expect(getAllowedWriteDirs()).toEqual([]);
    });
  });

  describe("getPermissionSource", () => {
    it("should return 'none' when no dirs are set", () => {
      expect(getPermissionSource()).toBe("none");
    });

    it("should return 'roots' when dirs were set from roots", () => {
      setAllowedReadDirs(["/project"], "roots");
      setAllowedWriteDirs(["/project"], "roots");
      expect(getPermissionSource()).toBe("roots");
    });

    it("should return 'cli-args' when dirs were set from CLI args", () => {
      setAllowedReadDirs(["/docs"], "cli-args");
      setAllowedWriteDirs(["/output"], "cli-args");
      expect(getPermissionSource()).toBe("cli-args");
    });
  });

  describe("resetAllowedDirs", () => {
    it("should clear all state", () => {
      setAllowedReadDirs(["/project"], "roots");
      setAllowedWriteDirs(["/project"], "roots");
      resetAllowedDirs();
      expect(getAllowedReadDirs()).toEqual([]);
      expect(getAllowedWriteDirs()).toEqual([]);
      expect(getPermissionSource()).toBe("none");
    });
  });

  describe("parseRootUris", () => {
    it("should parse file:// URIs to filesystem paths", () => {
      const result = parseRootUris([
        { uri: "file:///home/user/project", name: "Project" },
      ]);
      expect(result).toHaveLength(1);
      // On Windows, resolve() prepends the drive letter
      const normalized = result[0].replace(/\\/g, "/");
      if (process.platform === "win32") {
        expect(normalized).toMatch(/^[A-Za-z]:\/home\/user\/project$/);
      } else {
        expect(normalized).toBe("/home/user/project");
      }
    });

    it("should skip non-file URIs", () => {
      const result = parseRootUris([
        { uri: "https://example.com", name: "Remote" },
      ]);
      expect(result).toEqual([]);
    });

    it("should handle multiple roots", () => {
      const result = parseRootUris([
        { uri: "file:///home/user/project", name: "Project" },
        { uri: "file:///home/user/docs", name: "Docs" },
      ]);
      expect(result).toHaveLength(2);
      const normalizePath = (p: string) => p.replace(/\\/g, "/");
      if (process.platform === "win32") {
        expect(normalizePath(result[0])).toMatch(/^[A-Za-z]:\/home\/user\/project$/);
        expect(normalizePath(result[1])).toMatch(/^[A-Za-z]:\/home\/user\/docs$/);
      } else {
        expect(normalizePath(result[0])).toBe("/home/user/project");
        expect(normalizePath(result[1])).toBe("/home/user/docs");
      }
    });

    it("should handle empty roots array", () => {
      const result = parseRootUris([]);
      expect(result).toEqual([]);
    });

    it("should handle Windows file URIs", () => {
      const result = parseRootUris([
        { uri: "file:///C:/Users/name/project", name: "Win" },
      ]);
      // normalize(resolve()) produces platform-native separators
      expect(result).toHaveLength(1);
      expect(result[0].replace(/\\/g, "/")).toBe("C:/Users/name/project");
    });
  });
});
