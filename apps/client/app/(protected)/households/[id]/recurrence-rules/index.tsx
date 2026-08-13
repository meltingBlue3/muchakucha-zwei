import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { RecurrenceRuleRow } from '../../../../../src/features/recurrence/recurrence-rule-row';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../../../../src/ui/household-components';
import { Heading, Stack, Text } from '../../../../../src/ui/primitives';
import type { Theme } from '../../../../../src/ui/theme';

const LOAD_ERROR = '无法加载周期规则，请检查网络连接后重试。';
// Straight quotes match the published sibling copy in `recurring-filter.ts`.
const EMPTY_COPY = '还没有周期规则。创建任务或事件时打开"重复"，规则就会出现在这里。';

function resolveDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export default function RecurrenceRulesIndexRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
    switchHousehold,
  } = useHouseholdContext();

  const [rules, setRules] = useState<RecurrenceRuleListItemDto[]>([]);
  // A ref, not state: `fetchRules` must keep a stable identity, otherwise it
  // changes the moment the first load finishes and `useFocusEffect` fires a
  // second, pointless request on every arrival.
  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;
  const deviceTimeZone = resolveDeviceTimeZone();

  const fetchRules = useCallback(async () => {
    if (householdId === undefined || householdId === '') return;
    // Only the FIRST load shows the spinner. A focus refetch keeps the
    // previously loaded rules on screen, so returning from the detail screen
    // never flashes an empty list on the way to the same list.
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期。');
        return;
      }
      const result = await sessionApiClient.listRecurrenceRules(token, householdId);
      setRules(result.rules);
      loadedOnce.current = true;
    } catch {
      // The stale list is deliberately left in place next to the error block:
      // losing what the user could already read is a worse failure mode than
      // showing it beside a retry.
      setError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  // Refetch on every focus, not just on mount — after ending or editing a
  // rule in the detail screen the list must immediately reflect authoritative
  // server state rather than a locally guessed one.
  useFocusEffect(
    useCallback(() => {
      void fetchRules();
    }, [fetchRules]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRules();
    setRefreshing(false);
  }, [fetchRules]);

  const handleSwitch = useCallback(async (nextHouseholdId: string) => {
    if (nextHouseholdId === currentHouseholdId) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(nextHouseholdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(nextHouseholdId)}/recurrence-rules`);
    }
    setSwitcherOpen(false);
  }, [currentHouseholdId, switchHousehold, router]);

  const handleOpenRule = useCallback((ruleId: string) => {
    if (householdId === undefined || householdId === '') return;
    void router.push(
      `/households/${encodeURIComponent(householdId)}/recurrence-rules/${encodeURIComponent(ruleId)}`,
    );
  }, [householdId, router]);

  if (viewState === 'accessChanged') {
    return (
      <AppShell accessibilityLabel="家庭访问权已变化">
        <AccessChangedPanel
          hasOtherHouseholds={households.length > 0}
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => { void refreshHouseholds().then(() => router.replace('/households')); }}
          onCreateNew={() => { void router.replace('/household-handoff'); }}
        />
      </AppShell>
    );
  }

  if (householdId === undefined || householdId === '') {
    return (
      <AppShell accessibilityLabel="页面未找到">
        <Stack gap={4}>
          <Text>这个页面暂时无法访问。</Text>
        </Stack>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell accessibilityLabel="周期规则" refreshing={refreshing} onRefresh={handleRefresh} title="周期规则" showProfile>
        <Stack gap={4}>
          <HouseholdHeader
            householdName={currentHousehold?.name ?? ''}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />

          <Heading>周期规则</Heading>

          {loading && (
            <View style={{ alignItems: 'center', paddingVertical: activeTheme.spacing[6] }}>
              <ActivityIndicator color={activeTheme.colors.coral} />
            </View>
          )}

          {error !== null && (
            <View style={{
              backgroundColor: activeTheme.colors.destructiveSoft,
              padding: activeTheme.spacing[4],
              borderRadius: activeTheme.borderRadii.md,
            }}>
              <Stack gap={2}>
                <Text variant="bodySm" color="destructive">{error}</Text>
                <Pressable
                  accessibilityLabel="重试"
                  accessibilityRole="button"
                  hitSlop={activeTheme.spacing[3]}
                  onPress={() => { void fetchRules(); }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Text variant="bodySm" color="destructive">重试</Text>
                </Pressable>
              </Stack>
            </View>
          )}

          {!loading && error === null && rules.length === 0 && (
            <Text variant="bodySm" color="inkMuted">{EMPTY_COPY}</Text>
          )}

          {/* Rendered in the order the server returned: unresolved rules first
              by next occurrence, ended rules after by title. Re-ordering here
              would put a second, drifting copy of that contract on the client. */}
          {rules.map((rule) => (
            <RecurrenceRuleRow
              key={rule.id}
              rule={rule}
              deviceTimeZone={deviceTimeZone}
              onPress={() => handleOpenRule(rule.id)}
            />
          ))}
        </Stack>
      </AppShell>

      <HouseholdSwitcher
        currentHouseholdId={currentHouseholdId}
        households={households}
        onCreateNew={() => {
          void router.push('/households/new');
          setSwitcherOpen(false);
        }}
        onClose={() => setSwitcherOpen(false)}
        onSelect={(hid) => { void handleSwitch(hid); }}
        visible={switcherOpen}
      />
    </>
  );
}
