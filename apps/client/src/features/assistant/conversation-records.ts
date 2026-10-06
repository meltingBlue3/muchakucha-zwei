import type { AssistantConversationResponseDto } from '@muchakucha/api-client';

export interface AssistantConversationRecord {
  kind: 'user' | 'assistant' | 'query' | 'operation';
  content: string;
  failed?: boolean;
  sources?: AssistantSource[];
}

/** A record a query read. `link` opens the live record; the excerpt shows it as it was when read. */
export interface AssistantSource { title: string; excerpt: string; link?: { section: 'events' | 'tasks' | 'notes'; id: string } }

const sections: Record<string, 'events' | 'tasks' | 'notes'> = { event: 'events', events: 'events', task: 'tasks', tasks: 'tasks', note: 'notes', notes: 'notes' };

const resources: Record<string, string> = { event: '日程', events: '日程', task: '任务', tasks: '任务', note: '笔记', notes: '笔记', label: '标签', labels: '标签' };
const verbs: Record<string, string> = { create: '创建', update: '编辑', delete: '删除', get: '查询', list: '查询' };
const failures: Record<string, string> = {
  EDIT_CONFLICT: '内容已有变化，请重新查询并确认。',
  FORBIDDEN: '你没有权限执行这项操作。',
  VALIDATION_FAILED: '内容不完整或格式有误，请补充信息后重试。',
  ASSISTANT_PROVIDER_CHANGED: '模型配置已变更，请查看最新配置并创建新的对话。',
  USER_DECLINED: '已取消，没有执行这项修改。',
  DEFERRED_UNTIL_CONFIRMATION: '等待确认，尚未执行。',
  RUN_LIMIT_REACHED: '本轮已达到处理上限，这项操作尚未执行。',
  RUN_INTERRUPTED: '处理已中断，请先查询实际数据核对结果。',
};

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

function source(value: unknown, resource: string): AssistantSource[] {
  const row = object(value);
  if (!row) return [];
  const section = Object.hasOwn(sections, resource) ? sections[resource] : undefined;
  const link = section && typeof row.id === 'string' ? { link: { section, id: row.id } } : {};
  const title = typeof row.title === 'string' ? row.title : typeof row.name === 'string' ? row.name : null;
  if (!title) return [];
  const excerpt = typeof row.body === 'string' ? row.body : typeof row.description === 'string' ? row.description : '';
  const partial = excerpt.length > 1600 || row.contentTruncated === true || Array.isArray(row.truncatedFields) && row.truncatedFields.length > 0;
  return [{ title, excerpt: partial ? `${excerpt.slice(0, 1600)}…（节选）` : excerpt, ...link }];
}

/** Show persisted observations separately from model prose, without exposing tool JSON. */
export function assistantConversationRecords(messages: AssistantConversationResponseDto['messages']): AssistantConversationRecord[] {
  const titles = new Map<string, string>();
  return messages.flatMap((message): AssistantConversationRecord[] => {
    if (!message.content.trim()) return [];
    if (message.role !== 'tool') return [{ kind: message.role, content: message.content }];
    const result = parse(message.content);
    if (!result || typeof result.ok !== 'boolean') return [{ kind: 'operation', content: '这项执行记录无法显示，请查询相关内容核对实际结果。', failed: true }];
    const tool = typeof result.tool === 'string' ? result.tool : '';
    const [verb = '', resource = ''] = tool.split('_');
    const known = Object.hasOwn(verbs, verb) && Object.hasOwn(resources, resource) && tool === `${verb}_${resource}`;
    const querying = verb === 'list' || verb === 'get' || tool === 'household_members';
    const title = tool === 'household_members' ? '查询家庭成员' : known ? `${verbs[verb]}${resources[resource]}` : '操作';
    const kind = querying ? 'query' : 'operation';
    if (!result.ok) {
      const code = typeof result.code === 'string' ? result.code : '';
      const reason = failures[code] ?? (code.endsWith('_NOT_FOUND') ? '相关内容已删除或不可访问，请重新查询。' : '未能完成，请查询实际数据后再试。');
      const inactive = code === 'USER_DECLINED' || code === 'DEFERRED_UNTIL_CONFIRMATION';
      return [{ kind, content: `${title}${inactive ? '：' : '未完成：'}${reason}`, failed: !inactive }];
    }
    const data = object(result.data);
    rememberTitle(data, titles);
    if (Array.isArray(data?.items)) {
      data.items.forEach(item => rememberTitle(item, titles));
      const more = data.truncated === true || data.nextOffset !== null && data.nextOffset !== undefined;
      return [{ kind, content: `${title}：本次返回 ${data.items.length} 项${typeof data.total === 'number' ? `，共 ${data.total} 项` : ''}${more ? '（结果仅含部分内容）' : ''}。`, ...(querying ? { sources: data.items.flatMap(item => source(item, resource)) } : {}) }];
    }
    const target = data && typeof data.id === 'string' ? titles.get(data.id) : undefined;
    const scope = data?.scope === 'this_only' ? '（仅此次安排）' : '';
    return [{ kind, content: `${title}成功${target ? `：${target}` : ''}${scope}。`, ...(querying ? { sources: source(data, resource) } : {}) }];
  });
}
