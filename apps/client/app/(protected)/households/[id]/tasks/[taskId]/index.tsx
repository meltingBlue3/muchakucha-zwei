import { useTranslation } from '../../../../../../src/i18n';
import { notifyContentChanged, useContentChanges } from '../../../../../../src/features/content/content-changes';
import { TaskWindow } from '../../../../../../src/features/tasks/task-window';
import { rememberRouteTrigger } from '../../../../../../src/platform/overlays/route-trigger';
import { isEditConflict } from '../../../../../../src/ui/edit-conflict';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { GetHouseholdMemberDto, TaskResponseDto } from '@muchakucha/api-client';

import { ApiClientError } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { useCurrentUser } from '../../../../../../src/features/auth/use-current-user';
import { ReminderDetailField } from '../../../../../../src/features/reminders/reminder-detail';
import { DEFAULT_REMINDER, isOwnTask } from '../../../../../../src/features/reminders/reminder-rules';
import { formatDate, formatDateTime, toDateValue, toTimeValue } from '../../../../../../src/ui/date-values';
import { LabelChip } from '../../../../../../src/features/labels/label-chip';
import { recurrenceInputFromResponse } from '../../../../../../src/features/recurrence/recurrence-options';
import { formatRecurrenceSummary } from '../../../../../../src/features/recurrence/recurrence-summary';
import { formatDueDate, isOverdue, priorityLabel, statusLabel } from '../../../../../../src/features/tasks/task-utils';
import { DetailField, DetailPanel, DetailEditButton } from '../../../../../../src/ui/detail-fields';
import { Banner, Button, Chip, Heading, LoadError, LoadingState, Stack, Text } from '../../../../../../src/ui/primitives';
import { AnchoredPopover } from '../../../../../../src/ui/anchored-popover';
import { CheckCircle } from '../../../../../../src/ui/check-circle';
import { MemberAvatar } from '../../../../../../src/ui/member-avatar';
import { completionActionLabel } from '../../../../../../src/features/tasks/task-completion';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import { useDesktop } from '../../../../../../src/ui/use-desktop';
import type { Theme } from '../../../../../../src/ui/theme';

function currentTimeZone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

