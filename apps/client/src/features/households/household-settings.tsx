import type { GetHouseholdResponseDto } from '@muchakucha/api-client';
import { ApiClientError } from '@muchakucha/api-client';
import { useEffect, useRef, useState } from 'react';

import type { HouseholdApi } from './household-api';
import { fetchHousehold } from './household-api';
import {
  AppShell,
  HouseholdContextNote,
  HouseholdHeader,
  MemberRow,
} from '../../ui/household-components';
import {
  Banner,
  Button,
  Heading,
  Spinner,
  Stack,
  Text,
  TextField,
} from '../../ui/primitives';

const GENERIC_ERROR = '这次没有完成。请检查网络后重试。';
const PERMISSION_DENIED = '你没有重命名此家庭的权限。';
const RENAME_SUCCESS = '家庭名称已更新。';

export type HouseholdSettingsApi = Pick<HouseholdApi, 'getHousehold' | 'updateHousehold'>;

export interface HouseholdSettingsDeps {
  householdApi: HouseholdSettingsApi;
  getAccessToken: () => string | null;
}

export interface HouseholdSettingsProps {
  householdId: string;
  householdName: string;
  onOpenSwitcher: () => void;
  deps: HouseholdSettingsDeps;
  /** When true, show the rename form above the member list. Default false. */
  showRename?: boolean;
  /** Called when membership loss is detected after a rename attempt. */
  onRenameAccessChanged?: (lostHouseholdName: string) => void;
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
  showRename = false,
  onRenameAccessChanged,
}: HouseholdSettingsProps) {
  const [viewState, setViewState] = useState<ViewState>({ kind: 'loading' });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // ---- Rename form state ----
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameSuccess, setRenameSuccess] = useState<string | undefined>(undefined);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  // Populate the rename input when data loads.
  const renameInitialized = useRef(false);

  useEffect(() => {
    if (viewState.kind === 'ready' && !renameInitialized.current) {
      setRenameValue(viewState.data.name);
      renameInitialized.current = true;
    }
  }, [viewState]);

  const handleRename = async () => {
    const trimmed = renameValue.trim().normalize('NFC');
    if (trimmed === '' || [...trimmed].length > 40) return;

    setRenameSubmitting(true);
    setRenameSuccess(undefined);
    setRenameError(undefined);

    const accessToken = deps.getAccessToken();
    if (accessToken === null) {
      setRenameError(GENERIC_ERROR);
      setRenameSubmitting(false);
      return;
    }

    try {
      const result = await deps.householdApi.updateHousehold(
        accessToken,
        householdId,
        { name: trimmed },
      );

      if (!mountedRef.current) return;

      // Replace header/form values only from the authoritative response.
      setViewState({ kind: 'ready', data: result });
      setRenameValue(result.name);
      setRenameSuccess(RENAME_SUCCESS);
    } catch (error: unknown) {
      if (!mountedRef.current) return;

      if (error instanceof ApiClientError) {
        if (error.status === 403) {
          // Still a member but not the current owner.
          setRenameError(PERMISSION_DENIED);
        } else if (error.status === 404) {
          // Membership may have been lost — signal the parent.
          if (onRenameAccessChanged !== undefined) {
            onRenameAccessChanged(householdName);
            setRenameSubmitting(false);
            return;
          }
          setRenameError(PERMISSION_DENIED);
        } else if (error.status === 401) {
          setRenameError(GENERIC_ERROR);
        } else {
          // Retain input on recoverable failure.
          setRenameError(GENERIC_ERROR);
        }
      } else {
        setRenameError(GENERIC_ERROR);
      }
    }

    setRenameSubmitting(false);
  };

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

  // Use authoritative household name from the response so rename updates the header.
  const authoritativeName = data.name;

  return (
    <AppShell accessibilityLabel={`${authoritativeName}的成员`}>
      <Stack gap={6}>
        <HouseholdHeader
          householdName={authoritativeName}
          onOpenSwitcher={onOpenSwitcher}
        />

        {/* Rename form — only shown on the settings route */}
        {showRename ? (
          <Stack gap={4}>
            <HouseholdContextNote householdName={authoritativeName} />

            {renameError !== undefined ? (
              <Banner title="重命名失败">{renameError}</Banner>
            ) : null}

            {renameSuccess !== undefined ? (
              <Stack
                accessibilityLiveRegion="polite"
                accessibilityRole={'status' as never}
                gap={1}
              >
                <Text>{renameSuccess}</Text>
              </Stack>
            ) : null}

            <Stack gap={2}>
              <TextField
                label="家庭名称"
                value={renameValue}
                onChangeText={(text) => {
                  setRenameValue(text);
                  setRenameError(undefined);
                  setRenameSuccess(undefined);
                }}
              />
              <Button
                disabled={
                  renameSubmitting ||
                  renameValue.trim().normalize('NFC') === '' ||
                  [...renameValue.trim().normalize('NFC')].length > 40
                }
                label="保存"
                loading={renameSubmitting}
                onPress={() => { void handleRename(); }}
              />
            </Stack>
          </Stack>
        ) : null}

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
