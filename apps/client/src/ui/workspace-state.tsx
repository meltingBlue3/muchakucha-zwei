import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, type PropsWithChildren, type SetStateAction } from 'react';
import { Platform } from 'react-native';

import { createWorkspaceState, compatibleDraft } from './workspace-store';
export { createWorkspaceState } from './workspace-store';

const WorkspaceContext = createContext<ReturnType<typeof createWorkspaceState> | null>(null);

// Tests may use an in-memory store; the app passes its account-scoped persistent store.
export function WorkspaceStateProvider({ children, store: suppliedStore }: PropsWithChildren<{ store?: ReturnType<typeof createWorkspaceState> }>) {
  const fallback = useRef(createWorkspaceState()).current;
  const store = suppliedStore ?? fallback;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (store.hasDrafts() && store.persistenceFailed()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [store]);
  return <WorkspaceContext.Provider value={store}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceStore() {
  const context = useContext(WorkspaceContext);
  const fallback = useRef(createWorkspaceState());
  return context ?? fallback.current;
}

export function useWorkspaceState<T>(key: string | undefined, initial: T | (() => T)): [T, (value: SetStateAction<T>) => void] {
  const store = useWorkspaceStore();
  const initialValue = useRef<{ key: string | undefined; value: T } | null>(null);
  if (initialValue.current === null || initialValue.current.key !== key) {
    initialValue.current = { key, value: typeof initial === 'function' ? (initial as () => T)() : initial };
  }
  const fallbackKey = useRef(`local:${Math.random()}`).current;
  const effectiveKey = key ?? fallbackKey;
  const snapshot = useCallback(() => {
    const saved = store.get(effectiveKey);
    const initial = initialValue.current!.value;
    return store.has(effectiveKey) && (!effectiveKey.startsWith('draft:') || compatibleDraft(saved, initial)) ? saved as T : initial;
  }, [store, effectiveKey]);
  const value = useSyncExternalStore(store.subscribe, snapshot, snapshot);
  const setValue = useCallback((next: SetStateAction<T>) => {
    store.set(effectiveKey, typeof next === 'function' ? (next as (previous: T) => T)(snapshot()) : next);
  }, [store, effectiveKey, snapshot]);
  return [value, setValue];
}
