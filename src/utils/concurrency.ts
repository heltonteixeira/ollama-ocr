import pLimit from "p-limit";

export function splitBatches<T>(items: T[], batchSize: number = 10): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

export async function processBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number = 3,
): Promise<R[]> {
  const limit = pLimit(concurrency);
  const promises = items.map((item) => limit(() => fn(item)));
  return Promise.all(promises);
}
