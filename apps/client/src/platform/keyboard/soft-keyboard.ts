import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** Whether the software keyboard is open. Android reports only the Did events. */
export function useSoftKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return shown;
}
