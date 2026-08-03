import type { GetHouseholdResponseDto } from '@muchakucha/api-client';
import { useEffect, useRef, useState } from 'react';

import type { HouseholdApi } from './household-api';
import { fetchHousehold } from './household-api';
import {
  AppShell,
  HouseholdHeader,
  MemberRow,
} from '../../ui/household-components';
import {
  Banner,
  Heading,
  Spinner,
  Stack,
  Text,
} from '../../ui/primitives';

const GENERIC_ERROR = '这次没有完成。请检查网络后重试。';

export type HouseholdSettingsApi = Pick<HouseholdApi, 'getHousehold'>;

export interface HouseholdSettingsDeps {
  householdApi: HouseholdSettingsApi;
  getAccessToken: () => string | null;
}

export interface HouseholdSettingsProps {
  householdId: string;
  householdName: string;
  onOpenSwitcher: () => void;
  deps: HouseholdSettingsDeps;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: GetHouseholdResponseDto }
  | { kind: 'error'; message: string }
  | { kind: 'inconsistent'; message: string };

export function HouseholdSettings({
  householdId,
  householdName,
  onOpenSwitcher,
  deps,
}: HouseholdSettingsProps) {
  const [viewState, setViewState] = useState<ViewState>({ kind: 'loading' });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    const load = async () => {
      const accessToken = deps.getAccessToken();
      if (accessToken === null) {
        if (mountedRef.current) {
          setViewState({ kind: 'error', message: GENERIC_ERROR });
        }
        return;
      }

      try {
        const household = await deps.householdApi.getHousehold(
          accessToken,
          householdId,
          controller.signal,
        );
        if (!mountedRef.current) return;

        // Inconsistent state: no owner.
        if (household.members.length === 0 || household.ownerMembershipId === null) {
          setViewState({
            kind: 'inconsistent',
            message: '暂时无法显示成员。请刷新；如果问题持续，请稍后再试。',
          });
          return;
        }

        setViewState({ kind: 'ready', data: household });
      } catch (error: unknown) {
        if (!mountedRef.current) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        setViewState({ kind: 'error', message: GENERIC_ERROR });
      }
    };

    void load();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [deps, householdId]);

  if (viewState.kind === 'loading') {
    return (
      <AppShell accessibilityLabel="正在加载成员">
        <Stack gap={6}>
          <HouseholdHeader
            householdName={householdName}
            onOpenSwitcher={onOpenSwitcher}
          />
          <Stack gap={4} style={{ paddingTop: 16 }}>
            {[1, 2, 3].map((i) => (
              <Spinner key={i} label={`加载成员 ${i}`} />
            ))}
          </Stack>
        </Stack>
      </AppShell>
    );
  }

  if (viewState.kind === 'error') {
    return (
      <AppShell accessibilityLabel="成员加载失败">
        <Stack gap={6}>
          <HouseholdHeader
            householdName={householdName}
            onOpenSwitcher={onOpenSwitcher}
          />
          <Banner title="加载失败">{viewState.message}</Banner>
        </Stack>
      </AppShell>
    );
  }

  if (viewState.kind === 'inconsistent') {
    return (
      <AppShell accessibilityLabel="成员数据异常">
        <Stack gap={6}>
          <HouseholdHeader
            householdName={householdName}
            onOpenSwitcher={onOpenSwitcher}
          />
          <Banner title="数据异常">{viewState.message}</Banner>
        </Stack>
      </AppShell>
    );
  }

  const { data } = viewState;

  return (
    <AppShell accessibilityLabel={`${householdName}的成员`}>
      <Stack gap={6}>
        <HouseholdHeader
          householdName={householdName}
          onOpenSwitcher={onOpenSwitcher}
        />

        <Stack gap={2}>
          <Heading>成员</Heading>
          <Text variant="bodySm">
            {data.members.length} 位成员
          </Text>
        </Stack>

        <Stack>
          {data.members.map((member) => (
            <MemberRow key={member.membershipId} member={member} />
          ))}
        </Stack>
      </Stack>
    </AppShell>
  );
}
