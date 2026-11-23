import type { ApiClient, ListMyHouseholdsItemDto } from '@muchakucha/api-client';

export type HouseholdApi = Pick<ApiClient, 'listMyHouseholds' | 'getHousehold' | 'updateHousehold' | 'sendHouseholdInvitation' | 'listInvitations' | 'resendInvitation' | 'revokeInvitation' | 'changeMemberRole' | 'removeMember' | 'transferOwnership' | 'updateOverviewHouseholds'>;

export interface HouseholdListResult {
  items: ListMyHouseholdsItemDto[];
}

export async function fetchHouseholds(
  apiClient: HouseholdApi,
  accessToken: string,
  abortSignal?: AbortSignal,
): Promise<HouseholdListResult> {
  const items = await apiClient.listMyHouseholds(accessToken, abortSignal);
  return { items: items.map(withOverviewFields) };
}

/**
 * An API older than the 总览 sends neither field. Such a household counts as
 * included, and with no join time it takes its mark color by id alone.
 */
function withOverviewFields(item: ListMyHouseholdsItemDto): ListMyHouseholdsItemDto {
  const { inOverview, joinedAt } = item as Partial<ListMyHouseholdsItemDto>;
  return { ...item, inOverview: inOverview ?? true, joinedAt: joinedAt ?? '' };
}

