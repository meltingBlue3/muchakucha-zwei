import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Refresh at minute boundaries, on navigation focus and after app suspension. */
export function useMinuteClock(): { date: Date; minutes: number } {
  const [date, setDate] = useState(() => new Date());
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      setDate(new Date());
      timer = setTimeout(tick, 60_000 - Date.now() % 60_000);
    };
    tick();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') tick();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []));
  return { date, minutes: date.getHours() * 60 + date.getMinutes() };
}
