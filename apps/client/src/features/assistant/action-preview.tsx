import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { AssistantConversationResponseDto } from '@muchakucha/api-client';
import Check from 'lucide-react-native/icons/check';
import { sessionApiClient } from '../auth/session-runtime';
import { Banner, Button, ConfirmActions, Heading, Inline, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { DetailField } from '../../ui/detail-fields';
import { formatDate, formatDateTime } from '../../ui/date-values';
import { theme } from '../../ui/theme';
import { formatDueDate } from '../tasks/task-utils';
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

const names: Record<string, string> = { event: '日程', task: '任务', note: '笔记', label: '标签' };
const verbs: Record<string, string> = { create: '创建', update: '编辑', delete: '删除' };
const fieldNames: Record<string, string> = {
  title: '标题', name: '名称', description: '说明', body: '正文', startTime: '开始时间', endTime: '结束时间', allDay: '全天', location: '地点', dueDate: '截止时间',
  status: '状态', priority: '优先级', assigneeIds: '负责人', labelIds: '标签', color: '颜色', recurrence: '重复规则', freq: '频率', interval: '间隔',
  byWeekday: '星期', startsOn: '开始日期', endsOn: '结束日期', count: '次数', timezone: '时区', startTimeLocal: '当地开始时间', durationMinutes: '时长（分钟）',
};
const valueNames: Record<string, string> = { pending: '待办', in_progress: '进行中', completed: '已完成', low: '低', medium: '中', high: '高', urgent: '紧急', daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' };
const hiddenFields = new Set(['id', 'expectedUpdatedAt', 'expectedRuleUpdatedAt', 'expectedName', 'expectedColor']);
const dateFields = new Set(['startTime', 'endTime', 'dueDate', 'startsOn', 'endsOn']);
const enumFields = new Set(['status', 'priority', 'freq']);
const textFields = new Set(['description', 'body']);
// Lines shown per text change; the rest are summarized as a count.
const SHOWN_CHANGED_LINES = 40;

function currentValue(key: string, target: Target): unknown {
  if (key === 'name') return target.title;
  if (key === 'labelIds') return target.labels?.map(label => label.id);
  return (target as Record<string, unknown>)[key];
}

function valueText(key: string, value: unknown, context: ActionPreviewContext): string {
  if (value === null || value === '') return '清空';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) {
    if (!value.length) return '无';
    if (key === 'byWeekday') return value.map(day => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][Number(day)] ?? String(day)).join('、');
    if (key === 'labelIds') return value.map(id => context.labels[String(id)] ?? '无法识别的标签').join('、');
    if (key === 'assigneeIds') return value.map(id => context.members[String(id)] ?? '无法识别的成员').join('、');
    return value.map(item => valueText(key, item, context)).join('、');
  }
  if (typeof value === 'object') return Object.entries(value).map(([childKey, item]) => `${fieldNames[childKey] ?? childKey}：${valueText(childKey, item, context)}`).join('\n');
  if (typeof value === 'string') {
    if (key === 'dueDate' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDueDate(value) || value;
    if (dateFields.has(key) && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))) return formatDateTime(new Date(value));
    if (dateFields.has(key) && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(new Date(`${value}T12:00:00`));
    return enumFields.has(key) ? valueNames[value] ?? value : value;
  }
  return String(value);
}

export function assistantActionDetails(action: PendingAction, context: ActionPreviewContext) {
  const [verb = '', resource = ''] = action.name.split('_');
  const supported = Object.hasOwn(verbs, verb) && Object.hasOwn(names, resource) && action.name === `${verb}_${resource}`;
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
    const field: ActionField = { label: fieldNames[key] ?? key, value: valueText(key, value, context) };
    if (!target) return field;
    const current = currentValue(key, target);
    if (textFields.has(key) && typeof value === 'string') {
      const before = typeof current === 'string' ? current : '';
      return before === value ? field : { ...field, before: before || '无', changes: changedLines(before, value), shrunk: suspiciousShrink(before, value) };
    }
    const before = current === undefined || current === null || current === '' || (Array.isArray(current) && !current.length) ? '无' : valueText(key, current, named);
    return before === field.value ? field : { ...field, before };
  });
  const unresolved = ['labelIds', 'assigneeIds'].some(key => {
    const ids = action.arguments[key];
    const dictionary = key === 'labelIds' ? context.labels : context.members;
    return Array.isArray(ids) && ids.some(id => !dictionary[String(id)]);
  });
  return { title: supported ? `${verbs[verb]}${names[resource]}` : '待确认操作', destructive: verb === 'delete', supported, stale, unresolved, fields };
}

