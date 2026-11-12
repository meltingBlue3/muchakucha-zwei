import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import { ApiClientError, type RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { ageOn } from '../../../../../../src/features/birthdays/birthday-dates';
import { notifyContentChanged } from '../../../../../../src/features/content/content-changes';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { RecurrenceKindBadge } from '../../../../../../src/features/recurrence/recurrence-kind-badge';
import RecurrenceListScreen from '../../../../../../src/features/recurrence/recurrence-list-screen';
import { recurrencePreview } from '../../../../../../src/features/recurrence/recurrence-preview';
import { formatRuleRow } from '../../../../../../src/features/recurrence/recurrence-rule-row';
import { rememberRouteTrigger } from '../../../../../../src/platform/overlays/route-trigger';
import { formatDate, parseDateValue, toDateValue } from '../../../../../../src/ui/date-values';
import { DetailEditButton, DetailField, DetailPanel } from '../../../../../../src/ui/detail-fields';
import { AccessChangedPanel, AppShell } from '../../../../../../src/ui/household-components';
import { Banner, Chip, ConfirmActions, Heading, LoadError, LoadingState, Stack, Text } from '../../../../../../src/ui/primitives';
import { RouteWindow, useRouteWindowClose } from '../../../../../../src/ui/route-window';
import type { Theme } from '../../../../../../src/ui/theme';
import { useDesktop } from '../../../../../../src/ui/use-desktop';
import { useMinuteClock } from '../../../../../../src/ui/use-minute-clock';

const LOAD_ERROR = '无法加载这条重复安排，请检查网络连接后重试。';
// One copy for every 404 cause (T-07-46): it says only what is true from the
// user's side, that they cannot see the rule.
const NOT_FOUND_ERROR = '这条重复安排不存在，或者你已经看不到它了。';
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

const pad = (value: number) => String(value).padStart(2, '0');

/** 16:30–17:30 for a timed event, 20:00 for a task, 全天 for an all-day event; null when a task has no time. */
function timeOf(rule: RecurrenceRuleListItemDto): string | null {
  if (!rule.startTimeLocal) return rule.kind === 'event' ? '全天' : null;
  const start = rule.startTimeLocal.slice(0, 5);
  if (rule.kind !== 'event' || !rule.durationMinutes) return start;
  const [hours = 0, minutes = 0] = start.split(':').map(Number);
  const end = hours * 60 + minutes + rule.durationMinutes;
  return `${start}–${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`;
}

/**
 * 重复安排详情: what the rule is and when it falls next, read before anything
 * is changed. 编辑 in the title bar opens the editor; 结束此重复 sits at the
 * foot and asks first, in the same window. An ended rule offers neither.
 */
export default function RecurrenceRuleDetailRoute() {
  const desktop = useDesktop();
  const { id, ruleId } = useLocalSearchParams<{ id: string; ruleId: string }>();
  const router = useRouter();
  const exitAllowed = useRef(false);
  const { close: dismiss } = useRouteWindowClose('recurrence-rules');
  const activeTheme = useTheme<Theme>();
  const todayIso = toDateValue(useMinuteClock().date);
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
  } = useHouseholdContext();

  const [rule, setRule] = useState<RecurrenceRuleListItemDto | null>(null);
  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const householdId = id ?? currentHouseholdId;
  const deviceTimeZone = resolveDeviceTimeZone();

  const fetchRule = useCallback(async () => {
    if (householdId === undefined || householdId === '' || ruleId === undefined || ruleId === '') return;
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      setRule(await sessionApiClient.getRecurrenceRule(token, householdId, ruleId));
      loadedOnce.current = true;
    } catch (caught: unknown) {
      setError(caught instanceof ApiClientError && caught.status === 404 ? NOT_FOUND_ERROR : LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [householdId, ruleId]);

  // Coming back from the editor re-reads the rule it just saved.
  useFocusEffect(useCallback(() => { void fetchRule(); }, [fetchRule]));

  const handleEdit = useCallback(() => {
    if (householdId === undefined || householdId === '' || ruleId === undefined) return;
    rememberRouteTrigger();
    router.push(`/households/${encodeURIComponent(householdId)}/recurrence-rules/${encodeURIComponent(ruleId)}/edit`);
  }, [householdId, ruleId, router]);

  // Only the confirm action writes; 结束此重复 merely opens the question.
  const handleConfirmEnd = useCallback(async () => {
    if (householdId === undefined || householdId === '' || ruleId === undefined || ruleId === '') return;
    setEnding(true);
    setEndError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setEndError(END_ERROR);
        return;
      }
      await sessionApiClient.endRecurrenceRule(token, householdId, ruleId);
      setEndConfirmOpen(false);
      // The list keeps the rule and says it has ended; nothing is guessed on the way out.
      notifyContentChanged(householdId);
      exitAllowed.current = true;
      dismiss();
    } catch (caught: unknown) {
      setEndError(caught instanceof ApiClientError && caught.status === 403 ? END_FORBIDDEN : END_ERROR);
    } finally {
      setEnding(false);
    }
  }, [householdId, ruleId, dismiss]);

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

  const formatted = rule === null ? null : formatRuleRow(rule, deviceTimeZone);
  const ended = formatted?.ended ?? false;
  const writable = rule !== null && !ended;
  const close = () => {
    if (endConfirmOpen) { setEndConfirmOpen(false); setEndError(null); } else dismiss();
  };
  // A phone asks in a compact dialog; the wide pane keeps its place and asks inside it.
  const size = endConfirmOpen && !desktop ? 'standard' : 'editor';
  const footer = writable && !endConfirmOpen ? (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={END_ACTION}
        disabled={ending}
        onPress={() => { setEndError(null); setEndConfirmOpen(true); }}
        style={({ pressed }) => ({ minHeight: desktop ? activeTheme.layout.desktopControl : activeTheme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: activeTheme.spacing[2], marginLeft: -activeTheme.spacing[2], borderRadius: activeTheme.borderRadii.md, backgroundColor: pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.transparent })}
      >
        <Text variant="label" color="destructive">{END_ACTION}</Text>
      </Pressable>
    </View>
  ) : undefined;

  return (
    <RouteWindow
      resource="recurrence-rules"
      size={size}
      title={endConfirmOpen ? '结束重复安排' : '重复安排详情'}
      busy={ending}
      onClose={close}
      onBackStep={endConfirmOpen ? close : undefined}
      exitAllowed={exitAllowed}
      fallback={<RecurrenceListScreen />}
      {...(footer ? { footer } : {})}
      {...(writable && !endConfirmOpen ? { headerActions: <DetailEditButton accessibilityLabel="编辑重复安排" disabled={ending} onPress={handleEdit} /> } : {})}
    >
      {endConfirmOpen ? <Stack gap={3}>
        <Text>{END_CONFIRM_PROMPT}</Text>
        {endError ? <Banner>{endError}</Banner> : null}
        <ConfirmActions confirmLabel="确认结束" destructive busy={ending} onCancel={close} onConfirm={() => { void handleConfirmEnd(); }} />
      </Stack> : <Stack gap={desktop ? 4 : 5}>
        {loading ? <LoadingState label="正在加载重复安排" /> : null}
        {error !== null ? <LoadError message={error} onRetry={() => void fetchRule()} /> : null}
        {rule !== null && formatted !== null ? <>
          <Stack gap={2}>
            {rule.kind !== null ? <View style={{ alignSelf: 'flex-start' }}><RecurrenceKindBadge kind={rule.kind} /></View> : null}
            {/* Never truncated: the title is the rule's identity. */}
            <Heading level={2} style={desktop ? activeTheme.typography.paneTitle : undefined}>{rule.title}</Heading>
          </Stack>
          <RuleFields rule={rule} summary={formatted.summary} notes={[formatted.clampNote, formatted.timeZoneNote]} ended={ended} todayIso={todayIso} />
          {ended ? <Text color="inkMuted">{ENDED_NOTE}</Text> : <Upcoming rule={rule} todayIso={todayIso} />}
        </> : null}
      </Stack>}
    </RouteWindow>
  );
}

