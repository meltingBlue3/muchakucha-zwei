export interface RefreshCoordinator {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

type RefreshLock = <T>(operation: () => Promise<T>) => Promise<T>;

export function createRefreshCoordinator(
  lock: RefreshLock = async (operation) => operation(),
): RefreshCoordinator {
  let inFlight: Promise<unknown> | null = null;

  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      if (inFlight === null) {
        const current = lock(operation).finally(() => {
          if (inFlight === current) inFlight = null;
        });
        inFlight = current;
      }
      return inFlight as Promise<T>;
    },
  };
}

export function createWebRefreshLock(name: string): RefreshLock {
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request(name, operation) : operation();
  };
}
