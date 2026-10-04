import { useCallback } from 'react';
import type { AssistantConversationResponseDto } from '@muchakucha/api-client';
import { sessionApiClient } from '../auth/session-runtime';
import { Banner, ConfirmActions, Heading, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { DetailField, DetailPanel } from '../../ui/detail-fields';
import { formatDate, formatDateTime } from '../../ui/date-values';
import { useAssistantQuery } from './assistant-runtime';

type PendingAction = NonNullable<AssistantConversationResponseDto['pendingAction']>;
type Target = { title: string; updatedAt?: string; description?: string | null; body?: string | null; startTime?: string; endTime?: string; dueDate?: string | null; color?: string; recurrence?: { updatedAt: string } | null };
export interface ActionPreviewContext { target: Target | null; labels: Record<string, string>; members: Record<string, string> }

const names: Record<string, string> = { event: '日程', task: '任务', note: '笔记', label: '标签' };
const verbs: Record<string, string> = { create: '创建', update: '编辑', delete: '删除' };
const fieldNames: Record<string, string> = {
  title: '标题', name: '名称', description: '说明', body: '正文', startTime: '开始时间', endTime: '结束时间', allDay: '全天', location: '地点', dueDate: '截止时间',
  status: '状态', priority: '优先级', assigneeIds: '负责人', labelIds: '标签', color: '颜色', recurrence: '重复规则', frequency: '频率', interval: '间隔',
  daysOfWeek: '星期', weekdays: '星期', dayOfMonth: '每月日期', monthDay: '每月日期', startDate: '开始日期', startsOn: '开始日期', endsOn: '结束日期', until: '截止日期',
  timeZone: '时区', count: '次数', mode: '方式', scope: '范围', month: '月份', durationMinutes: '时长（分钟）', localStartTime: '当地开始时间', localDueTime: '当地截止时间',
  freq: '频率', byWeekday: '星期', timezone: '时区', startTimeLocal: '当地开始时间',
};
const valueNames: Record<string, string> = { pending: '待办', in_progress: '进行中', completed: '已完成', low: '低', medium: '中', high: '高', urgent: '紧急', daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年', this: '仅此一次', future: '此次及之后' };
const hiddenFields = new Set(['id', 'expectedUpdatedAt', 'expectedRuleUpdatedAt', 'expectedName', 'expectedColor']);
const dateFields = new Set(['startTime', 'endTime', 'dueDate', 'startDate', 'startsOn', 'endsOn', 'until']);
const enumFields = new Set(['status', 'priority', 'frequency', 'freq', 'scope']);

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
  const fields = Object.entries(action.arguments).filter(([key]) => !hiddenFields.has(key)).map(([key, value]) => ({ label: fieldNames[key] ?? key, value: valueText(key, value, context) }));
  const unresolved = ['labelIds', 'assigneeIds'].some(key => {
    const ids = action.arguments[key];
    const dictionary = key === 'labelIds' ? context.labels : context.members;
    return Array.isArray(ids) && ids.some(id => !dictionary[String(id)]);
  });
  return { title: supported ? `${verbs[verb]}${names[resource]}` : '待确认操作', destructive: verb === 'delete', supported, stale, unresolved, fields };
}

export function AssistantActionPreview({ householdId, action, busy, disabled = false, onDecide }: {
  householdId: string; action: PendingAction; busy: boolean; disabled?: boolean; onDecide: (approve: boolean) => void;
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
      Array.isArray(action.arguments.assigneeIds) && action.arguments.assigneeIds.length ? sessionApiClient.getHousehold(token, householdId) : Promise.resolve(null),
    ]);
    return { target, labels: Object.fromEntries(labels?.labels.map(label => [label.id, label.name]) ?? []), members: Object.fromEntries(household?.members.map(member => [member.userId, member.displayName]) ?? []) };
  }, [householdId, action]);
  const query = useAssistantQuery(load);
  const details = assistantActionDetails(action, query.data ?? { target: null, labels: {}, members: {} });
  return <DetailPanel>
    <Heading variant="section">请确认：{details.title}</Heading>
    <Text variant="bodySm">确认后，助手将把以下操作应用到当前家庭。请核对内容和时间。</Text>
    <Text variant="caption">时间按本机时区显示：{Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}</Text>
    {query.loading && !query.data ? <LoadingState label="正在核对操作内容" /> : null}
    {query.error ? <LoadError message="无法核对操作对象，请重试，或取消这次操作。" retrying={query.loading} disabled={busy} onRetry={() => { void query.reload(); }} /> : null}
    {query.data?.target ? <Stack gap={2}>
      <DetailField label="操作对象" value={query.data.target.title} />
      {query.data.target.recurrence ? <Text variant="bodySm">这是重复安排，本次操作仅影响这一次安排。</Text> : null}
      {details.destructive ? <>
        {query.data.target.startTime ? <DetailField label="开始时间" value={formatDateTime(new Date(query.data.target.startTime))} /> : null}
        {query.data.target.dueDate ? <DetailField label="截止时间" value={formatDateTime(new Date(query.data.target.dueDate))} /> : null}
        {query.data.target.description || query.data.target.body ? <DetailField label="当前内容" value={query.data.target.description ?? query.data.target.body ?? ''} /> : null}
      </> : null}
    </Stack> : null}
    {details.fields.map(field => <DetailField key={field.label} label={field.label} value={field.value} />)}
    {details.stale ? <Banner>操作对象已有变化。请取消这次操作，让助手重新查询并生成建议。</Banner> : null}
    {details.unresolved ? <Banner>部分成员或标签已不可用。请取消这次操作，让助手重新查询。</Banner> : null}
    {!details.supported ? <Banner>此版本暂不支持预览这项操作，请取消后重试。</Banner> : null}
    {details.destructive ? <Text color="destructive" variant="bodySm">删除后无法撤销。</Text> : null}
    <ConfirmActions cancelLabel="取消操作" confirmLabel={details.destructive ? '确认删除' : '确认执行'} destructive={details.destructive} busy={busy}
      confirmDisabled={disabled || query.loading || query.data === null || query.error !== null || details.stale || details.unresolved || !details.supported}
      onCancel={() => onDecide(false)} onConfirm={() => onDecide(true)} />
  </DetailPanel>;
}
