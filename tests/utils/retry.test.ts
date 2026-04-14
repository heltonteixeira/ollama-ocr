import { describe, it, expect, vi } from "vitest";
import { retry } from "../../src/utils/retry.js";

describe("retry", () => {
  it("should return the result on first success", async () => {
    const result = await retry(() => Promise.resolve("success"));
    expect(result).toBe("success");
  });

  it("should retry on failure and eventually succeed", async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts < 3) throw new Error("fail");
      return Promise.resolve("success");
    };

    const result = await retry(fn, { maxRetries: 3 });
    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("should throw last error after exhausting retries", async () => {
    const fn = () => Promise.reject(new Error("persistent failure"));

    await expect(retry(fn, { maxRetries: 1 })).rejects.toThrow("persistent failure");
  });

  it("should call onRetry callback with correct parameters", async () => {
    const onRetry = vi.fn();
    let attempts = 0;

    const fn = () => {
      attempts++;
      if (attempts < 2) throw new Error("fail");
      return Promise.resolve("ok");
    };

    await retry(fn, { maxRetries: 2, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, 2, 1000, expect.any(Error));
  });

  it("should apply exponential backoff sequence (1s, 2s, 4s)", async () => {
    const delays: number[] = [];
    let attempts = 0;

    const fn = () => {
      attempts++;
      throw new Error("fail");
    };

    const onRetry = (_attempt: number, _max: number, delay: number) => {
      delays.push(delay);
    };

    await expect(retry(fn, { maxRetries: 3, onRetry })).rejects.toThrow("fail");
    expect(delays).toEqual([1000, 2000, 4000]);
  }, 15000);
});
