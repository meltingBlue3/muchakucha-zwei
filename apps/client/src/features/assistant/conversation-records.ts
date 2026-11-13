import type { AssistantConversationResponseDto } from '@muchakucha/api-client';
import type { TFunction } from 'i18next';
import { i18n } from '../../i18n';
import { zh } from '../../i18n/locales/zh';

export interface AssistantConversationRecord {
  kind: 'user' | 'assistant' | 'query' | 'operation';
  content: string;
  failed?: boolean;
  sources?: AssistantSource[];
}

/** A record a query read. `link` opens the live record; the excerpt shows it as it was when read. */
export interface AssistantSource { title: string; excerpt: string; link?: { section: 'events' | 'tasks' | 'notes'; id: string } }

const sections: Record<string, 'events' | 'tasks' | 'notes'> = { event: 'events', events: 'events', task: 'tasks', tasks: 'tasks', note: 'notes', notes: 'notes' };

const resources = { event: 'event', events: 'event', task: 'task', tasks: 'task', note: 'note', notes: 'note', label: 'label', labels: 'label' } as const;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parse(content: string): Record<string, unknown> | null {
  try { return object(JSON.parse(content)); } catch { return null; }
}

function rememberTitle(value: unknown, titles: Map<string, string>): void {
  const row = object(value);
  if (!row || typeof row.id !== 'string') return;
  const title = typeof row.title === 'string' ? row.title : typeof row.name === 'string' ? row.name : null;
  if (title !== null) titles.set(row.id, title);
}

function source(value: unknown, resource: string, t: TFunction<'assistant'>): AssistantSource[] {
  const row = object(value);
  if (!row) return [];
  const section = Object.hasOwn(sections, resource) ? sections[resource] : undefined;
  const link = section && typeof row.id === 'string' ? { link: { section, id: row.id } } : {};
  const title = typeof row.title === 'string' ? row.title : typeof row.name === 'string' ? row.name : null;
  if (!title) return [];
  const excerpt = typeof row.body === 'string' ? row.body : typeof row.description === 'string' ? row.description : '';
  const partial = excerpt.length > 1600 || row.contentTruncated === true || Array.isArray(row.truncatedFields) && row.truncatedFields.length > 0;
  return [{ title, excerpt: partial ? t('records.excerpt', { text: excerpt.slice(0, 1600) }) : excerpt, ...link }];
}

/** Show persisted observations separately from model prose, without exposing tool JSON. */
export function assistantConversationRecords(messages: AssistantConversationResponseDto['messages'], t: TFunction<'assistant'> = i18n.getFixedT(null, 'assistant')): AssistantConversationRecord[] {
  const titles = new Map<string, string>();
  return messages.flatMap((message): AssistantConversationRecord[] => {
    if (!message.content.trim()) return [];
    if (message.role !== 'tool') return [{ kind: message.role, content: message.content }];
    const result = parse(message.content);
    if (!result || typeof result.ok !== 'boolean') return [{ kind: 'operation', content: t('records.invalid'), failed: true }];
    const tool = typeof result.tool === 'string' ? result.tool : '';
    const [verb = '', resource = ''] = tool.split('_');
    const known = Object.hasOwn(zh.assistant.verbs, verb) && Object.hasOwn(resources, resource) && tool === `${verb}_${resource}`;
    const querying = verb === 'list' || verb === 'get' || tool === 'household_members';
    const title = tool === 'household_members' ? t('records.members') : known
      ? t(`verbs.${verb as keyof typeof zh.assistant.verbs}`, { resource: t(`resources.${resources[resource as keyof typeof resources]}`) })
      : t('records.operation');
    const kind = querying ? 'query' : 'operation';
    if (!result.ok) {
      const code = typeof result.code === 'string' ? result.code : '';
      const reason = Object.hasOwn(zh.assistant.recordFailures, code)
        ? t(`recordFailures.${code as keyof typeof zh.assistant.recordFailures}`)
        : t(code.endsWith('_NOT_FOUND') ? 'records.notFound' : 'records.failed');
      const inactive = code === 'USER_DECLINED' || code === 'DEFERRED_UNTIL_CONFIRMATION';
      return [{ kind, content: t(inactive ? 'records.inactive' : 'records.failure', { title, reason }), failed: !inactive }];
    }
    const data = object(result.data);
    rememberTitle(data, titles);
    if (Array.isArray(data?.items)) {
      data.items.forEach(item => rememberTitle(item, titles));
      const more = data.truncated === true || data.nextOffset !== null && data.nextOffset !== undefined;
      const total = typeof data.total === 'number' ? t('records.total', { count: data.total }) : '';
      const partial = more ? t('records.partial') : '';
      return [{ kind, content: t('records.items', { title, count: data.items.length, total, partial }), ...(querying ? { sources: data.items.flatMap(item => source(item, resource, t)) } : {}) }];
    }
    const target = data && typeof data.id === 'string' ? titles.get(data.id) : undefined;
    const scope = data?.scope === 'this_only' ? t('records.scope') : '';
    return [{ kind, content: t('records.success', { title, target: target ? t('records.target', { title: target }) : '', scope }), ...(querying ? { sources: source(data, resource, t) } : {}) }];
  });
}
