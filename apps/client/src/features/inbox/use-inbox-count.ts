import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';

/**
 * How many invitations wait in the inbox, for the desktop badges beside 收件箱.
 * Checked again whenever the page returns to view; stays 0 when `enabled` is
 * off or the check fails, since a badge is only a hint and the inbox page
 * reports its own failures.
 */
export function useInboxCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!enabled) return undefined;
    let live = true;
    void (async () => {
      try {
        const token = await sessionTransport.getAccessToken();
        if (!token) return;
        const result = await sessionApiClient.listInvitationInbox(token);
        if (live) setCount(result.invitations.length);
      } catch {
        // Keep the last known count.
      }
    })();
    return () => { live = false; };
  }, [enabled]));
  return count;
}
