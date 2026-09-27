import { createContext } from 'react';

export interface WindowConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  /** The confirmation discards or removes something, such as a draft. */
  destructive?: boolean;
  onConfirm(): void;
}

/** Forms use their route's existing window for confirmation when available. */
export const WindowConfirmation = createContext<((request: WindowConfirmationRequest) => void) | null>(null);
