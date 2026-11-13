import { i18n, useTranslation } from '../../i18n';
import { zh } from '../../i18n/locales/zh';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { AssistantConversationResponseDto } from '@muchakucha/api-client';
import Check from 'lucide-react-native/icons/check';
import { sessionApiClient } from '../auth/session-runtime';
import { Banner, Button, ConfirmActions, Heading, Inline, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { DetailField } from '../../ui/detail-fields';
import { formatDate, formatDateTime, weekdayName } from '../../ui/date-values';
import { theme } from '../../ui/theme';
import { formatDueDate } from '../tasks/task-utils';
import { formatLunarAnchor } from '../lunar/lunar-recurrence';
import { changedLines, suspiciousShrink, type ChangedLine } from './action-changes';
import { useAssistantQuery } from './assistant-runtime';

type PendingAction = AssistantConversationResponseDto['pendingActions'][number];
type Target = {
  title: string; updatedAt?: string; description?: string | null; body?: string | null; startTime?: string; endTime?: string; dueDate?: string | null;
  allDay?: boolean; location?: string | null; status?: string; priority?: string; assigneeIds?: string[]; labels?: Array<{ id: string; name: string }>;
  color?: string; recurrence?: { updatedAt: string } | null;
};
export interface ActionPreviewContext { target: Target | null; labels: Record<string, string>; members: Record<string, string> }
export interface ActionField {
  label: string; value: string;
  /** The current value, when an edit changes it. */
  before?: string;
  /** Line changes of a text edit; null when the text is too long to compare. */
  changes?: ChangedLine[] | null;
  /** Characters a text edit drops when it shrinks suspiciously. */
  shrunk?: number | null;
}

const hiddenFields = new Set(['id', 'expectedUpdatedAt', 'expectedRuleUpdatedAt', 'expectedName', 'expectedColor']);
const dateFields = new Set(['startTime', 'endTime', 'dueDate', 'startsOn', 'endsOn']);
const enumFields = new Set(['status', 'priority', 'freq', 'occasion']);
const textFields = new Set(['description', 'body']);
// Lines shown per text change; the rest are summarized as a count.
const SHOWN_CHANGED_LINES = 40;

function currentValue(key: string, target: Target): unknown {
  if (key === 'name') return target.title;
  if (key === 'labelIds') return target.labels?.map(label => label.id);
  return (target as Record<string, unknown>)[key];
}

function fieldName(key: string): string {
  const fields = zh.assistant.fields;
  return Object.hasOwn(fields, key) ? i18n.t(`assistant:fields.${key as keyof typeof fields}`) : key;
}

function valueText(key: string, value: unknown, context: ActionPreviewContext): string {
  if (value === null || value === '') return i18n.t('assistant:preview.cleared');
  if (typeof value === 'boolean') return value ? i18n.t('assistant:preview.yes') : i18n.t('assistant:preview.no');
  if (Array.isArray(value)) {
    if (!value.length) return i18n.t('assistant:preview.none');
    if (key === 'byWeekday') return value.map(day => Number.isInteger(Number(day)) && Number(day) >= 0 && Number(day) < 7 ? i18n.t('dates:weekday', { name: weekdayName(Number(day)) }) : String(day)).join('、');
    if (key === 'labelIds') return value.map(id => context.labels[String(id)] ?? i18n.t('assistant:preview.unknownLabel')).join('、');
    if (key === 'assigneeIds') return value.map(id => context.members[String(id)] ?? i18n.t('assistant:preview.unknownMember')).join('、');
    return value.map(item => valueText(key, item, context)).join('、');
  }
  if (key === 'lunar' && typeof value === 'object' && typeof (value as { month?: unknown }).month === 'number' && typeof (value as { day?: unknown }).day === 'number') {
    return i18n.t('assistant:preview.lunar', { date: formatLunarAnchor(value as { month: number; day: number }) });
  }
  if (key === 'birthYear' && typeof value === 'number') return i18n.t('assistant:preview.birthYear', { year: value });
  if (typeof value === 'object') return Object.entries(value).map(([childKey, item]) => `${fieldName(childKey)}：${valueText(childKey, item, context)}`).join('\n');
  if (typeof value === 'string') {
    if (key === 'dueDate' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDueDate(value) || value;
    if (dateFields.has(key) && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))) return formatDateTime(new Date(value));
    if (dateFields.has(key) && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(new Date(`${value}T12:00:00`));
    const values = zh.assistant.values;
    return enumFields.has(key) && Object.hasOwn(values, value) ? i18n.t(`assistant:values.${value as keyof typeof values}`) : value;
  }
  return String(value);
}

export function assistantActionDetails(action: PendingAction, context: ActionPreviewContext) {
  const [verb = '', resource = ''] = action.name.split('_');
  const supported = (verb === 'create' || verb === 'update' || verb === 'delete')
    && (resource === 'event' || resource === 'task' || resource === 'note' || resource === 'label') && action.name === `${verb}_${resource}`;
  const stale = context.target !== null && (
    (typeof action.arguments.expectedUpdatedAt === 'string' && context.target.updatedAt !== action.arguments.expectedUpdatedAt) ||
    (typeof action.arguments.expectedRuleUpdatedAt === 'string' && context.target.recurrence?.updatedAt !== action.arguments.expectedRuleUpdatedAt) ||
    (typeof action.arguments.expectedName === 'string' && context.target.title !== action.arguments.expectedName) ||
    (typeof action.arguments.expectedColor === 'string' && context.target.color !== action.arguments.expectedColor)
  );
  const target = verb === 'update' ? context.target : null;
  // The target's own labels name the ones an edit removes, even when the household list was not loaded.
  const named = target?.labels ? { ...context, labels: { ...Object.fromEntries(target.labels.map(label => [label.id, label.name])), ...context.labels } } : context;
  const fields = Object.entries(action.arguments).filter(([key]) => !hiddenFields.has(key)).map(([key, value]): ActionField => {
    const field: ActionField = { label: fieldName(key), value: valueText(key, value, context) };
    if (!target) return field;
    const current = currentValue(key, target);
    if (textFields.has(key) && typeof value === 'string') {
      const before = typeof current === 'string' ? current : '';
      return before === value ? field : { ...field, before: before || i18n.t('assistant:preview.none'), changes: changedLines(before, value), shrunk: suspiciousShrink(before, value) };
    }
    const before = current === undefined || current === null || current === '' || (Array.isArray(current) && !current.length) ? i18n.t('assistant:preview.none') : valueText(key, current, named);
    return before === field.value ? field : { ...field, before };
  });
  const unresolved = ['labelIds', 'assigneeIds'].some(key => {
    const ids = action.arguments[key];
    const dictionary = key === 'labelIds' ? context.labels : context.members;
    return Array.isArray(ids) && ids.some(id => !dictionary[String(id)]);
  });
  return { title: supported ? i18n.t(`assistant:verbs.${verb}`, { resource: i18n.t(`assistant:resources.${resource}`) }) : i18n.t('assistant:preview.untitled'), destructive: verb === 'delete', supported, stale, unresolved, fields };
}

/** A text edit as the lines it removes and adds, so lost content is visible before it is confirmed. */
function TextChange({ field }: { field: ActionField }) {
  const changes = field.changes ?? null;
  const { t } = useTranslation('assistant');
  const removed = changes?.filter(line => line.kind === 'removed').length ?? 0;
  const added = changes?.filter(line => line.kind === 'added').length ?? 0;
  return <Stack gap={1}>
    <Text variant="label" color="inkMuted">{field.label}</Text>
    {changes === null ? <Text>{field.value}</Text> : <>
      <Text variant="caption" color="inkMuted">{t('preview.changes', { removed, added })}</Text>
      {changes.slice(0, SHOWN_CHANGED_LINES).map((line, index) => <Text key={index} selectable variant="bodySm" color={line.kind === 'removed' ? 'destructive' : 'success'}>
        {line.kind === 'removed' ? '－ ' : '＋ '}{line.text || t('preview.blank')}
      </Text>)}
      {changes.length > SHOWN_CHANGED_LINES ? <Text variant="caption" color="inkMuted">{t('preview.moreChanges', { count: changes.length - SHOWN_CHANGED_LINES })}</Text> : null}
    </>}
    {field.shrunk ? <Text variant="bodySm" color="destructive">{t('preview.shrunk', { count: field.shrunk })}</Text> : null}
  </Stack>;
}

/** A checkbox row choosing whether one proposal of a batch runs. */
function ActionChoice({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} aria-checked={checked} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget, borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
    <View style={{ width: theme.spacing[6], height: theme.spacing[6], alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.sm, borderWidth: theme.borderWidths.default,
      borderColor: disabled ? theme.colors.disabled : checked ? theme.colors.primary : theme.colors.border, backgroundColor: checked ? theme.colors.primary : theme.colors.surface }}>
      {checked ? <Check size={theme.controlSizes.icon} color={theme.colors.surface} strokeWidth={theme.controlSizes.iconStroke} /> : null}
    </View>
    <Text variant="label" color={disabled ? 'inkMuted' : 'ink'} style={{ flex: 1 }}>{label}</Text>
  </Pressable>;
}

/** One proposal, read against its current target. It reports whether it can be approved as it stands. */
function ActionItem({ householdId, action, position, choice, busy, onReady }: {
  householdId: string; action: PendingAction; busy: boolean;
  /** Its place in a batch; absent for a lone proposal. */
  position?: number;
  choice?: { checked: boolean; onToggle(): void };
  onReady(id: string, ready: boolean): void;
}) {
  const { t } = useTranslation('assistant');
  const load = useCallback(async (token: string): Promise<ActionPreviewContext> => {
    const [verb, resource] = action.name.split('_');
    const targetId = action.arguments.id;
    const targetRequest = async (): Promise<Target | null> => {
      if (verb === 'create') return null;
      if (typeof targetId !== 'string') throw new Error('missing target');
      if (resource === 'event') return sessionApiClient.getEvent(token, householdId, targetId);
      if (resource === 'task') return sessionApiClient.getTask(token, householdId, targetId);
      if (resource === 'note') return sessionApiClient.getNote(token, householdId, targetId);
      if (resource === 'label') {
        const result = await sessionApiClient.listLabels(token, householdId);
        const label = result.labels.find(item => item.id === targetId);
        if (!label) throw new Error('missing label');
        return { title: label.name, color: label.color };
      }
      throw new Error('unsupported target');
    };
    const [target, labels, household] = await Promise.all([
      targetRequest(),
      Array.isArray(action.arguments.labelIds) && action.arguments.labelIds.length ? sessionApiClient.listLabels(token, householdId) : Promise.resolve(null),
      // An edit also names the assignees it replaces.
      Array.isArray(action.arguments.assigneeIds) && (action.arguments.assigneeIds.length || verb === 'update') ? sessionApiClient.getHousehold(token, householdId) : Promise.resolve(null),
    ]);
    return { target, labels: Object.fromEntries(labels?.labels.map(label => [label.id, label.name]) ?? []), members: Object.fromEntries(household?.members.map(member => [member.userId, member.displayName]) ?? []) };
  }, [householdId, action]);
  const query = useAssistantQuery(load);
  const details = assistantActionDetails(action, query.data ?? { target: null, labels: {}, members: {} });
  const ready = query.data !== null && !query.loading && query.error === null && !details.stale && !details.unresolved && details.supported;
  useEffect(() => { onReady(action.id, ready); }, [action.id, ready, onReady]);
  const subject = typeof action.arguments.title === 'string' ? action.arguments.title : query.data?.target?.title;
  return <Stack gap={4}>
    {position !== undefined && choice ? <ActionChoice label={`${position}. ${details.title}${subject ? `：${subject}` : ''}`} checked={choice.checked && ready} disabled={busy || !ready} onPress={choice.onToggle} />
      : <Heading variant="section">{t('preview.heading', { title: details.title })}</Heading>}
    {query.loading && !query.data ? <LoadingState label={t('preview.checking')} /> : null}
    {query.error ? <LoadError message={t('preview.checkError')} retrying={query.loading} disabled={busy} onRetry={() => { void query.reload(); }} /> : null}
    {/* Short facts take one line each, name beside value, so a proposal fits a phone sheet. */}
    {query.data?.target ? <Stack gap={2}>
      <DetailField label={t('preview.target')} value={query.data.target.title} />
      {query.data.target.recurrence ? <Text variant="bodySm">{t('preview.onlyOccurrence')}</Text> : null}
      {details.destructive ? <>
        {query.data.target.startTime ? <DetailField label={t('fields.startTime')} value={formatDateTime(new Date(query.data.target.startTime))} /> : null}
        {query.data.target.dueDate ? <DetailField label={t('fields.dueDate')} value={formatDueDate(query.data.target.dueDate)} /> : null}
        {query.data.target.description || query.data.target.body ? <DetailField label={t('preview.currentContent')} value={query.data.target.description ?? query.data.target.body ?? ''} /> : null}
      </> : null}
    </Stack> : null}
    {details.fields.length ? <Stack gap={2}>
      {details.fields.map(field => field.changes !== undefined ? <TextChange key={field.label} field={field} />
        : <DetailField key={field.label} label={field.label} value={field.value} notes={field.before === undefined ? [] : [t('preview.before', { value: field.before })]} />)}
    </Stack> : null}
    {details.stale ? <Banner>{t('preview.stale')}</Banner> : null}
    {details.unresolved ? <Banner>{t('preview.unresolved')}</Banner> : null}
    {!details.supported ? <Banner>{t('preview.unsupported')}</Banner> : null}
    {details.destructive ? <Text color="destructive" variant="bodySm">{t('preview.cannotUndo')}</Text> : null}
  </Stack>;
}

/**
 * Proposals awaiting confirmation. A batch lists every item with a checkbox; only checked items that
 * still match their target run, and the rest are declined. `onDecide([])` declines them all.
 */
export function AssistantActionsPreview({ householdId, actions, busy, disabled = false, onDecide, onAdjust }: {
  householdId: string; actions: PendingAction[]; busy: boolean; disabled?: boolean; onDecide: (approvedIds: string[]) => void; onAdjust?: () => void;
}) {
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set());
  const { t } = useTranslation('assistant');
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const onReady = useCallback((id: string, value: boolean) => setReady(current => current[id] === value ? current : { ...current, [id]: value }), []);
  const batch = actions.length > 1;
  const chosen = actions.filter(action => !unchecked.has(action.id) && ready[action.id] === true);
  // A lone deletion keeps its warning style even while it cannot be confirmed; a batch is styled by what would run.
  const destructive = (batch ? chosen : actions).some(action => action.name.startsWith('delete_'));
  const toggle = (id: string) => setUnchecked(current => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  return <Stack gap={4}>
    {batch ? <Heading variant="section">{t('preview.batchTitle', { count: actions.length })}</Heading> : null}
    <Text variant="bodySm">{batch ? t('preview.batchHint') : t('preview.singleHint')}</Text>
    <Text variant="caption">{t('preview.timeZone', { zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })}</Text>
    {actions.map((action, index) => <View key={action.id} style={batch ? { borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[4] } : undefined}>
      <ActionItem householdId={householdId} action={action} busy={busy} onReady={onReady}
        {...(batch ? { position: index + 1, choice: { checked: !unchecked.has(action.id), onToggle: () => toggle(action.id) } } : {})} />
    </View>)}
    {/* A way out that is not a decision: one quiet line, so the decision buttons stay the pair at the bottom. */}
    {onAdjust ? <Inline gap={3}>
      <Text variant="caption" style={{ flex: 1 }}>{batch ? t('preview.adjustBatch') : t('preview.adjustSingle')}</Text>
      <Button label={t('preview.adjust')} tone="secondary" size="compact" disabled={busy || disabled} onPress={onAdjust} />
    </Inline> : null}
    <ConfirmActions cancelLabel={batch ? t('preview.cancelAll') : t('preview.cancel')} confirmLabel={batch ? t('preview.confirmBatch', { count: chosen.length }) : destructive ? t('preview.confirmDelete') : t('preview.confirm')} destructive={destructive} busy={busy}
      confirmDisabled={disabled || chosen.length === 0} onCancel={() => onDecide([])} onConfirm={() => onDecide(chosen.map(action => action.id))} />
  </Stack>;
}
