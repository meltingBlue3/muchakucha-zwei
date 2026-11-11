import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const onMac = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The name of the key that desktop shortcuts hold: ⌘ on a Mac, Ctrl elsewhere.
 * It reads Ctrl until mounted, so a statically rendered page matches its first render.
 */
export function useCommandKeyLabel(): string {
  const [mac, setMac] = useState(false);
  useEffect(() => { setMac(onMac()); }, []);
  return mac ? '⌘' : 'Ctrl';
}

/** Whether a key event holds the command key: Ctrl, or ⌘ on a Mac. */
export function holdsCommandKey(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey;
}
