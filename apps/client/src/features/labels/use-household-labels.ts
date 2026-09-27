import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { LabelResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';

/**
 * Every label the household has, refreshed when the screen regains focus, so a
 * filter can offer labels that no loaded item happens to carry yet. Callers
 * merge in the labels seen on loaded items, which covers a failed fetch.
 */
export function useHouseholdLabels(householdId: string | null | undefined): LabelResponseDto[] {
  const [labels, setLabels] = useState<LabelResponseDto[]>([]);
  useFocusEffect(useCallback(() => {
    if (!householdId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) return;
        const result = await sessionApiClient.listLabels(token, householdId);
        if (!cancelled) setLabels(result.labels);
      } catch {
        // Keep whatever the loaded items show; the filter still works with those.
      }
    })();
    return () => { cancelled = true; };
  }, [householdId]));
  return labels;
}

/** Household labels first, then any extra ones found on loaded items, without duplicates. */
export function mergeLabels(household: LabelResponseDto[], seen: Array<{ id: string; name: string; color: string }>) {
  const merged = new Map<string, { id: string; name: string; color: string }>();
  for (const label of [...household, ...seen]) if (!merged.has(label.id)) merged.set(label.id, { id: label.id, name: label.name, color: label.color });
  return [...merged.values()];
}
