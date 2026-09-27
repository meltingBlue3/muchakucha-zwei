import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

/** A dialog that temporarily replaces a window's content, such as a picker. */
export interface RouteWindowStep {
  title: string;
  content: ReactNode;
  onClose(): void;
  onReturn?(): void;
}

export interface WindowStepHost {
  show(owner: object, step: RouteWindowStep): void;
  hide(owner: object): void;
}

/** Provided to a window's main content; step content itself gets `null`. */
export const WindowStepContext = createContext<WindowStepHost | null>(null);

/**
 * Shows `step` in the surrounding window while it is non-null. Pass a memoized
 * step so the window is not re-rendered on every render of the caller.
 * Returns whether a window can host steps; callers fall back to inline UI otherwise.
 */
export function useWindowStep(step: RouteWindowStep | null): boolean {
  const host = useContext(WindowStepContext);
  const owner = useRef({}).current;
  useEffect(() => {
    if (!host) return;
    if (step) host.show(owner, step);
    else host.hide(owner);
  }, [host, owner, step]);
  useEffect(() => () => host?.hide(owner), [host, owner]);
  return host !== null;
}
