import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

// A single dialect is shared by reading, preview, and card excerpts. HTML and
// images stay literal in this first release; no HTML is passed to a WebView.
const parser = new MarkdownIt({ html: false, breaks: true }).disable('image');
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
    if (token.type === 'inline') return (token.children ?? []).map(t => t.type === 'softbreak' || t.type === 'hardbreak' ? ' ' : t.nesting === 0 ? t.content : '').join('');
    return children.length ? text(children) : token.content;
  }).join(' ');
  return text(parseMarkdown(source)).replace(/\s+/g, ' ').trim();
}
export function safeLink(value: string): boolean {
  try { const url = new URL(value); return ['https:', 'http:', 'mailto:'].includes(url.protocol); }
  catch { return false; }
}
export interface Selection { start: number; end: number }
export interface MarkdownEdit { value: string; selection: Selection }
export function replaceSelection(value: string, selection: Selection, replacement: string): MarkdownEdit {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  return { value: value.slice(0, start) + replacement + value.slice(end), selection: { start: start + replacement.length, end: start + replacement.length } };
}
export function toggleBold(value: string, selection: Selection): MarkdownEdit {
  const { start, end } = selection;
  const selected = value.slice(start, end);
  if (selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4) {
    const result = replaceSelection(value, selection, selected.slice(2, -2));
    return { ...result, selection: { start, end: end - 4 } };
  }
  if (value.slice(Math.max(0, start - 2), start) === '**' && value.slice(end, end + 2) === '**') {
    const result = replaceSelection(value, { start: start - 2, end: end + 2 }, selected);
    return { ...result, selection: { start: start - 2, end: end - 2 } };
  }
  return { ...replaceSelection(value, selection, `**${selected}**`), selection: { start: start + 2, end: end + 2 } };
}
export function headingLevel(value: string, selection: Selection): number {
  const start = selection.start === 0 ? 0 : value.lastIndexOf('\n', selection.start - 1) + 1;
  return /^ {0,3}(#{1,6})(?:[ \t]+|$)/.exec(value.slice(start))?.[1]?.length ?? 0;
}
export function setHeading(value: string, selection: Selection, level: number): MarkdownEdit {
  const start = selection.start === 0 ? 0 : value.lastIndexOf('\n', selection.start - 1) + 1;
  const newline = value.indexOf('\n', selection.start);
  const end = newline < 0 ? value.length : newline;
  const original = value.slice(start, end);
  const line = /^ {0,3}#{1,6}(?:\s+|$)/.test(original)
    ? original.replace(/^ {0,3}#{1,6}(?:\s+|$)/, '').replace(/\s+#+\s*$/, '')
    : original;
  return replaceSelection(value, { start, end }, (level ? '#'.repeat(level) + ' ' : '') + line);
}
export function insertLink(value: string, selection: Selection, label: string, url: string): MarkdownEdit {
  const escaped = label.replace(/([\\\[\]])/g, '\\$1').replace(/\r?\n/g, ' ');
  return replaceSelection(value, selection, `[${escaped || url}](<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>)`);
}
export function insertTable(value: string, selection: Selection, columns: number, rows: number): MarkdownEdit {
  const header = '| ' + Array.from({ length: columns }, (_, i) => `列 ${i + 1}`).join(' | ') + ' |';
  const divider = '| ' + Array(columns).fill('---').join(' | ') + ' |';
  const row = '| ' + Array(columns).fill('内容').join(' | ') + ' |';
  const prefix = selection.start ? '\n\n' : '';
  const table = prefix + [header, divider, ...Array<string>(rows).fill(row)].join('\n') + '\n\n';
  const result = replaceSelection(value, selection, table);
  const start = selection.start + prefix.length + 2;
  return { ...result, selection: { start, end: start + 3 } };
}
