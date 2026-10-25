export type SetCall = { name: string; value: string; options: Record<string, unknown> };

/** In-memory cookie jar with the slice of the next/headers API the services use. */
export function fakeJar(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const sets: SetCall[] = [];
  return {
    sets,
    get: (name: string) => (store.has(name) ? { value: store.get(name)! } : undefined),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      store.set(name, value);
      sets.push({ name, value, options });
    },
    delete: (name: string) => void store.delete(name),
    has: (name: string) => store.has(name),
  };
}
