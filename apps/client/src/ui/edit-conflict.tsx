import { useEffect, useState } from 'react';
import { ApiClientError, type RecurrenceResponseDto } from '@muchakucha/api-client';
import { Button, Stack, Text } from './primitives';
import { useWorkspaceState, useWorkspaceStore } from './workspace-state';
import { formatDate, formatDateTime } from './date-values';
import { recurrenceInputFromResponse } from '../features/recurrence/recurrence-options';
import { formatRecurrenceSummary } from '../features/recurrence/recurrence-summary';

export const EDIT_CONFLICT_MESSAGE = '内容已更新，请查看最新版本后再保存。你的草稿已保留。';
const UNKNOWN_VERSION = '1970-01-01T00:00:00.000Z';
interface Versioned { updatedAt?: string; recurrence?: { updatedAt?: string } | null }
export function isEditConflict(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 409 &&
    (error.body as { error?: { code?: string } } | undefined)?.error?.code === 'EDIT_CONFLICT';
}

export function captureEditBaseline(workspace: ReturnType<typeof useWorkspaceStore>, prefix: string, current: Versioned) {
  if (workspace.has(prefix + 'baseVersion')) return;
  const restored = workspace.hasDrafts(prefix);
  workspace.set(prefix + 'baseVersion', restored ? UNKNOWN_VERSION : current.updatedAt ?? UNKNOWN_VERSION);
  workspace.set(prefix + 'baseRuleVersion', restored ? UNKNOWN_VERSION : current.recurrence?.updatedAt ?? '');
}

export function useEditConflict<T extends Versioned>(prefix: string, current: T | null, fetchLatest: () => Promise<T>, onReviewed: (latest: T) => void) {
  const workspace = useWorkspaceStore();
  const [version, setVersion] = useWorkspaceState(prefix + 'baseVersion', '');
  const [ruleVersion, setRuleVersion] = useWorkspaceState(prefix + 'baseRuleVersion', '');
  const [conflicted, setConflicted] = useState(false);
  const [latest, setLatest] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (current) captureEditBaseline(workspace, prefix, current);
  }, [current, prefix, workspace, setVersion, setRuleVersion]);
  const handle = (caught: unknown) => {
    if (!isEditConflict(caught)) return false;
    setConflicted(true); setLatest(null); setError(null);
    return true;
  };
  const load = async () => {
    setBusy(true); setError(null);
    try { setLatest(await fetchLatest()); }
    catch { setError('无法读取最新内容，请检查网络或确认内容是否已删除。草稿仍保留。'); }
    finally { setBusy(false); }
  };
  const review = () => {
    if (!latest) return;
    setVersion(latest.updatedAt ?? UNKNOWN_VERSION);
    setRuleVersion(latest.recurrence?.updatedAt ?? '');
    onReviewed(latest);
    setConflicted(false); setLatest(null);
  };
  return {
    precondition: { expectedUpdatedAt: version || UNKNOWN_VERSION, ...(ruleVersion ? { expectedRuleUpdatedAt: ruleVersion } : {}) },
    seriesPrecondition: { expectedUpdatedAt: version || UNKNOWN_VERSION, expectedRuleUpdatedAt: ruleVersion || UNKNOWN_VERSION },
    handle,
    panel: conflicted ? <Stack gap={3}>
      <Text accessibilityRole="alert" color="destructive">{EDIT_CONFLICT_MESSAGE}</Text>
      <Button label={busy ? '正在读取最新内容…' : '查看最新内容'} onPress={() => void load()} disabled={busy} />
      {error ? <Text color="destructive">{error}</Text> : null}
      {latest ? <Stack gap={2}>
        <Text variant="section">最新内容</Text>
        {summarizeLatest(latest).map(([label, value]) => <Text key={label}>{label}：{value}</Text>)}
        <Text>请对照最新内容整理下方草稿，再保存。此操作不会替换你的输入。</Text>
        <Button label="已查看，继续整理草稿" onPress={review} />
      </Stack> : null}
    </Stack> : null,
  };
}

const STATUS_NAMES: Record<string, string> = { pending: '待办', in_progress: '进行中', completed: '已完成', cancelled: '已取消' };
const PRIORITY_NAMES: Record<string, string> = { low: '低', medium: '中', high: '高', urgent: '紧急' };
const EXCERPT_LENGTH = 120;

function deviceTimeZone(fallback: string): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback; } catch { return fallback; }
}

/**
 * The other person's version in the words the rest of the app uses: dates as
 * "6月20日 16:00", statuses by name, and the repeat as its usual summary —
 * never raw timestamps, enum keys or time-zone identifiers.
 */
export function summarizeLatest(value: Versioned): Array<[string, string]> {
  const data = value as Record<string, unknown>;
  const rows: Array<[string, string]> = [];
  const text = (key: string) => typeof data[key] === 'string' ? (data[key] as string) : null;
  const add = (label: string, shown: string | null) => { if (shown !== null) rows.push([label, shown || '无']); };
  const allDay = data.allDay === true;
  const when = (key: string) => {
    const raw = text(key);
    if (raw === null || raw === '') return raw;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : allDay ? formatDate(date) : formatDateTime(date);
  };

  if ('title' in data) add('标题', text('title'));
  if ('body' in data) {
    const body = text('body') ?? '';
    add('正文', body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body);
  }
  if ('description' in data) add('说明', text('description') ?? '');
  if ('status' in data) add('状态', STATUS_NAMES[String(data.status)] ?? String(data.status));
  if ('priority' in data) add('优先级', PRIORITY_NAMES[String(data.priority)] ?? String(data.priority));
  if ('startTime' in data) add('开始', when('startTime'));
  if ('endTime' in data) add('结束', when('endTime'));
  if ('allDay' in data) add('全天', allDay ? '是' : '否');
  if ('dueDate' in data) {
    const due = text('dueDate');
    add('截止日期', due ? formatDate(new Date(due)) : '');
  }
  if ('location' in data) add('地点', text('location') ?? '');
  if (Array.isArray(data.labels)) add('标签', data.labels.map((label: { name: string }) => label.name).join('、'));
  if (Array.isArray(data.assigneeNames)) add('负责人', data.assigneeNames.join('、'));
  const rule = (data.recurrence ?? ('freq' in data ? data : null)) as RecurrenceResponseDto | null;
  const recurrence = recurrenceInputFromResponse(rule);
  if (recurrence) add('重复', formatRecurrenceSummary(recurrence, deviceTimeZone(recurrence.timezone)).summary);
  return rows;
}
