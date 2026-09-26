import { useEffect, useState } from 'react';
import { ApiClientError } from '@muchakucha/api-client';
import { Button, Stack, Text } from './primitives';
import { useWorkspaceState, useWorkspaceStore } from './workspace-state';

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

function summarizeLatest(value: Versioned): Array<[string, string]> {
  const data = value as Record<string, unknown>;
  const fields: Array<[string, string]> = [['title','标题'],['body','正文'],['description','说明'],['status','状态'],['priority','优先级'],['startTime','开始时间'],['endTime','结束时间'],['dueDate','截止日期'],['location','地点'],['allDay','全天']];
  const names: Record<string, string> = { pending: '待处理', in_progress: '进行中', completed: '已完成', cancelled: '已取消', low: '低', medium: '中', high: '高', urgent: '紧急' };
  const rows: Array<[string, string]> = fields.filter(([key]) => key in data).map(([key,label]) => {
    const raw = data[key]; const text = raw === null || raw === '' ? '无' : raw === true ? '是' : raw === false ? '否' : String(raw);
    return [label, names[text] ?? text];
  });
  if (Array.isArray(data.labels)) rows.push(['标签', data.labels.map((label: { name: string }) => label.name).join('、') || '无']);
  if (Array.isArray(data.assigneeNames)) rows.push(['负责人', data.assigneeNames.join('、') || '无']);
  const rule = (data.recurrence ?? ('freq' in data ? data : null)) as Record<string, unknown> | null;
  if (rule) {
    const frequencies: Record<string,string> = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' };
    if (Array.isArray(rule.byWeekday) && rule.byWeekday.length) rows.push(['星期', rule.byWeekday.map(day => ['日','一','二','三','四','五','六'][Number(day)]).map(day => `周${day}`).join('、')]);
    rows.push(['重复', `${frequencies[String(rule.freq)] ?? rule.freq}，间隔 ${rule.interval ?? 1}`]);
    for (const [key,label] of [['startsOn','重复开始'],['endsOn','重复结束'],['count','重复次数'],['timezone','时区'],['startTimeLocal','当地时间']] as const) {
      if (rule[key] != null) rows.push([label,String(rule[key])]);
    }
  }
  return rows;
}
