import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, type PropsWithChildren, type SetStateAction } from 'react';
import { Platform } from 'react-native';

export function createWorkspaceState() {
  const values = new Map<string, unknown>();
  const dirtyDrafts = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    has: (key: string) => values.has(key),
    seed(key: string, value: unknown) { if (!values.has(key)) { values.set(key, value); emit(); } },
    get: (key: string) => values.get(key),
    set(key: string, value: unknown) { values.set(key, value); if (key.startsWith('draft:')) dirtyDrafts.add(key); emit(); },
    clear(prefix: string) {
      for (const key of values.keys()) if (key.startsWith(prefix)) { values.delete(key); dirtyDrafts.delete(key); }
      emit();
    },
    hasDrafts: () => dirtyDrafts.size > 0,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

const WorkspaceContext = createContext<ReturnType<typeof createWorkspaceState> | null>(null);

// Kept only inside the authenticated navigator: logout discards all drafts and filters.
export function WorkspaceStateProvider({ children }: PropsWithChildren) {
  const store = useRef(createWorkspaceState()).current;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (store.hasDrafts()) { event.preventDefault(); event.returnValue = ''; }
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
  const snapshot = useCallback(() => store.has(effectiveKey) ? store.get(effectiveKey) as T : initialValue.current!.value, [store, effectiveKey]);
  const value = useSyncExternalStore(store.subscribe, snapshot, snapshot);
  const setValue = useCallback((next: SetStateAction<T>) => {
    store.set(effectiveKey, typeof next === 'function' ? (next as (previous: T) => T)(snapshot()) : next);
  }, [store, effectiveKey, snapshot]);
  return [value, setValue];
}
