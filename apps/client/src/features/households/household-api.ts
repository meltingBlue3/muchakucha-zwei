import type { ApiClient, ListMyHouseholdsItemDto } from '@muchakucha/api-client';

export type HouseholdApi = Pick<ApiClient, 'listMyHouseholds' | 'getHousehold' | 'updateHousehold' | 'sendHouseholdInvitation' | 'listInvitations' | 'resendInvitation' | 'revokeInvitation' | 'changeMemberRole' | 'removeMember' | 'transferOwnership'>;

export interface HouseholdListResult {
  items: ListMyHouseholdsItemDto[];
}

export async function fetchHouseholds(
  apiClient: HouseholdApi,
  accessToken: string,
  abortSignal?: AbortSignal,
): Promise<HouseholdListResult> {
  const items = await apiClient.listMyHouseholds(accessToken, abortSignal);
  return { items };
}