export default function TaskDetailRoute() {
  const { t } = useTranslation(['tasks', 'shared', 'auth', 'navigation', 'editConflict']);
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const desktop = useDesktop();
  const userId = useCurrentUser()?.id ?? '';
  const [task, setTask] = useState<TaskResponseDto | null>(null);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'detailLoadError' | null>(null);

  const fetchTask = useCallback(async () => {
    if (id === undefined || taskId === undefined) return;
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      const [taskResult, householdResult] = await Promise.all([
        sessionApiClient.getTask(token, id, taskId),
        sessionApiClient.getHousehold(token, id),
      ]);
      setTask(taskResult);
      setMembers(householdResult.members);
    } catch {
      setError('detailLoadError');
    } finally {
      setLoading(false);
    }
  }, [id, taskId]);

  // Refetch whenever this screen regains focus (e.g. returning from the
  // edit screen), not just on first mount — otherwise a save doesn't show
  // up here until the whole route remounts.
  useFocusEffect(
    useCallback(() => {
      void fetchTask();
    }, [fetchTask]),
  );

  useContentChanges(id, fetchTask);

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<'auth:errors.sessionExpired' | 'statusConflict' | 'statusDenied' | 'statusFailed' | null>(null);

  // 进行中 lives here rather than on the card: it is a deliberate stage, not a
  // step on the way to done, and putting it in the list's completion control
  // made finishing a task take two taps.
  const writeStatus = useCallback(async (next: 'pending' | 'in_progress' | 'completed') => {
    if (id === undefined || taskId === undefined || task === null) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setStatusError('auth:errors.sessionExpired');
        return;
      }
      await sessionApiClient.updateTask(token, id, taskId, {
        status: next,
        expectedUpdatedAt: task.updatedAt,
        ...(task.recurrence ? { expectedRuleUpdatedAt: task.recurrence.updatedAt } : {}),
      });
      notifyContentChanged(id, fetchTask);
      await fetchTask();
    } catch (caught: unknown) {
      setStatusError(
        isEditConflict(caught) ? 'statusConflict' : caught instanceof ApiClientError && caught.status === 403
          ? 'statusDenied'
          : 'statusFailed',
      );
      if (isEditConflict(caught)) await fetchTask();
    } finally {
      setStatusBusy(false);
    }
  }, [id, taskId, task, fetchTask]);

  const handleEdit = useCallback(() => {
    rememberRouteTrigger();
    void router.push(`/households/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/edit`);
  }, [router, id, taskId]);

  if (loading || task === null || error !== null) {
    return <TaskWindow title={t('detail')} busy={statusBusy}>
      <Stack gap={4}>
        {loading ? <LoadingState label={t('loading')} /> : <>
          <LoadError message={t(error ?? 'notFound')} onRetry={() => void fetchTask()} />
        </>}
      </Stack>
    </TaskWindow>;
  }

  const assignees = (task.assigneeIds ?? []).map((uid) => ({ id: uid, name: members.find((m) => m.userId === uid)?.displayName ?? t('unknownMember') }));
  const assigneeNames = (task.assigneeIds ?? []).map(
    (uid) => members.find((m) => m.userId === uid)?.displayName ?? t('unknownMember'),
  );
  const cancelled = task.status === 'cancelled';
  const overdue = isOverdue(task.dueDate ?? null) && task.status !== 'completed' && !cancelled;
  const recurrence = recurrenceInputFromResponse(task.recurrence);
  const recurrenceSummary =
    recurrence === null
      ? null
      : formatRecurrenceSummary(recurrence, currentTimeZone(recurrence.timezone));

  const completion = !cancelled ? <Button label={task.status === 'completed' ? t('markIncomplete') : t('markComplete')} {...(desktop ? { size: 'compact' as const, icon: (color: string) => task.status === 'completed' ? null : <Check size={activeTheme.controlSizes.icon - 5} color={color} strokeWidth={activeTheme.focus.width} /> } : {})} loading={statusBusy} onPress={() => void writeStatus(task.status === 'completed' ? 'pending' : 'completed')} /> : null;
  // 编辑 sits in the title bar like 保存 in the edit window. On a phone the footer keeps the one status action;
  // in the wide detail pane it sits under the title, beside the status it changes.
  const footer = !desktop && (!cancelled || statusError) ? (
    <Stack gap={2}>
      {statusError ? <Banner>{t(statusError)}</Banner> : null}
      {completion}
    </Stack>
  ) : null;
  return (
    <TaskWindow title={t('detail')} busy={statusBusy} footer={footer} headerActions={<DetailEditButton accessibilityLabel={t('edit')} disabled={statusBusy} onPress={handleEdit} />}>
      <Stack gap={desktop ? 4 : 5}>
        {desktop ? <Stack gap={3}>
          {/* The wide pane follows the list row: completion mark, title, then the status it changes. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: activeTheme.spacing[2] }}>
            {!cancelled ? <View style={{ marginTop: (activeTheme.typography.paneTitle.lineHeight - activeTheme.layout.desktopControl) / 2 }}><CheckCircle state={task.status === 'completed' ? 'done' : 'open'} attention={overdue} accessibilityLabel={completionActionLabel(task.status)} disabled={statusBusy} busy={statusBusy} onPress={() => void writeStatus(task.status === 'completed' ? 'pending' : 'completed')} /></View> : null}
            <Heading level={2} style={[activeTheme.typography.paneTitle, { flex: 1, textDecorationLine: task.status === 'completed' ? 'line-through' : 'none' }]}>{task.title}</Heading>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[2], paddingLeft: cancelled ? 0 : activeTheme.layout.desktopControl + activeTheme.spacing[2] }}>
            {completion}
            {cancelled ? <Text variant="label" color="inkMuted">{t('status.cancelled')}</Text> : task.status !== 'completed' ? <TaskStatusMenu status={task.status === 'in_progress' ? 'in_progress' : 'pending'} busy={statusBusy} onChange={(next) => void writeStatus(next)} /> : <Text variant="meta" color="success">{t('status.completed')}</Text>}
          </View>
          {statusError ? <Banner>{t(statusError)}</Banner> : null}
        </Stack> : <Stack gap={2}>
          <Heading level={2}>{task.title}</Heading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[2] }}>
            <Text variant="label" color={task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'ink' : 'inkMuted'}>{cancelled ? t('status.cancelled') : statusLabel(task.status)}</Text>
            {overdue ? <Text variant="label" color="destructive">{t('overdueStatus')}</Text> : null}
            {/* 进行中 is a deliberate stage, offered beside the status it changes rather than behind a "more" toggle. */}
            {!cancelled && task.status !== 'completed' ? (
              <Pressable accessibilityRole="button" accessibilityLabel={task.status === 'in_progress' ? t('returnPending') : t('markInProgress')} disabled={statusBusy} onPress={() => void writeStatus(task.status === 'in_progress' ? 'pending' : 'in_progress')} style={{ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', marginLeft: 'auto' }}>
                <Text variant="label" color={statusBusy ? 'inkMuted' : 'link'}>{task.status === 'in_progress' ? t('returnPending') : t('markInProgress')}</Text>
              </Pressable>
            ) : null}
          </View>
        </Stack>}
        <DetailPanel>
          <DetailField label={desktop ? t('due') : t('editConflict:dueDate')} value={desktop && task.dueDate ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[2] }}><Text variant="bodySm" color={overdue ? 'destructive' : 'ink'}>{formatDateTime(new Date(task.dueDate), { weekday: true }).replace(/ 00:00$/, '')}</Text>{overdue ? <Chip tone="accent">{t('overdueStatus')}</Chip> : toDateValue(new Date(task.dueDate)) === toDateValue(new Date()) ? <Chip tone="accent">{t('today')}</Chip> : null}</View> : task.dueDate ? formatDueDate(task.dueDate) : t('unset')} urgent={overdue} />
          {/* A finished task reminds nobody, so it shows no reminder. */}
          {task.dueDate && (task.status === 'pending' || task.status === 'in_progress') ? (
            <ReminderDetailField
              kind="task"
              householdId={task.householdId}
              anchor={task.dueDate}
              dateOnly={toTimeValue(new Date(task.dueDate)) === '00:00'}
              own={isOwnTask(task, userId)}
              choice={task.myReminder ?? DEFAULT_REMINDER}
            />
          ) : null}
          <DetailField label={t('shared:assignee')} value={desktop && assignees.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: activeTheme.spacing[3], rowGap: activeTheme.spacing[1] }}>{assignees.map(member => <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1] + 2 }}><MemberAvatar id={member.id} name={member.name} size="sm" /><Text variant="bodySm" color="ink">{member.name}</Text></View>)}</View> : assigneeNames.join('、') || t('unassigned')} />
          <DetailField label={t('editConflict:priority')} value={priorityLabel(task.priority)} urgent={task.priority === 'urgent'} />
          {recurrenceSummary ? <DetailField label={desktop ? t('editConflict:repeat') : t('navigation:pages.recurrence-rules')} value={recurrenceSummary.summary} notes={[
            recurrenceSummary.clampNote,
            recurrenceSummary.timeZoneNote,
            cancelled ? t('cancelledRecurrence') : t('occurrenceDetail'),
          ]} /> : desktop ? <DetailField label={t('editConflict:repeat')} value={<Text variant="bodySm" color="inkMuted">{t('noRecurrence')}</Text>} /> : null}
          {desktop && (task.labels ?? []).length ? <DetailField label={t('editConflict:labels')} value={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>{task.labels?.map(label => <LabelChip key={label.id} label={label} small />)}</View>} /> : null}
        </DetailPanel>
        {task.description ? <Stack gap={desktop ? 1 : 2} style={desktop ? { borderTopWidth: activeTheme.borderWidths.default, borderTopColor: activeTheme.colors.separator, paddingTop: activeTheme.spacing[4] } : undefined}><Text variant={desktop ? 'meta' : 'label'} color={desktop ? 'inkFaint' : 'inkMuted'}>{t('description')}</Text><Text {...(desktop ? { variant: 'bodySm' as const, color: 'ink' as const } : {})}>{task.description}</Text></Stack> : null}
        {!desktop && (task.labels ?? []).length ? <Stack gap={2}>
          <Text variant="label" color="inkMuted">{t('editConflict:labels')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>{task.labels?.map(label => <LabelChip key={label.id} label={label} />)}</View>
        </Stack> : null}
        {desktop ? <Text variant="caption" color="inkFaint" style={{ fontWeight: '400', borderTopWidth: activeTheme.borderWidths.default, borderTopColor: activeTheme.colors.separator, paddingTop: activeTheme.spacing[3] }}>{t('metadata', {
          creator: members.find(m => m.userId === task.createdBy)?.displayName ?? t('creatorFallback'),
          created: formatDate(new Date(task.createdAt)),
          updated: formatDateTime(new Date(task.updatedAt)),
        })}</Text> : null}
      </Stack>
    </TaskWindow>
  );
}


