import { createContext, useContext, type ReactNode } from 'react';

/** The primary action a form hands to a full-screen editor sheet's header. */
export interface SheetAction {
  label: string;
  submitting: boolean;
  disabled?: boolean;
  onPress(): void;
}

/**
 * Present only inside a compact editor sheet. `FormActions` registers its
 * submit here instead of rendering a bottom button row; the sheet's close
 * button already covers cancel.
 */
export const SheetActionSlot = createContext<((action: SheetAction | null) => void) | null>(null);

/** Keeps a hidden form mounted without letting it own the sheet header. */
export function SuspendSheetAction({ suspended, children }: { suspended: boolean; children: ReactNode }) {
  const slot = useContext(SheetActionSlot);
  return <SheetActionSlot.Provider value={suspended ? null : slot}>{children}</SheetActionSlot.Provider>;
}
