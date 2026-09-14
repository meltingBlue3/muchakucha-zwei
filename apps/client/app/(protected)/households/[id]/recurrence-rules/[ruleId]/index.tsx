import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import { ApiClientError, type RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { RecurrenceKindBadge } from '../../../../../../src/features/recurrence/recurrence-kind-badge';
import {
  RecurrencePicker,
  recurrenceInputFromResponse,
  type RecurrenceInput,
} from '../../../../../../src/features/recurrence/recurrence-picker';
import {
  formatRuleRow,
  nextDayIsoIn,
} from '../../../../../../src/features/recurrence/recurrence-rule-row';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../../../../../src/ui/household-components';
import { Banner, Button, Heading, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

const LOAD_ERROR = '无法加载这条周期规则，请检查网络连接后重试。';
// One copy for every 404 cause. Saying the rule "was taken away" would assert
// a history the client cannot know, and would confirm that a rule belonging to
// another household exists at all (T-07-46) — so this says only what is true
// from the user's side: they cannot see it.
const NOT_FOUND_ERROR = '这条周期规则不存在，或者你已经看不到它了。';
const SCOPE_NOTE = '更改会从明天开始生效，今天和之前的安排都保留。';
const SAVE_CONFIRM_PROMPT = '这会影响明天起的每一次。';
const SAVE_ERROR = '更改没有保存成功。这条重复规则没有发生任何改变，请重试。';
const SAVE_FORBIDDEN = '只有创建者、管理员或所有者可以修改这条重复规则。';
const END_ACTION = '结束此重复';
const END_CONFIRM_PROMPT = '确定结束？明天起不再重复，今天和之前的安排都保留。';
const END_ERROR = '没有结束成功。这个重复安排没有发生任何改变，请重试。';
const END_FORBIDDEN = '只有创建者、管理员或所有者可以结束这条重复规则。';
const ENDED_NOTE = '这个重复已经结束了。';

function resolveDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export default function RecurrenceRuleDetailRoute() {
  const { id, ruleId } = useLocalSearchParams<{ id: string; ruleId: string }>();
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

  const [rule, setRule] = useState<RecurrenceRuleListItemDto | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceInput | null>(null);
  const [pickerValid, setPickerValid] = useState(true);
  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;
  const deviceTimeZone = resolveDeviceTimeZone();
  const busy = saving || ending;

  const fetchRule = useCallback(async () => {
    if (householdId === undefined || householdId === '' || ruleId === undefined || ruleId === '') {
      return;
    }
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期。');
        return;
      }
      const result = await sessionApiClient.getRecurrenceRule(token, householdId, ruleId);
      setRule(result);
      // The picker is seeded once from the authoritative rule. A refetch after
      // a failed write must not silently discard edits the user still has on
      // screen, so the seed only happens while there is nothing to lose.
      setRecurrence((current) => current ?? recurrenceInputFromResponse(result));
      loadedOnce.current = true;
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiClientError && caught.status === 404 ? NOT_FOUND_ERROR : LOAD_ERROR,
      );
    } finally {
      setLoading(false);
    }
  }, [householdId, ruleId]);

  useFocusEffect(
    useCallback(() => {
      void fetchRule();
    }, [fetchRule]),
  );

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
  }, [id, currentHouseholdId, switchHousehold, router]);

  const backToList = useCallback(() => {
    if (householdId === undefined || householdId === '') return;
    // Return to the list and let its `useFocusEffect` re-read authoritative
    // state. Nothing is updated optimistically on the way out.
    void router.replace(`/households/${encodeURIComponent(householdId)}/recurrence-rules`);
  }, [householdId, router]);

  // Only a confirm action writes. The trigger below merely opens this row.
  const handleConfirmSave = useCallback(async () => {
    if (householdId === undefined || householdId === '' || ruleId === undefined || ruleId === '') {
      return;
    }
    if (recurrence === null) return;
    setSaving(true);
    setWriteError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setWriteError(SAVE_ERROR);
        return;
      }
      await sessionApiClient.updateRecurrenceRule(token, householdId, ruleId, { recurrence });
      setSaveConfirmOpen(false);
      backToList();
    } catch (caught: unknown) {
      // Every picker edit is kept: a failed write changed nothing server-side,
      // so throwing away the user's input would be the only real loss.
      setWriteError(
        caught instanceof ApiClientError && caught.status === 403 ? SAVE_FORBIDDEN : SAVE_ERROR,
      );
    } finally {
      setSaving(false);
    }
  }, [householdId, ruleId, recurrence, backToList]);

  const handleConfirmEnd = useCallback(async () => {
    if (householdId === undefined || householdId === '' || ruleId === undefined || ruleId === '') {
      return;
    }
    setEnding(true);
    setWriteError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setWriteError(END_ERROR);
        return;
      }
      await sessionApiClient.endRecurrenceRule(token, householdId, ruleId);
      setEndConfirmOpen(false);
      backToList();
    } catch (caught: unknown) {
      setWriteError(
        caught instanceof ApiClientError && caught.status === 403 ? END_FORBIDDEN : END_ERROR,
      );
    } finally {
      setEnding(false);
    }
  }, [householdId, ruleId, backToList]);

  const handleValidityChange = useCallback((valid: boolean) => setPickerValid(valid), []);

  const formatted = rule === null ? null : formatRuleRow(rule, deviceTimeZone);
  const ended = formatted?.ended ?? false;
  // The split anchor: tomorrow in the RULE's timezone. Memoized so the picker's
  // startsOn-sync effect sees a stable value instead of a fresh one per render.
  const anchor = useMemo(
    () => (rule === null ? null : nextDayIsoIn(rule.timezone)),
    [rule],
  );

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

  const confirmRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: activeTheme.spacing[2],
  };
  const confirmActionStyle = ({ pressed }: { pressed: boolean }) => ({
    minHeight: activeTheme.controlSizes.touchTarget,
    justifyContent: 'center' as const,
    paddingHorizontal: activeTheme.spacing[2],
    opacity: pressed ? 0.7 : 1,
  });

  return (
    <>
      <AppShell accessibilityLabel="周期规则详情" title="周期规则" showBack showProfile>
        <Stack gap={4}>
          <HouseholdHeader
            householdName={currentHousehold?.name ?? ''}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />

          {writeError !== null && <Banner>{writeError}</Banner>}

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
              <Text variant="bodySm" color="destructive">{error}</Text>
            </View>
          )}

          {rule !== null && formatted !== null && anchor !== null && (
            <Stack gap={5}>
              <Stack gap={2}>
                {/* Never truncated: the template title is the rule's identity. */}
                <Heading>{formatted.title}</Heading>
                <View style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: activeTheme.spacing[2],
                }}>
                  {rule.kind !== null && <RecurrenceKindBadge kind={rule.kind} />}
                  <Text variant="caption" color={ended ? 'inkMuted' : 'ink'}>
                    {formatted.nextLine}
                  </Text>
                </View>
              </Stack>

              <Stack gap={1}>
                <Text variant="label" color="inkMuted">重复</Text>
                <Text variant="body">{formatted.summary}</Text>
                {formatted.clampNote !== null && (
                  <Text variant="caption" color="inkMuted">{formatted.clampNote}</Text>
                )}
                {formatted.timeZoneNote !== null && (
                  <Text variant="caption" color="inkMuted">{formatted.timeZoneNote}</Text>
                )}
              </Stack>

              {/* `startDate` is the split anchor, NOT the rule's original
                  startsOn: the picker force-syncs `value.startsOn` to whatever
                  it is handed, so the original date here would rewrite the
                  user's selection on every render. */}
              <RecurrencePicker
                value={recurrence}
                onChange={setRecurrence}
                startDate={anchor}
                disabled={ended || busy}
                onValidityChange={handleValidityChange}
              />

              <Stack gap={2}>
                {/* Always visible, because a rule-level edit can only ever mean
                    "this and everything after". A scope sheet with one live
                    option would be noise, so there is none. */}
                <Text variant="caption" color="inkMuted">{SCOPE_NOTE}</Text>

                <Button
                  label="保存更改"
                  accessibilityLabel="保存更改"
                  disabled={ended || busy || saveConfirmOpen || recurrence === null || !pickerValid}
                  onPress={() => setSaveConfirmOpen(true)}
                />

                {saveConfirmOpen && (
                  <View style={confirmRowStyle}>
                    <Text accessibilityLiveRegion="polite" variant="caption" color="inkMuted">
                      {SAVE_CONFIRM_PROMPT}
                    </Text>
                    <Pressable
                      accessibilityLabel="确认保存"
                      accessibilityRole="button"
                      accessibilityState={{ busy: saving, disabled: busy }}
                      disabled={busy}
                      hitSlop={activeTheme.spacing[2]}
                      onPress={() => { void handleConfirmSave(); }}
                      style={confirmActionStyle}
                    >
                      <Text variant="caption" color={busy ? 'inkMuted' : 'coral'}>
                        {saving ? '保存中…' : '确认保存'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="取消"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      hitSlop={activeTheme.spacing[2]}
                      onPress={() => setSaveConfirmOpen(false)}
                      style={confirmActionStyle}
                    >
                      <Text variant="caption" color="inkMuted">取消</Text>
                    </Pressable>
                  </View>
                )}
              </Stack>

              <Stack gap={2}>
                <Pressable
                  accessibilityLabel={END_ACTION}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: ended || busy || endConfirmOpen }}
                  disabled={ended || busy || endConfirmOpen}
                  hitSlop={activeTheme.spacing[4]}
                  onPress={() => setEndConfirmOpen(true)}
                  style={({ pressed }) => ({
                    alignSelf: 'flex-start',
                    justifyContent: 'center',
                    minHeight: activeTheme.controlSizes.touchTarget,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text variant="bodySm" color={ended || busy ? 'disabled' : 'destructive'}>
                    {END_ACTION}
                  </Text>
                </Pressable>

                {ended && (
                  <Text variant="caption" color="inkMuted">{ENDED_NOTE}</Text>
                )}

                {endConfirmOpen && (
                  <View style={confirmRowStyle}>
                    <Text accessibilityLiveRegion="polite" variant="caption" color="destructive">
                      {END_CONFIRM_PROMPT}
                    </Text>
                    <Pressable
                      accessibilityLabel="确认结束"
                      accessibilityRole="button"
                      accessibilityState={{ busy: ending, disabled: busy }}
                      disabled={busy}
                      hitSlop={activeTheme.spacing[2]}
                      onPress={() => { void handleConfirmEnd(); }}
                      style={confirmActionStyle}
                    >
                      <Text variant="caption" color={busy ? 'inkMuted' : 'destructive'}>
                        {ending ? '结束中…' : '确认结束'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="取消"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      hitSlop={activeTheme.spacing[2]}
                      onPress={() => setEndConfirmOpen(false)}
                      style={confirmActionStyle}
                    >
                      <Text variant="caption" color="inkMuted">取消</Text>
                    </Pressable>
                  </View>
                )}
              </Stack>
            </Stack>
          )}
        </Stack>
      </AppShell>

      <HouseholdSwitcher
        currentHouseholdId={id ?? currentHouseholdId}
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
