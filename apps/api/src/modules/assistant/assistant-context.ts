import { describeNow } from './assistant-time.js';
import type { AssistantMessage } from './assistant.types.js';

/** Enough to name a record and decide whether to read it again. Versions are left out on purpose:
 * an edit must start from a fresh read, never from an earlier turn. */
const BRIEF_FIELDS = ['id', 'title', 'name', 'displayName', 'userId', 'status', 'allDay', 'startLocal', 'endLocal', 'dueLocal', 'color'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function brief(value: unknown): unknown {
  return isRecord(value) ? Object.fromEntries(BRIEF_FIELDS.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : value;
}

function compact(content: string): string {
  let result: unknown;
  try { result = JSON.parse(content); } catch { return content; }
  if (!isRecord(result) || result.ok !== true || !isRecord(result.data)) return content;
  const data = result.data;
  const summary = Array.isArray(data.items) ? { total: data.total, items: data.items.map(brief) } : brief(data);
  return JSON.stringify({ ok: true, tool: result.tool, data: summary, shortened: 'Earlier result: read the record again for its content or version.' });
}

/**
 * What the model receives. Tool results from earlier turns keep record IDs and titles but drop bodies,
 * so a long conversation stays within the context budget; the stored history keeps everything for
 * the user's evidence view. The current turn, which starts at the latest user message, is sent in full.
 *
 * Each user message leads with its local send time. The clock lives in the history rather than the
 * system prompt, so the prompt stays identical between requests and providers can cache it, and a
 * "tomorrow" written yesterday still means the day it meant.
 */
export function modelContext(messages: AssistantMessage[], timeZone: string): AssistantMessage[] {
  const current = messages.findLastIndex(message => message.role === 'user');
  return messages.map((message, index) => {
    if (message.role === 'user') return { role: 'user', content: message.sentAt ? `（${describeNow(timeZone, new Date(message.sentAt))}）\n${message.content}` : message.content };
    return index < current && message.role === 'tool' ? { ...message, content: compact(message.content) } : message;
  });
}
