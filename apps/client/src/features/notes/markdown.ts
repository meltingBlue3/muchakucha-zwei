import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { applyChecklistTick, checklists, inlineText, type ChecklistTick } from './checklists';

// A single dialect is shared by reading, card excerpts and the editor: HTML and
// images stay literal, a single newline is a line break, and checklists follow
// checklists.ts. No HTML from a note is ever rendered as markup.
const parser = new MarkdownIt({ html: false, breaks: true }).disable('image').use(checklists);
export interface MarkdownNode { token: Token; children: MarkdownNode[] }
export function parseMarkdown(source: string): MarkdownNode[] {
  const roots: MarkdownNode[] = [];
  const stack = [roots];
  for (const token of parser.parse(source, {})) {
    if (token.nesting === -1) { stack.pop(); continue; }
    const node: MarkdownNode = { token, children: [] };
    stack[stack.length - 1]!.push(node);
    if (token.nesting === 1) stack.push(node.children);
  }
  return roots;
}
export function markdownExcerpt(source: string): string {
  const text = (nodes: MarkdownNode[]): string => nodes.map(({ token, children }) => {
    if (token.type === 'inline') return inlineText(token);
    return children.length ? text(children) : token.content;
  }).join(' ');
  return text(parseMarkdown(source)).replace(/\s+/g, ' ').trim();
}
export function safeLink(value: string): boolean {
  try { const url = new URL(value); return ['https:', 'http:', 'mailto:'].includes(url.protocol); }
  catch { return false; }
}

/** The API's limit, in UTF-16 units as it counts them. */
const TITLE_MAX = 200;
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // Do not leave half of a surrogate pair at the end.
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/**
 * The title a note is saved under: the title line when it has text, otherwise
 * the body's first line that has any, as plain text. Null when both are empty,
 * which means there is nothing to save.
 */
export function noteTitle(title: string, body: string): string | null {
  const own = title.replace(/\s+/g, ' ').trim();
  if (own) return clip(own, TITLE_MAX);
  for (const token of parser.parse(body, {})) {
    const source = token.type === 'inline' ? inlineText(token, '\n') : token.type === 'fence' || token.type === 'code_block' ? token.content : '';
    const line = source.split('\n').map(part => part.replace(/\s+/g, ' ').trim()).find(Boolean);
    if (line) return clip(line, TITLE_MAX);
  }
  return null;
}

/**
 * Replays a tick from this device on the latest Markdown someone else saved:
 * the `index`-th checklist item is set to `checked` if its text is still
 * `text`. Returns the new Markdown, or null when the item is gone or changed.
 */
export function setChecklistItem(markdown: string, tick: ChecklistTick): string | null {
  return applyChecklistTick(markdown, parser.parse(markdown, {}), tick);
}
