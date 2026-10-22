/**
 * Calls `notify` after any of `methods` resolves. A failed call changed
 * nothing on the server, so it notifies no one.
 */
export function notifyAfterSuccess<T extends object>(client: T, methods: ReadonlySet<string>, notify: () => void): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string' || !methods.has(property)) return value;
      const method = value as (...args: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]) => {
        const result = await method.apply(target, args);
        notify();
        return result;
      };
    },
  });
}
