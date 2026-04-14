import { describe, it, expect } from "vitest";
import { splitBatches, processBatch } from "../../src/utils/concurrency.js";

describe("splitBatches", () => {
  it("should split array into batches of default size 10", () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const batches = splitBatches(items);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(10);
    expect(batches[2]).toHaveLength(5);
  });

  it("should split array into custom batch size", () => {
    const items = [1, 2, 3, 4, 5];
    const batches = splitBatches(items, 2);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual([1, 2]);
    expect(batches[1]).toEqual([3, 4]);
    expect(batches[2]).toEqual([5]);
  });

  it("should return single batch if items fit in one batch", () => {
    const items = [1, 2, 3];
    const batches = splitBatches(items, 10);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([1, 2, 3]);
  });

  it("should return empty array for empty input", () => {
    const batches = splitBatches([]);
    expect(batches).toHaveLength(0);
  });
});

describe("processBatch", () => {
  it("should process all items and return results", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await processBatch(items, async (item) => item * 2, 3);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("should respect concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 9 }, (_, i) => i);
    const fn = async (item: number) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrent--;
      return item;
    };

    await processBatch(items, fn, 3);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});
