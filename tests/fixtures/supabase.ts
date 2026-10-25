export type DbResult = { data: unknown; error: { code?: string; message: string } | null };
export type DbCall = { table: string; method: string; args: unknown[] };

/**
 * Stand-in for the supabase-js client. Every `from(table)` chain records its calls and resolves
 * to the next queued result, so a test lists the answers to its queries in the order they run.
 */
export function fakeDb(queue: DbResult[]) {
  const calls: DbCall[] = [];
  const db = {
    from(table: string) {
      const chain: unknown = new Proxy(
        {},
        {
          get(_target, method: string) {
            if (method === "then") {
              const next = queue.shift() ?? { data: null, error: null };
              return (resolve: (r: DbResult) => unknown) => Promise.resolve(next).then(resolve);
            }
            return (...args: unknown[]) => {
              calls.push({ table, method, args });
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  return { db, calls };
}
