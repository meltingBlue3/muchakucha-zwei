import type { ApiClient, GetHouseholdResponseDto, ListMyHouseholdsItemDto } from '@muchakucha/api-client';

export type HouseholdApi = Pick<ApiClient, 'listMyHouseholds' | 'getHousehold' | 'updateHousehold'>;

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

export async function fetchHousehold(
  apiClient: HouseholdApi,
  accessToken: string,
  householdId: string,
  abortSignal?: AbortSignal,
): Promise<GetHouseholdResponseDto> {
  return apiClient.getHousehold(accessToken, householdId, abortSignal);
}
