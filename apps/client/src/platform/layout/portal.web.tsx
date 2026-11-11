import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../../ui/theme';
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(<div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: theme.layout.popoverLayer }}>{children}</div>, document.body);
}
