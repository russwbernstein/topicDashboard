export interface ProgressCallback {
  (completed: number, total: number): void;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R | null | undefined>,
  onProgress?: ProgressCallback,
) {
  const results: R[] = [];
  let nextIndex = 0;
  let completed = 0;
  const total = items.length;
  const workerCount = Math.min(Math.max(1, concurrency), total);

  async function runWorker() {
    while (nextIndex < total) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        const result = await worker(items[currentIndex], currentIndex);
        if (result !== null && result !== undefined) {
          results.push(result);
        }
      } finally {
        completed += 1;
        onProgress?.(completed, total);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}