function RuleFields({ rule, summary, notes, ended, todayIso }: { rule: RecurrenceRuleListItemDto; summary: string; notes: Array<string | null>; ended: boolean; todayIso: string }) {
  const activeTheme = useTheme<Theme>();
  const desktop = useDesktop();
  const time = timeOf(rule);
  const next = rule.nextOccurrenceDate;
  const age = next && rule.occasion === 'birthday' ? ageOn(rule, next) : null;
  const nextValue = ended || !next ? '已结束' : (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[2] }}>
      {/* The same size as the plain values beside it: smaller in the wide pane only. */}
      <Text variant={desktop ? 'bodySm' : 'body'} color="ink">{`${formatDate(parseDateValue(next), { weekday: true })}${age === null ? '' : ` · ${age} 岁`}`}</Text>
      {next === todayIso ? <Chip tone="accent">今天</Chip> : null}
    </View>
  );
  return (
    <DetailPanel>
      <DetailField label="重复规则" value={summary} notes={notes} />
      {time ? <DetailField label="时间" value={time} /> : null}
      <DetailField label="开始" value={formatDate(parseDateValue(rule.startsOn))} />
      <DetailField label="下一次" value={nextValue} />
      {rule.occasion === 'birthday' && rule.birthYear !== null ? <DetailField label="出生年份" value={`${rule.birthYear} 年`} /> : null}
    </DetailPanel>
  );
}

/** The next few dates under the current rule, so a change can be checked before it is made. */
function Upcoming({ rule, todayIso }: { rule: RecurrenceRuleListItemDto; todayIso: string }) {
  const activeTheme = useTheme<Theme>();
  const desktop = useDesktop();
  const dates = recurrencePreview(rule);
  if (dates.length === 0) return null;
  const time = rule.startTimeLocal ? ` ${rule.startTimeLocal.slice(0, 5)}` : '';
  return (
    <Stack gap={2} style={desktop ? { borderTopWidth: activeTheme.borderWidths.default, borderTopColor: activeTheme.colors.separator, paddingTop: activeTheme.spacing[4] } : undefined}>
      <Text variant={desktop ? 'meta' : 'label'} color={desktop ? 'inkFaint' : 'inkMuted'}>{`接下来 ${dates.length} 次`}</Text>
      {dates.map(date => (
        <View key={date} style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[2] }}>
          <Text variant="time" color="ink">{`${formatDate(parseDateValue(date), { weekday: true })}${time}`}</Text>
          {date === todayIso ? <Chip tone="accent">今天</Chip> : null}
        </View>
      ))}
      <Text variant="caption" color="inkFaint" style={{ fontWeight: '400' }}>{`按当前规则推算 · ${rule.timezone}`}</Text>
    </Stack>
  );
}
