import type { View } from 'react-native';

export function rememberRouteTrigger(): void {}
export function getRouteTrigger(): View | null { return null; }

/** Marks where focus returns on Web when a window's trigger is gone; nothing on native. */
export const routeFocusFallback = {};
