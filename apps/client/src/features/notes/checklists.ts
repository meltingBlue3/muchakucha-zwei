import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

/**
 * Checklists in our Markdown dialect, shared by the reading view, the editor
 * (inside its WebView) and the tick merge, so all three agree on what counts
 * as a checklist item and on its text. Nothing here may import React Native.
 *
 * A checklist is a bullet list whose every item begins with `[ ]`, `[x]` or
 * `[X]`. A list that mixes plain items with boxed ones stays a plain list and
 * its brackets stay text, so reading it in again never adds an empty box; an
 * ordered list stays ordered for the same reason. An item may be empty
 * (`- [ ]`): the editor writes one when a new item has no text yet.
 */
const MARKER = /^\[([ xX])\](?=\s|$)[ \t]*/;
/** The raw source of an item's first line, up to and including its box. */
const SOURCE_BOX = /^((?:[ \t]*(?:>|[-*+]|\d{1,9}[.)]))*[ \t]*)\[([ xX])\]/;

export interface ChecklistTick { index: number; text: string; checked: boolean }

/** An item's text as the merge compares it: line breaks as spaces, runs of space collapsed. */
export function checklistText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The plain text of an inline token: what a person reads, without Markdown syntax. */
export function inlineText(inline: Token | undefined, breaks = ' '): string {
  return (inline?.children ?? []).map(child => child.type === 'softbreak' || child.type === 'hardbreak' ? breaks : child.type === 'text' || child.type === 'code_inline' ? child.content : '').join('');
}

const installed = new WeakSet<object>();

/**
 * Marks checklists on the tokens: `data-type="taskList"` on the list,
 * `data-type="taskItem"` and `data-checked` on each item, and the box removed
 * from the item's text. The editor reads the attributes from the rendered HTML.
 * Installing it twice on one instance is a no-op.
 */
export function checklists(md: MarkdownIt): void {
  if (installed.has(md)) return;
  installed.add(md);
  md.core.ruler.push('note_checklists', state => { markChecklists(state.tokens); });
}

function markChecklists(tokens: Token[]): void {
  tokens.forEach((list, start) => {
    if (list.type !== 'bullet_list_open') return;
    const items: Array<{ open: Token; text: Token; checked: boolean }> = [];
    let plain = false;
    for (let i = start + 1; i < tokens.length && !plain; i++) {
      const token = tokens[i]!;
      if (token.type === 'bullet_list_close' && token.level === list.level) break;
      if (token.type !== 'list_item_open' || token.level !== list.level + 1) continue;
      const inline = tokens[i + 1]?.type === 'paragraph_open' ? tokens[i + 2] : undefined;
      const first = inline?.children?.[0];
      const marker = inline?.type === 'inline' ? MARKER.exec(inline.content) : null;
      // Escaped brackets (`\[ \]`) read as text: the raw source decides, and the
      // first text run, already unescaped, must still begin with the box.
      if (!marker || first?.type !== 'text' || !MARKER.test(first.content)) { plain = true; break; }
      items.push({ open: token, text: first, checked: marker[1] !== ' ' });
    }
    if (plain || items.length === 0) return;
    list.attrSet('data-type', 'taskList');
    for (const item of items) {
      item.open.attrSet('data-type', 'taskItem');
      item.open.attrSet('data-checked', item.checked ? 'true' : 'false');
      item.text.content = item.text.content.replace(MARKER, '');
    }
  });
}

/**
 * Applies one tick to `markdown`, as when someone else saved the note since
 * the box was ticked here. The item is the `index`-th checklist item counted
 * through the whole note, and is changed only while its text still equals
 * `text`. Returns the new Markdown, or null when that item is gone or its text
 * has changed. Only the box's characters change; the rest stays byte for byte.
 */
export function applyChecklistTick(markdown: string, tokens: Token[], { index, text, checked }: ChecklistTick): string | null {
  let seen = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== 'list_item_open' || token.attrGet('data-type') !== 'taskItem') continue;
    if (++seen !== index) continue;
    if (checklistText(inlineText(tokens[i + 2])) !== checklistText(text) || !token.map) return null;
    const lines = markdown.split('\n');
    const line = lines[token.map[0]];
    const box = line === undefined ? null : SOURCE_BOX.exec(line);
    if (!box || line === undefined) return null;
    lines[token.map[0]] = `${box[1]}[${checked ? 'x' : ' '}]${line.slice(box[0].length)}`;
    return lines.join('\n');
  }
  return null;
}
