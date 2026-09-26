import { createContext } from 'react';

export interface WindowConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm(): void;
}

/** Forms use their route's existing window for confirmation when available. */
export const WindowConfirmation = createContext<((request: WindowConfirmationRequest) => void) | null>(null);
