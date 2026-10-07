import { RouteWindow, useRouteWindowClose } from '../../../../../../src/ui/route-window';
import RecurrenceListScreen from '../../../../../../src/features/recurrence/recurrence-list-screen';
import { DraftNotice } from '../../../../../../src/ui/draft-notice';
import { useEditConflict, captureEditBaseline } from '../../../../../../src/ui/edit-conflict';
import { useWorkspaceStore, useWorkspaceState } from '../../../../../../src/ui/workspace-state';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ban from 'lucide-react-native/icons/ban';
import Repeat from 'lucide-react-native/icons/repeat';
import { useTheme } from '@shopify/restyle';
import { ApiClientError, type RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { RecurrenceKindBadge } from '../../../../../../src/features/recurrence/recurrence-kind-badge';
import {
  recurrenceInputFromResponse,
  type RecurrenceInput,
} from '../../../../../../src/features/recurrence/recurrence-options';
import { RecurrenceField } from '../../../../../../src/features/recurrence/recurrence-field';
import { FormRow, FormSection, ROW_CONTENT_INSET, rowIcon } from '../../../../../../src/ui/compose-rows';
import {
  formatRuleRow,
  nextDayIsoIn,
} from '../../../../../../src/features/recurrence/recurrence-rule-row';
import {
  AccessChangedPanel,
  AppShell,
} from '../../../../../../src/ui/household-components';
import { Banner, ConfirmActions, FormActions, FormMessage, Heading, LoadError, LoadingState, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

const LOAD_ERROR = '无法加载这条重复安排，请检查网络连接后重试。';
// One copy for every 404 cause. Saying the rule "was taken away" would assert
// a history the client cannot know, and would confirm that a rule belonging to
// another household exists at all (T-07-46) — so this says only what is true
// from the user's side: they cannot see it.
const NOT_FOUND_ERROR = '这条重复安排不存在，或者你已经看不到它了。';
const SCOPE_NOTE = '更改会从明天开始生效，今天和之前的安排都保留。';
const SAVE_CONFIRM_PROMPT = '这会影响明天起的每一次。';
const SAVE_ERROR = '更改没有保存成功。这条重复规则没有发生任何改变，请重试。';
const SAVE_FORBIDDEN = '只有创建者、管理员或所有者可以修改这条重复规则。';
const END_ACTION = '结束此重复';
const END_CONFIRM_PROMPT = '确定结束？明天起不再重复，今天和之前的安排都保留。';
const END_ERROR = '没有结束成功。这个重复安排没有发生任何改变，请重试。';
const END_FORBIDDEN = '只有创建者、管理员或所有者可以结束这条重复规则。';
const ENDED_NOTE = '这个重复已经结束了。';
const TURN_OFF_HINT = '要停止这个重复，请使用下方的「结束此重复」。';
const ENDS_ON_ERROR = '截止日期必须晚于明天。';

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
  const exitAllowed = useRef(false);
  const { close: dismiss } = useRouteWindowClose('recurrence-rules');
  const activeTheme = useTheme<Theme>();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
  } = useHouseholdContext();

  const [rule, setRule] = useState<RecurrenceRuleListItemDto | null>(null);
  const [recurrence, setRecurrence] = useWorkspaceState<RecurrenceInput | null>(`draft:${id}:recurrence-rules:${ruleId}:form`, null);
  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  const householdId = id ?? currentHouseholdId;
  const deviceTimeZone = resolveDeviceTimeZone();
  const busy = saving || ending;

  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:recurrence-rules:${ruleId}:`;
  const conflict = useEditConflict(draftPrefix, rule, async () => {
    const token = await sessionTransport.getAccessToken();
    if (!token) throw new Error('Session expired');
    return sessionApiClient.getRecurrenceRule(token, householdId!, ruleId!);
  }, setRule);

  const fetchRule = useCallback(async () => {
    if (householdId === undefined || householdId === '' || ruleId === undefined || ruleId === '') {
      return;
    }
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      const result = await sessionApiClient.getRecurrenceRule(token, householdId, ruleId);
      captureEditBaseline(workspace, draftPrefix, result);
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
  }, [householdId, ruleId, workspace, draftPrefix, setRecurrence]);

  useFocusEffect(
    useCallback(() => {
      void fetchRule();
    }, [fetchRule]),
  );

  const backToList = useCallback(() => {
    if (householdId === undefined || householdId === '') return;
    // Return to the list and let its `useFocusEffect` re-read authoritative
    // state. Nothing is updated optimistically on the way out.
    exitAllowed.current = true;
    void router.dismissTo(`/households/${encodeURIComponent(householdId)}/recurrence-rules`);
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
      await sessionApiClient.updateRecurrenceRule(token, householdId, ruleId, { recurrence, expectedUpdatedAt: conflict.precondition.expectedUpdatedAt });
      workspace.clear(draftPrefix);
      setSaveConfirmOpen(false);
      backToList();
    } catch (caught: unknown) {
      if (conflict.handle(caught)) { setSaveConfirmOpen(false); return; }
      // Every picker edit is kept: a failed write changed nothing server-side,
      // so throwing away the user's input would be the only real loss.
      setWriteError(
        caught instanceof ApiClientError && caught.status === 403 ? SAVE_FORBIDDEN : SAVE_ERROR,
      );
    } finally {
      setSaving(false);
    }
  }, [householdId, ruleId, recurrence, backToList, conflict, workspace, draftPrefix]);

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

  const formatted = rule === null ? null : formatRuleRow(rule, deviceTimeZone);
  const ended = formatted?.ended ?? false;
  // The split anchor: tomorrow in the RULE's timezone. Memoized so the picker's
  // startsOn-sync effect sees a stable value instead of a fresh one per render.
  const anchor = useMemo(
    () => (rule === null ? null : nextDayIsoIn(rule.timezone)),
    [rule],
  );
  // The split starts tomorrow, so an end date must come after it.
  const endsOnInvalid = anchor !== null && recurrence?.endsOn !== undefined && recurrence.endsOn <= anchor;

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

  const close = () => {
    if (saveConfirmOpen) setSaveConfirmOpen(false);
    else if (endConfirmOpen) setEndConfirmOpen(false);
    else dismiss();
  };
  return (
      <RouteWindow resource="recurrence-rules" size={saveConfirmOpen || endConfirmOpen ? 'standard' : 'editor'} title={saveConfirmOpen ? '确认保存重复安排' : endConfirmOpen ? '结束重复安排' : '重复安排'} busy={busy} onClose={close} onBackStep={saveConfirmOpen || endConfirmOpen ? close : undefined} exitAllowed={exitAllowed} fallback={<RecurrenceListScreen />}>
        {saveConfirmOpen || endConfirmOpen ? <Stack gap={3}>
          <Text>{saveConfirmOpen ? SAVE_CONFIRM_PROMPT : END_CONFIRM_PROMPT}</Text>
          {writeError ? <Banner>{writeError}</Banner> : null}
          <ConfirmActions confirmLabel={saveConfirmOpen ? '确认保存' : '确认结束'} destructive={endConfirmOpen} busy={busy} onCancel={close} onConfirm={() => { void (saveConfirmOpen ? handleConfirmSave() : handleConfirmEnd()); }} />
        </Stack> : <>
        <Stack gap={4}>
          {writeError !== null && <Banner>{writeError}</Banner>}

          {loading && <LoadingState label="正在加载重复安排" />}

          {error !== null && <LoadError message={error} onRetry={() => void fetchRule()} />}

          {rule !== null && formatted !== null && anchor !== null && (
            <Stack gap={0}>
              <DraftNotice />
              {conflict.panel}
              <FormRow>
                <Stack gap={2} style={{ flex: 1, paddingVertical: activeTheme.spacing[3] }}>
                  {/* Never truncated: the template title is the rule's identity. */}
                  <Heading level={2}>{formatted.title}</Heading>
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
              </FormRow>

              <FormSection>
                {/* `startDate` is the split anchor (tomorrow), NOT the rule's
                    original startsOn: saved changes apply from tomorrow on.
                    不重复 stays disabled; ending the series is its own action. */}
                <RecurrenceField
                  name="重复规则"
                  icon={rowIcon(Repeat)}
                  value={recurrence}
                  onChange={setRecurrence}
                  startDate={anchor}
                  disabled={ended || busy}
                  disableTurnOff
                  turnOffHint={TURN_OFF_HINT}
                />
                {/* Always visible, because a rule-level edit can only ever mean
                    "this and everything after". A scope sheet with one live
                    option would be noise, so there is none. */}
                <Text variant="caption" color="inkMuted" style={{ paddingLeft: ROW_CONTENT_INSET, paddingBottom: activeTheme.spacing[2] }}>{SCOPE_NOTE}</Text>
                {endsOnInvalid ? <View style={{ paddingLeft: ROW_CONTENT_INSET }}><FormMessage>{ENDS_ON_ERROR}</FormMessage></View> : null}
              </FormSection>

              <FormSection>
                <FormRow icon={rowIcon(Ban)}>
                  <Pressable
                    accessibilityLabel={END_ACTION}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: ended || busy || endConfirmOpen }}
                    disabled={ended || busy || endConfirmOpen}
                    onPress={() => setEndConfirmOpen(true)}
                    style={({ pressed }) => ({
                      flex: 1,
                      justifyContent: 'center',
                      minHeight: activeTheme.controlSizes.touchTarget,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text color={ended || busy ? 'disabled' : 'destructive'}>{END_ACTION}</Text>
                  </Pressable>
                </FormRow>
                {ended && (
                  <Text variant="caption" color="inkMuted" style={{ paddingLeft: ROW_CONTENT_INSET }}>{ENDED_NOTE}</Text>
                )}
              </FormSection>

              <FormActions
                onCancel={close}
                onSubmit={() => setSaveConfirmOpen(true)}
                submitting={false}
                submitLabel="保存"
                disabled={ended || busy || saveConfirmOpen || recurrence === null || endsOnInvalid}
              />
            </Stack>
          )}
        </Stack>
        </>}
      </RouteWindow>
  );
}
