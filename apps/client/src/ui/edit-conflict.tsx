import { useEffect, useState } from 'react';
import { ApiClientError, type RecurrenceResponseDto } from '@muchakucha/api-client';
import { Button, Stack, Text } from './primitives';
import { useWorkspaceState, useWorkspaceStore } from './workspace-state';
import { formatDate, formatDateTime } from './date-values';
import { recurrenceInputFromResponse } from '../features/recurrence/recurrence-options';
import { formatRecurrenceSummary } from '../features/recurrence/recurrence-summary';
import { i18n, useTranslation } from '../i18n';

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
  const { t } = useTranslation(['editConflict', 'common']);
  const workspace = useWorkspaceStore();
  const [version, setVersion] = useWorkspaceState(prefix + 'baseVersion', '');
  const [ruleVersion, setRuleVersion] = useWorkspaceState(prefix + 'baseRuleVersion', '');
  const [conflicted, setConflicted] = useState(false);
  const [latest, setLatest] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    if (current) captureEditBaseline(workspace, prefix, current);
  }, [current, prefix, workspace, setVersion, setRuleVersion]);
  const handle = (caught: unknown) => {
    if (!isEditConflict(caught)) return false;
    setConflicted(true); setLatest(null); setLoadFailed(false);
    return true;
  };
  const load = async () => {
    setBusy(true); setLoadFailed(false);
    try { setLatest(await fetchLatest()); }
    catch { setLoadFailed(true); }
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
      <Text accessibilityRole="alert" color="destructive">{t('message')}</Text>
      <Button label={t(busy ? 'loading' : 'load')} onPress={() => void load()} disabled={busy} />
      {loadFailed ? <Text color="destructive">{t('loadFailed')}</Text> : null}
      {latest ? <Stack gap={2}>
        <Text variant="section">{t('latest')}</Text>
        {summarizeLatest(latest).map(([label, value]) => <Text key={label}>{t('common:fieldValue', { label, value })}</Text>)}
        <Text>{t('reviewInstructions')}</Text>
        <Button label={t('reviewed')} onPress={review} />
      </Stack> : null}
    </Stack> : null,
  };
}

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
  const t = i18n.getFixedT(null, 'editConflict');
  const data = value as Record<string, unknown>;
  const rows: Array<[string, string]> = [];
  const text = (key: string) => typeof data[key] === 'string' ? (data[key] as string) : null;
  const add = (label: string, shown: string | null) => { if (shown !== null) rows.push([label, shown || t('empty')]); };
  const allDay = data.allDay === true;
  const when = (key: string) => {
    const raw = text(key);
    if (raw === null || raw === '') return raw;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : allDay ? formatDate(date) : formatDateTime(date);
  };

  if ('title' in data) add(t('title'), text('title'));
  if ('body' in data) {
    const body = text('body') ?? '';
    add(t('body'), body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body);
  }
  if ('description' in data) add(t('description'), text('description') ?? '');
  if ('status' in data) add(t('status'), i18n.t(`tasks:status.${String(data.status)}`, { defaultValue: String(data.status) }));
  if ('priority' in data) add(t('priority'), i18n.t(`tasks:priority.${String(data.priority)}`, { defaultValue: String(data.priority) }));
  if ('startTime' in data) add(t('start'), when('startTime'));
  if ('endTime' in data) add(t('end'), when('endTime'));
  if ('allDay' in data) add(t('allDay'), t(allDay ? 'yes' : 'no'));
  if ('dueDate' in data) {
    const due = text('dueDate');
    add(t('dueDate'), due ? formatDate(new Date(due)) : '');
  }
  if ('location' in data) add(t('location'), text('location') ?? '');
  if (Array.isArray(data.labels)) add(t('labels'), data.labels.map((label: { name: string }) => label.name).join('、'));
  if (Array.isArray(data.assigneeNames)) add(i18n.t('shared:assignee'), data.assigneeNames.join('、'));
  const rule = (data.recurrence ?? ('freq' in data ? data : null)) as RecurrenceResponseDto | null;
  const recurrence = recurrenceInputFromResponse(rule);
  if (recurrence) add(t('repeat'), formatRecurrenceSummary(recurrence, deviceTimeZone(recurrence.timezone)).summary);
  return rows;
}
