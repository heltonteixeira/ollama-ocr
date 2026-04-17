// tests/tools/list-allowed-dirs.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setAllowedReadDirs, setAllowedWriteDirs, resetAllowedDirs } from "../../src/utils/allowed-dirs.js";

describe("list_allowed_directories tool", () => {
  beforeEach(() => {
    resetAllowedDirs();
  });

  afterEach(() => {
    resetAllowedDirs();
  });

  it("should return empty dirs when none configured", async () => {
    const { handleListAllowedDirs } = await import("../../src/tools/list-allowed-dirs.js");
    const result = await handleListAllowedDirs({}, {} as never);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.readDirs).toEqual([]);
    expect(parsed.writeDirs).toEqual([]);
    expect(parsed.source).toBe("none");
  });

  it("should return dirs from roots", async () => {
    setAllowedReadDirs(["/project"], "roots");
    setAllowedWriteDirs(["/project"], "roots");

    const { handleListAllowedDirs } = await import("../../src/tools/list-allowed-dirs.js");
    const result = await handleListAllowedDirs({}, {} as never);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.readDirs).toEqual(["/project"]);
    expect(parsed.writeDirs).toEqual(["/project"]);
    expect(parsed.source).toBe("roots");
  });

  it("should return separate read and write dirs from CLI args", async () => {
    setAllowedReadDirs(["/docs"], "cli-args");
    setAllowedWriteDirs(["/output"], "cli-args");

    const { handleListAllowedDirs } = await import("../../src/tools/list-allowed-dirs.js");
    const result = await handleListAllowedDirs({}, {} as never);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.readDirs).toEqual(["/docs"]);
    expect(parsed.writeDirs).toEqual(["/output"]);
    expect(parsed.source).toBe("cli-args");
  });
});