/** A text edit as the lines it removes and adds, so lost content is visible before it is confirmed. */
function TextChange({ field }: { field: ActionField }) {
  const changes = field.changes ?? null;
  const removed = changes?.filter(line => line.kind === 'removed').length ?? 0;
  const added = changes?.filter(line => line.kind === 'added').length ?? 0;
  return <Stack gap={1}>
    <Text variant="label" color="inkMuted">{field.label}</Text>
    {changes === null ? <Text>{field.value}</Text> : <>
      <Text variant="caption" color="inkMuted">删除 {removed} 行，新增 {added} 行</Text>
      {changes.slice(0, SHOWN_CHANGED_LINES).map((line, index) => <Text key={index} selectable variant="bodySm" color={line.kind === 'removed' ? 'destructive' : 'success'}>
        {line.kind === 'removed' ? '－ ' : '＋ '}{line.text || '（空行）'}
      </Text>)}
      {changes.length > SHOWN_CHANGED_LINES ? <Text variant="caption" color="inkMuted">另有 {changes.length - SHOWN_CHANGED_LINES} 行变化未显示</Text> : null}
    </>}
    {field.shrunk ? <Text variant="bodySm" color="destructive">修改后少了约 {field.shrunk} 字。请确认没有误删内容。</Text> : null}
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
      : <Heading variant="section">请确认：{details.title}</Heading>}
    {query.loading && !query.data ? <LoadingState label="正在核对操作内容" /> : null}
    {query.error ? <LoadError message="无法核对操作对象，请重试，或取消这次操作。" retrying={query.loading} disabled={busy} onRetry={() => { void query.reload(); }} /> : null}
    {/* Short facts take one line each, name beside value, so a proposal fits a phone sheet. */}
    {query.data?.target ? <Stack gap={2}>
      <DetailField label="操作对象" value={query.data.target.title} />
      {query.data.target.recurrence ? <Text variant="bodySm">这是重复安排，本次操作仅影响这一次安排。</Text> : null}
      {details.destructive ? <>
        {query.data.target.startTime ? <DetailField label="开始时间" value={formatDateTime(new Date(query.data.target.startTime))} /> : null}
        {query.data.target.dueDate ? <DetailField label="截止时间" value={formatDueDate(query.data.target.dueDate)} /> : null}
        {query.data.target.description || query.data.target.body ? <DetailField label="当前内容" value={query.data.target.description ?? query.data.target.body ?? ''} /> : null}
      </> : null}
    </Stack> : null}
    {details.fields.length ? <Stack gap={2}>
      {details.fields.map(field => field.changes !== undefined ? <TextChange key={field.label} field={field} />
        : <DetailField key={field.label} label={field.label} value={field.value} notes={field.before === undefined ? [] : [`修改前：${field.before}`]} />)}
    </Stack> : null}
    {details.stale ? <Banner>操作对象已有变化。请取消这次操作，让助手重新查询并生成建议。</Banner> : null}
    {details.unresolved ? <Banner>部分成员或标签已不可用。请取消这次操作，让助手重新查询。</Banner> : null}
    {!details.supported ? <Banner>此版本暂不支持预览这项操作，请取消后重试。</Banner> : null}
    {details.destructive ? <Text color="destructive" variant="bodySm">删除后无法撤销。</Text> : null}
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
    {batch ? <Heading variant="section">待确认的操作（{actions.length}）</Heading> : null}
    <Text variant="bodySm">{batch ? '逐项核对，取消勾选的项不会执行。家人可看到修改后的内容。' : '核对后再执行，家人可看到修改后的内容。'}</Text>
    <Text variant="caption">时间按本机时区显示：{Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}</Text>
    {actions.map((action, index) => <View key={action.id} style={batch ? { borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[4] } : undefined}>
      <ActionItem householdId={householdId} action={action} busy={busy} onReady={onReady}
        {...(batch ? { position: index + 1, choice: { checked: !unchecked.has(action.id), onToggle: () => toggle(action.id) } } : {})} />
    </View>)}
    {/* A way out that is not a decision: one quiet line, so the decision buttons stay the pair at the bottom. */}
    {onAdjust ? <Inline gap={3}>
      <Text variant="caption" style={{ flex: 1 }}>{batch ? '取消这些草稿，回到对话描述你的修改。' : '取消当前草稿，回到对话描述你的修改。'}</Text>
      <Button label="调整方案" tone="secondary" size="compact" disabled={busy || disabled} onPress={onAdjust} />
    </Inline> : null}
    <ConfirmActions cancelLabel={batch ? '全部取消' : '取消操作'} confirmLabel={batch ? `确认执行（${chosen.length}）` : destructive ? '确认删除' : '确认执行'} destructive={destructive} busy={busy}
      confirmDisabled={disabled || chosen.length === 0} onCancel={() => onDecide([])} onConfirm={() => onDecide(chosen.map(action => action.id))} />
  </Stack>;
}