/** 待办 ⌄ beside 标记为完成: the two open stages a task can be moved between. */
function TaskStatusMenu({ status, busy, onChange }: { status: 'pending' | 'in_progress'; busy: boolean; onChange(next: 'pending' | 'in_progress'): void }) {
  const { t } = useTranslation('tasks');
  const activeTheme = useTheme<Theme>();
  const trigger = useRef<View>(null);
  const [open, setOpen] = useState(false);
  return <>
    <Button ref={trigger} label={statusLabel(status)} accessibilityLabel={t('changeStatusName', { label: statusLabel(status) })} aria-haspopup="menu" tone="secondary" size="compact" expanded={open} disabled={busy} trailingIcon={(color) => <ChevronDown size={activeTheme.controlSizes.icon - 6} color={color} strokeWidth={activeTheme.controlSizes.iconStroke} />} onPress={() => setOpen(true)} />
    {open ? <AnchoredPopover title={t('changeStatus')} trigger={trigger} width={activeTheme.layout.accountMenuWidth} onClose={() => setOpen(false)}>
      <Stack gap={1}>{(['pending', 'in_progress'] as const).map(option => <Pressable key={option} accessibilityRole="button" accessibilityLabel={statusLabel(option)} accessibilityState={{ selected: option === status }} onPress={() => { setOpen(false); if (option !== status) onChange(option); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: activeTheme.layout.desktopControl, paddingHorizontal: activeTheme.spacing[2], borderRadius: activeTheme.borderRadii.sm, backgroundColor: pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.transparent })}>
        <Text variant="bodySm" color="ink">{statusLabel(option)}</Text>
        {option === status ? <Check size={activeTheme.controlSizes.icon - 4} color={activeTheme.colors.ink} strokeWidth={activeTheme.focus.width} /> : null}
      </Pressable>)}</Stack>
    </AnchoredPopover> : null}
  </>;
}
