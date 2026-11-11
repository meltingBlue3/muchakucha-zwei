import { useSyncExternalStore } from 'react';

const query = '(pointer: fine)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const snapshot = () => window.matchMedia(query).matches;
export function usePointerDensity(): boolean { return useSyncExternalStore(subscribe, snapshot, () => false); }
