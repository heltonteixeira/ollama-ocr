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
      expect(result).toEqual(["/home/user/project"]);
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
      expect(result).toEqual(["/home/user/project", "/home/user/docs"]);
    });

    it("should handle empty roots array", () => {
      const result = parseRootUris([]);
      expect(result).toEqual([]);
    });

    it("should handle Windows file URIs", () => {
      const result = parseRootUris([
        { uri: "file:///C:/Users/name/project", name: "Win" },
      ]);
      expect(result).toEqual(["C:/Users/name/project"]);
    });
  });
});
