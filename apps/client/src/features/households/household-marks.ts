import type { ListMyHouseholdsItemDto } from '@muchakucha/api-client';
import { useMemo } from 'react';
import type { HouseholdMark } from '../../ui/household-seal';
import { householdMarkColors } from '../../ui/theme';
import { useHouseholdContext } from './household-context';

export type { HouseholdMark };

type MarkSource = Pick<ListMyHouseholdsItemDto, 'id' | 'name' | 'joinedAt'>;

/**
 * Gives each household a mark. Colors go out in the order the person joined,
 * so a household keeps its color when another is added; ties fall back to the
 * id so every device agrees.
 */
export function householdMarks(households: readonly MarkSource[]): Map<string, HouseholdMark> {
  const ordered = [...households].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
  return new Map(ordered.map((household, index) => [household.id, {
    character: [...household.name.trim()][0] ?? '?',
    color: householdMarkColors[index % householdMarkColors.length]!,
    name: household.name,
  }]));
}

/** Every household's mark, kept in step with the household list. */
export function useHouseholdMarks(): Map<string, HouseholdMark> {
  const { households } = useHouseholdContext();
  return useMemo(() => householdMarks(households), [households]);
}

/** The households the 总览 shows, in the order their marks were given. */
export function overviewHouseholds<T extends MarkSource & Pick<ListMyHouseholdsItemDto, 'inOverview'>>(households: readonly T[]): T[] {
  return [...households]
    .filter(household => household.inOverview)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
}
