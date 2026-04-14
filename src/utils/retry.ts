export interface RetryOptions {
  maxRetries?: number;
  onRetry?: (attempt: number, maxRetries: number, delay: number, error: unknown) => void;
}

const BACKOFF_DELAYS = [1000, 2000, 4000];

function getBackoffDelay(attempt: number): number {
  return BACKOFF_DELAYS[attempt] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1] ?? 4000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < maxRetries) {
        const delay = getBackoffDelay(attempt);
        options?.onRetry?.(attempt + 1, maxRetries, delay, err);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
