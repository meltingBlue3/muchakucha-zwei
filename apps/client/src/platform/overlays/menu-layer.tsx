import type { ReactNode, RefObject } from 'react';
import { Modal, type View } from 'react-native';

/**
 * The full-window layer an anchored menu floats in. On a device it is a
 * transparent modal, so the system back gesture closes the menu.
 */
export function MenuLayer({ onShow, onClose, children }: {
  label: string;
  trigger: RefObject<View | null>;
  onShow(): void;
  onClose(): void;
  children: ReactNode;
}) {
  return <Modal transparent visible animationType="none" onShow={onShow} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>{children}</Modal>;
}
