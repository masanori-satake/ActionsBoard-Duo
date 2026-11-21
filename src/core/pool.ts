/**
 * Bounded-concurrency mapping: run an async function over a list with
 * at most `limit` invocations in flight, preserving input order in the
 * results. Used by build polling so a long watch list does not fetch
 * strictly one server round-trip at a time, without ever fanning out
 * unbounded. No vscode dependency.
 */
export async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (next < items.length) {
          const index = next++;
          results[index] = await fn(items[index], index);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}
