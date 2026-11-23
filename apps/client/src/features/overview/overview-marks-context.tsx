import type { EventResponseDto } from '@muchakucha/api-client';
import { createContext, useContext } from 'react';

import type { HouseholdMark } from '../../ui/household-seal';

/**
 * Inside a 总览 page: each item's household seal, and the note for an event
 * that overlaps another household's. Outside one there is none, and rows keep
 * their label colors.
 */
export interface OverviewMarks {
  markOf(householdId: string): HouseholdMark | undefined;
  clashOf(event: EventResponseDto): string | undefined;
}

export const OverviewMarksContext = createContext<OverviewMarks | null>(null);

export function useOverviewMarks(): OverviewMarks | null {
  return useContext(OverviewMarksContext);
}
