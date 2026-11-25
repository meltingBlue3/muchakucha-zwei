'use dom';

// The note editor: TipTap inside an Expo DOM component (ADR 0002). On Web it is
// an ordinary component; on Android and iOS it runs in its own WebView, so it
// cannot import theme.ts, i18n or anything from React Native. Colours, sizes
// and words arrive as props, and every call across the bridge carries JSON.

import { IS_DOM, useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from 'expo/dom';
import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import HardBreak from '@tiptap/extension-hard-break';
import { TaskItem, TaskList, type TaskItemOptions } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import Suggestion, { exitSuggestion, type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import { flip, size, type Middleware } from '@floating-ui/dom';
import { Markdown } from 'tiptap-markdown';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { checklists, checklistText, type ChecklistTick } from './checklists';

type Call = DOMImperativeFactory[string];
/** Commands from the page. Each returns nothing; results come back through the callbacks. */
export interface NoteEditorHandle extends DOMImperativeFactory {
  /** Replaces the document without reporting a change. */
  load: Call;
  toggleTaskList: Call; toggleBulletList: Call; toggleOrderedList: Call; setHeading: Call; toggleBold: Call;
  setLink: Call; insertTable: Call;
  /** `'title'`, `'start'` (of the body), `'end'`, or anything else for where the caret was. */
  focus: Call; blur: Call;
}

export interface NoteEditorChange {
  title: string;
  body: string;
  /** `tick` when the only change was one box, which a conflict can merge; anything else is an `edit`. */
  kind: 'tick' | 'edit';
  tick?: ChecklistTick;
}

export interface NoteEditorFormat {
  taskList: boolean; bulletList: boolean; orderedList: boolean; heading: number; bold: boolean; link: boolean;
  /** The caret is in the title line, where formatting does not apply. */
  inTitle: boolean;
  /** The selected text, for a link's label. */
  selection: string;
}

export type SlashCommand = 'taskList' | 'bulletList' | 'orderedList' | 'heading' | 'blockquote' | 'horizontalRule' | 'table' | 'codeBlock' | 'link';
const SLASH_COMMANDS: ReadonlyArray<{ key: SlashCommand; syntax: string }> = [
  { key: 'taskList', syntax: '- [ ]' },
  { key: 'bulletList', syntax: '-' },
  { key: 'orderedList', syntax: '1.' },
  { key: 'heading', syntax: '##' },
  { key: 'blockquote', syntax: '>' },
  { key: 'horizontalRule', syntax: '---' },
  { key: 'table', syntax: '| |' },
  { key: 'codeBlock', syntax: '```' },
  { key: 'link', syntax: '[ ]( )' },
];

export interface NoteEditorLabels {
  titlePlaceholder: string;
  /** The editing area's name, 「笔记内容」. */
  body: string;
  bodyPlaceholder: string;
  /** With `{{text}}` for the item's text, such as 「已勾选：{{text}}」. */
  checked: string;
  unchecked: string;
  emptyItem: string;
  /** The `/` menu's name and its items. */
  menu: string;
  menuEmpty: string;
  commands: Record<SlashCommand, string>;
}

export interface NoteEditorColors {
  ink: string; inkMuted: string; inkFaint: string; border: string; outline: string; separator: string;
  surface: string; surfaceMuted: string; surfaceSelected: string; link: string;
}

/** Sizes from theme.ts, chosen by the page for a wide reading pane or a phone. */
export interface NoteEditorMetrics {
  title: { fontSize: number; lineHeight: number; fontWeight: string };
  body: { fontSize: number; lineHeight: number };
  heading: { fontSize: number; lineHeight: number };
  section: { fontSize: number; lineHeight: number };
  small: { fontSize: number; lineHeight: number };
  /** Spacing steps 0, 1, 2, 3, 4, 6, 12 from theme.spacing. */
  space: [number, number, number, number, number, number, number];
  /** Left and right padding of the page, and its widest text column (0 for none). */
  gutter: number; readingWidth: number;
  radius: number; menuRadius: number; line: number; thick: number;
  box: number; boxRadius: number; touchTarget: number;
  menuWidth: number; menuLayer: number; shadow: string;
  fontFamily: string; monoFamily: string;
}

interface Props {
  ref?: Ref<NoteEditorHandle>;
  /** The note when the editor opens; later documents arrive through `load`. */
  initialTitle: string;
  initialBody: string;
  colors: NoteEditorColors;
  metrics: NoteEditorMetrics;
  labels: NoteEditorLabels;
  onReady: () => Promise<void>;
  onChange: (change: NoteEditorChange) => Promise<void>;
  onFormat: (format: NoteEditorFormat) => Promise<void>;
  onFocusChange: (focused: boolean) => Promise<void>;
  /** An input method is composing: the page holds its save until the words are chosen. */
  onComposing: (composing: boolean) => Promise<void>;
  /** 表格 and 链接 from the `/` menu: the page asks for the size or the address. */
  onRequest: (kind: 'table' | 'link', selection: string) => Promise<void>;
  /** Ctrl Enter (⌘ Enter): save now. */
  onSave: () => Promise<void>;
  dom?: DOMProps;
}

// ---------------------------------------------------------------------------
// The Markdown dialect (see markdown.ts): markdown-it, breaks: true, html: false,
// images literal, checklists per checklists.ts.

/**
 * The title waiting to go in front of the next parsed body. TipTap rebuilds an
 * extension's storage each time it is read, so this lives beside the editor.
 */
const pendingTitles = new WeakMap<Editor, string>();

/**
 * Images stay literal and checklists follow our rule. The title is not
 * Markdown: it waits in `pendingTitles` and the parse puts it in front of the
 * body as the document's first line.
 */
const Dialect = Extension.create<{ initialTitle: string }>({
  name: 'noteDialect',
  addOptions: () => ({ initialTitle: '' }),
  // Before tiptap-markdown parses the first content (its priority is lower).
  onBeforeCreate() { pendingTitles.set(this.editor, this.options.initialTitle); },
  addStorage: () => ({
    markdown: {
      parse: {
        setup(md: never) { (md as { disable(rule: string): void }).disable('image'); checklists(md); },
        updateDOM(this: { editor: Editor }, element: HTMLElement) {
          const pending = pendingTitles.get(this.editor);
          if (pending === undefined) return;
          pendingTitles.delete(this.editor);
          const title = document.createElement('h1');
          title.setAttribute('data-note-title', '');
          title.textContent = pending;
          element.prepend(title);
        },
      },
    },
  }),
});

// tiptap-markdown adds markdown-it-task-lists; our own rule replaces it.
const NoteTaskList = TaskList.extend({
  addStorage: () => ({ markdown: { parse: {} } }),
  addGlobalAttributes() {
    // tiptap-markdown keeps only bullet and ordered lists tight; a checklist needs the same or it is saved loose.
    return [{ types: ['taskList'], attributes: { tight: {
      default: true,
      parseHTML: (element: HTMLElement) => element.getAttribute('data-tight') === 'true' || !element.querySelector('p'),
      renderHTML: (attributes: { tight?: boolean }) => ({ 'data-tight': attributes.tight ? 'true' : null }),
    } } }];
  },
});

// With breaks: true a plain newline is a line break. A table cell has no line breaks in Markdown.
const PlainHardBreak = HardBreak.extend({
  addStorage: () => ({
    markdown: {
      serialize(state: { inTable?: boolean; write(text: string): void }, node: ProseMirrorNode, parent: ProseMirrorNode, index: number) {
        for (let i = index + 1; i < parent.childCount; i++) {
          if (parent.child(i).type !== node.type) { state.write(state.inTable ? ' ' : '\n'); return; }
        }
      },
      parse: {},
    },
  }),
});

interface SerializerState {
  inTable?: boolean;
  options: { escapeExtraCharacters?: RegExp | undefined };
  write(text?: string): void; text(text: string, escape?: boolean): void; ensureNewLine(): void;
  renderInline(node: ProseMirrorNode): void; closeBlock(node: ProseMirrorNode): void;
}

// HTML is off, so < and > need no escaping; only an & that would start an entity does, and | inside a table.
const TextNode = Node.create({ name: 'text', group: 'inline' }).extend({
  addStorage: () => ({
    markdown: {
      serialize(state: SerializerState, node: ProseMirrorNode) {
        const previous = state.options.escapeExtraCharacters;
        state.options.escapeExtraCharacters = state.inTable ? /&(?=#?[0-9a-z]+;)|\|/gi : /&(?=#?[0-9a-z]+;)/gi;
        state.text(node.text ?? '');
        state.options.escapeExtraCharacters = previous;
      },
      parse: {},
    },
  }),
});

// Column alignment, read from markdown-it's style="text-align: …" and written back as :--, :-: or --:.
const alignment = {
  align: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.textAlign || null,
    renderHTML: (attributes: { align?: string | null }) => attributes.align ? { style: `text-align: ${attributes.align}` } : {},
  },
};
const AlignedCell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...alignment }; } });
const AlignedHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...alignment }; } });
const DELIMITER: Record<string, string> = { left: ':--', center: ':-:', right: '--:' };
const MarkdownTable = Table.extend({
  addStorage: () => ({
    markdown: {
      // Always a Markdown table: a cell's paragraphs join with a space, since html is off.
      serialize(state: SerializerState, node: ProseMirrorNode) {
        state.inTable = true;
        node.forEach((row, _offset, index) => {
          state.write('| ');
          row.forEach((cell, _cellOffset, column) => {
            if (column) state.write(' | ');
            cell.forEach((block, _blockOffset, k) => {
              if (k) state.write(' ');
              if (block.isTextblock) state.renderInline(block); else state.text(block.textContent);
            });
          });
          state.write(' |');
          state.ensureNewLine();
          if (index === 0) {
            const columns: string[] = [];
            row.forEach(cell => { columns.push(DELIMITER[String(cell.attrs.align)] ?? '---'); });
            state.write(`| ${columns.join(' | ')} |`);
            state.ensureNewLine();
          }
        });
        state.closeBlock(node);
        state.inTable = false;
      },
      parse: {},
    },
  }),
});

// ---------------------------------------------------------------------------
// The title line and the document around it.

const NoteDocument = Node.create({ name: 'doc', topNode: true, content: 'title block+' });

function bodyStart(doc: ProseMirrorNode): number { return doc.firstChild?.nodeSize ?? 0; }

const inTitle = (editor: Editor) => editor.state.selection.$from.parent.type.name === 'title';

/** Enter in the title goes to the start of the body; it does not split the title. */
function leaveTitle(editor: Editor): boolean {
  return editor.chain().command(({ tr }) => {
    tr.setSelection(TextSelection.near(tr.doc.resolve(bodyStart(tr.doc) + 1)));
    return true;
  }).scrollIntoView().run();
}

const Title = Node.create({
  name: 'title',
  content: 'text*',
  marks: '',
  defining: true,
  parseHTML: () => [{ tag: 'h1[data-note-title]', priority: 60 }],
  renderHTML: ({ HTMLAttributes }) => ['h1', mergeAttributes(HTMLAttributes, { 'data-note-title': '', class: 'note-title' }), 0],
  addProseMirrorPlugins() {
    const { editor } = this;
    return [new Plugin({
      key: new PluginKey('noteTitleEnter'),
      props: {
        handleDOMEvents: {
          // Chrome on Android sends Enter past ProseMirror's keymap and splits the
          // line itself, unless the break it is about to insert is refused here.
          beforeinput: (_view, event) => {
            const { inputType } = event as InputEvent;
            if ((inputType !== 'insertParagraph' && inputType !== 'insertLineBreak') || !inTitle(editor)) return false;
            event.preventDefault();
            leaveTitle(editor);
            return true;
          },
        },
      },
    })];
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => inTitle(editor) && leaveTitle(editor),
      // At the very start of the body, Backspace goes back to the title instead of merging into it.
      Backspace: ({ editor }) => {
        const { selection, doc } = editor.state;
        if (!selection.empty || selection.$from.depth !== 1 || selection.$from.parentOffset !== 0 || selection.$from.before() !== bodyStart(doc)) return false;
        const first = doc.child(1);
        return editor.chain().command(({ tr }) => {
          if (first.content.size === 0 && doc.childCount > 2) tr.delete(bodyStart(doc), bodyStart(doc) + first.nodeSize);
          tr.setSelection(TextSelection.create(tr.doc, bodyStart(tr.doc) - 1));
          return true;
        }).run();
      },
      Delete: ({ editor }) => {
        const { selection, doc } = editor.state;
        if (!selection.empty || selection.$from.parent.type.name !== 'title' || selection.$from.parentOffset !== selection.$from.parent.content.size) return false;
        const first = doc.child(1);
        if (first.isTextblock && first.content.size === 0 && doc.childCount > 2) editor.commands.deleteRange({ from: bodyStart(doc), to: bodyStart(doc) + first.nodeSize });
        return true;
      },
    };
  },
});

/** Placeholder text on an empty title, and on the body while it is one empty line. */
const Placeholders = Extension.create<{ labels: () => NoteEditorLabels }>({
  name: 'notePlaceholders',
  addOptions: () => ({ labels: () => ({ titlePlaceholder: '', bodyPlaceholder: '' }) as NoteEditorLabels }),
  addProseMirrorPlugins() {
    const { labels } = this.options;
    return [new Plugin({
      key: new PluginKey('notePlaceholders'),
      props: {
        decorations: ({ doc }) => {
          const marks: Decoration[] = [];
          const title = doc.firstChild;
          if (title?.content.size === 0) marks.push(Decoration.node(0, title.nodeSize, { class: 'is-empty', 'data-placeholder': labels().titlePlaceholder }));
          const body = doc.childCount === 2 ? doc.child(1) : null;
          if (title && body?.type.name === 'paragraph' && body.content.size === 0) marks.push(Decoration.node(title.nodeSize, title.nodeSize + body.nodeSize, { class: 'is-empty', 'data-placeholder': labels().bodyPlaceholder }));
          return DecorationSet.create(doc, marks);
        },
      },
    })];
  },
});

// ---------------------------------------------------------------------------
// Checklist items: a tick changes only the box, never moves the caret or opens the keyboard.

function itemText(node: ProseMirrorNode): string {
  const first = node.firstChild;
  return checklistText(first ? first.textBetween(0, first.content.size, ' ', ' ') : '');
}

function tickOf(doc: ProseMirrorNode, position: number, checked: boolean): ChecklistTick {
  let index = 0;
  doc.nodesBetween(0, position, (node, at) => { if (node.type.name === 'taskItem' && at < position) index++; });
  return { index, text: itemText(doc.nodeAt(position)!), checked };
}

const NoteTaskItem = TaskItem.extend<TaskItemOptions & { labels: () => NoteEditorLabels }>({
  addOptions() { return { ...this.parent!(), nested: true, labels: () => ({}) as NoteEditorLabels }; },
  addStorage: () => ({ markdown: { parse: {} } }),
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const item = document.createElement('li');
      const label = document.createElement('label');
      const box = document.createElement('input');
      const content = document.createElement('div');
      const name = (current: ProseMirrorNode) => {
        const words = this.options.labels();
        return (current.attrs.checked ? words.checked : words.unchecked).replace('{{text}}', itemText(current) || words.emptyItem);
      };
      const show = (current: ProseMirrorNode) => {
        item.dataset.checked = String(current.attrs.checked);
        box.checked = Boolean(current.attrs.checked);
        box.setAttribute('aria-label', name(current));
      };
      item.dataset.type = 'taskItem';
      label.contentEditable = 'false';
      box.type = 'checkbox';
      // Keep focus where it is: ticking does not move the caret or open the keyboard.
      box.addEventListener('mousedown', event => event.preventDefault());
      box.addEventListener('change', () => {
        const position = getPos();
        if (typeof position !== 'number') return;
        const { state } = editor.view;
        const current = state.doc.nodeAt(position);
        if (!current) return;
        editor.view.dispatch(state.tr.setNodeMarkup(position, undefined, { ...current.attrs, checked: box.checked }).setMeta('noteTick', tickOf(state.doc, position, box.checked)));
      });
      label.append(box);
      item.append(label, content);
      show(node);
      return {
        dom: item,
        contentDOM: content,
        // The box is ours; ProseMirror must not treat a tap on it as a click in the text.
        stopEvent: event => label.contains(event.target as globalThis.Node),
        ignoreMutation: mutation => mutation.type !== 'selection' && !content.contains(mutation.target),
        update: updated => {
          if (updated.type !== node.type) return false;
          show(updated);
          return true;
        },
      };
    };
  },
});

// ---------------------------------------------------------------------------
// The `/` menu.

interface SlashState { items: SlashCommand[]; active: number; command: (key: SlashCommand) => void }
const slashKey = new PluginKey('noteSlash');

/**
 * Where the `/` menu goes: below the line, or above it when it fits there and
 * not below, and then only as tall as that side leaves, scrolling inside it, as
 * a phone's keyboard may leave less room than the whole menu. The side is chosen
 * by the list's full height rather than the height the last placement left it.
 * The room is handed to the list inside the positioned layer, which React redraws.
 */
function slashMenuPlacement(padding: number, tallest: number): Middleware[] {
  const fullHeight: Middleware = {
    name: 'noteSlashFullHeight',
    fn: ({ rects, elements }) => {
      const list = elements.floating.firstElementChild;
      if (!(list instanceof HTMLElement)) return {};
      const height = Math.min(tallest, list.scrollHeight + list.offsetHeight - list.clientHeight);
      return height > rects.floating.height ? { reset: { rects: { reference: rects.reference, floating: { ...rects.floating, height } } } } : {};
    },
  };
  return [fullHeight, flip({ padding }), size({
    padding,
    apply: ({ availableHeight, elements }) => { elements.floating.style.setProperty('--note-slash-room', `${Math.max(0, Math.floor(availableHeight))}px`); },
  })];
}

function bodyOf(editor: Editor): { title: string; body: string } {
  const { doc } = editor.state;
  const title = doc.firstChild?.type.name === 'title' ? doc.firstChild.textContent : '';
  const rest = doc.type.create(null, doc.content.cut(bodyStart(doc)));
  const serializer = (editor.storage as unknown as { markdown: { serializer: { serialize(node: ProseMirrorNode): string } } }).markdown.serializer;
  // A table ends its last row with a newline; trailing newlines mean nothing at the end of a note.
  return { title, body: serializer.serialize(rest).replace(/\n+$/, '') };
}

function formatOf(editor: Editor): NoteEditorFormat {
  const { from, to, $from } = editor.state.selection;
  return {
    taskList: editor.isActive('taskList'),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    heading: [1, 2, 3, 4, 5, 6].find(level => editor.isActive('heading', { level })) ?? 0,
    bold: editor.isActive('bold'),
    link: editor.isActive('link'),
    inTitle: $from.parent.type.name === 'title',
    selection: editor.state.doc.textBetween(from, to, ' ').slice(0, 200),
  };
}

function css(c: NoteEditorColors, m: NoteEditorMetrics): string {
  const [s0, s1, s2, s3, s4, s6, s12] = m.space;
  const reach = (m.touchTarget - m.box) / 2;
  return `
  ${IS_DOM ? `html, body, #root { height: 100%; margin: ${s0}px; padding: ${s0}px; } body { background: ${c.surface}; -webkit-text-size-adjust: 100%; }` : ''}
  /* The text fills the page below its last line, so a tap anywhere on it writes. Expo's #root is a row. */
  .note-editor { flex: 1; min-width: ${s0}px; height: 100%; display: flex; flex-direction: column; overflow-y: auto; -webkit-overflow-scrolling: touch; color: ${c.ink}; font-family: ${m.fontFamily}, system-ui, sans-serif; }
  .note-editor-content { flex: 1 0 auto; display: flex; flex-direction: column; }
  .note-editor .ProseMirror { flex: 1 0 auto; width: 100%; box-sizing: border-box; padding: ${s2}px ${m.gutter}px ${s12}px; ${m.readingWidth ? `max-width: ${m.readingWidth + m.gutter * 2}px; margin-left: auto; margin-right: auto;` : ''} outline: none; font-size: ${m.body.fontSize}px; line-height: ${m.body.lineHeight}px; caret-color: ${c.ink}; overflow-wrap: anywhere; }
  .note-editor .ProseMirror > * + * { margin-top: ${s2}px; }
  .note-editor h1.note-title { font-size: ${m.title.fontSize}px; line-height: ${m.title.lineHeight}px; font-weight: ${m.title.fontWeight}; margin: ${s0}px ${s0}px ${s3}px; }
  .note-editor .is-empty::before { content: attr(data-placeholder); color: ${c.inkFaint}; float: left; height: ${s0}px; pointer-events: none; font-weight: inherit; }
  .note-editor p { margin: ${s0}px; }
  .note-editor h1:not(.note-title) { font-size: ${m.heading.fontSize}px; line-height: ${m.heading.lineHeight}px; margin: ${s4}px ${s0}px ${s0}px; }
  .note-editor h2 { font-size: ${m.section.fontSize}px; line-height: ${m.section.lineHeight}px; margin: ${s4}px ${s0}px ${s0}px; }
  .note-editor h3, .note-editor h4, .note-editor h5, .note-editor h6 { font-size: ${m.body.fontSize}px; line-height: ${m.body.lineHeight}px; margin: ${s3}px ${s0}px ${s0}px; }
  .note-editor h6 { color: ${c.inkMuted}; }
  .note-editor ul, .note-editor ol { margin: ${s0}px; padding-left: ${s6}px; }
  .note-editor li > * + * { margin-top: ${s1}px; }
  .note-editor blockquote { margin: ${s0}px; padding-left: ${s3}px; border-left: ${m.thick}px solid ${c.outline}; color: ${c.inkMuted}; }
  .note-editor code { background: ${c.surfaceMuted}; border-radius: ${s1}px; padding: ${s0}px ${s1}px; font-family: ${m.monoFamily}; font-size: 0.9em; }
  .note-editor pre { background: ${c.surfaceMuted}; padding: ${s2}px ${s3}px; border-radius: ${m.radius}px; overflow-x: auto; }
  .note-editor pre code { background: none; padding: ${s0}px; }
  .note-editor a { color: ${c.link}; text-decoration: underline; }
  .note-editor hr { border: ${s0}px; border-top: ${m.line}px solid ${c.separator}; margin-top: ${s3}px; margin-bottom: ${s3}px; }
  .note-editor .tableWrapper { overflow-x: auto; }
  .note-editor table { border-collapse: collapse; }
  .note-editor td, .note-editor th { border: ${m.line}px solid ${c.separator}; padding: ${s1}px ${s2}px; min-width: ${s12}px; vertical-align: top; }
  .note-editor th { background: ${c.surfaceMuted}; font-weight: 700; }
  .note-editor .selectedCell { background: ${c.surfaceSelected}; }
  .note-editor ul[data-type="taskList"] { list-style: none; padding-left: ${s0}px; }
  .note-editor ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: ${s2}px; }
  .note-editor ul[data-type="taskList"] li > label { flex: none; display: flex; padding: ${reach}px ${s1}px ${reach}px ${reach}px; margin: ${-reach}px ${-s1}px ${-reach}px ${-reach}px; margin-top: ${(m.body.lineHeight - m.box) / 2 - reach}px; user-select: none; -webkit-user-select: none; cursor: pointer; }
  .note-editor ul[data-type="taskList"] li > div { flex: 1; min-width: ${s0}px; }
  .note-editor input[type="checkbox"] { appearance: none; -webkit-appearance: none; flex: none; width: ${m.box}px; height: ${m.box}px; margin: ${s0}px; border: ${m.thick}px solid ${c.border}; border-radius: ${m.boxRadius}px; background: ${c.surface}; display: grid; place-items: center; cursor: pointer; }
  .note-editor input[type="checkbox"]:checked { background: ${c.ink}; border-color: ${c.ink}; }
  .note-editor input[type="checkbox"]:checked::after { content: ""; width: ${m.box / 2}px; height: ${m.box / 4}px; border-left: ${m.thick}px solid ${c.surface}; border-bottom: ${m.thick}px solid ${c.surface}; transform: translateY(-${m.line}px) rotate(-45deg); }
  .note-editor li[data-checked="true"] > div > p:first-child { color: ${c.inkFaint}; text-decoration: line-through; text-decoration-color: ${c.border}; }
  .note-slash-layer { z-index: ${m.menuLayer}; }
  .note-slash-menu { width: ${m.menuWidth}px; max-height: min(${m.menuWidth}px, var(--note-slash-room, ${m.menuWidth}px)); overflow-y: auto; box-sizing: border-box; padding: ${s1}px; background: ${c.surface}; border: ${m.line}px solid ${c.separator}; border-radius: ${m.menuRadius}px; box-shadow: ${m.shadow}; font-family: ${m.fontFamily}, system-ui, sans-serif; font-size: ${m.small.fontSize}px; line-height: ${m.small.lineHeight}px; color: ${c.ink}; }
  .note-slash-item { display: flex; align-items: center; justify-content: space-between; gap: ${s3}px; padding: ${s2}px ${s3}px; border-radius: ${m.radius}px; cursor: pointer; }
  .note-slash-item[aria-selected="true"] { background: ${c.surfaceSelected}; }
  .note-slash-syntax { color: ${c.inkFaint}; font-family: ${m.monoFamily}; white-space: pre; }
  .note-slash-empty { padding: ${s2}px ${s3}px; color: ${c.inkMuted}; }
  `;
}

export default function NoteEditor({ ref, initialTitle, initialBody, colors, metrics, labels, onReady, onChange, onFormat, onFocusChange, onComposing, onRequest, onSave }: Props) {
  const words = useRef(labels);
  words.current = labels;
  const sizes = useRef(metrics);
  sizes.current = metrics;
  const callbacks = useRef({ onChange, onFormat, onFocusChange, onComposing, onRequest, onSave });
  callbacks.current = { onChange, onFormat, onFocusChange, onComposing, onRequest, onSave };
  // What was last reported or loaded; an update that serializes the same is not a change.
  const reported = useRef<string | null>(null);
  const lastFormat = useRef('');
  // Our own flag: ProseMirror's view.composing missed a Chromium composition in the spike.
  const composing = useRef(false);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;
  // The positioned layer the `/` menu floats in.
  const menu = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const layer = document.createElement('div');
    layer.className = 'note-slash-layer';
    return layer;
  }, []);

  const report = (editor: Editor, tick?: ChecklistTick) => {
    if (composing.current || editor.view.composing) return;
    const content = bodyOf(editor);
    const key = JSON.stringify(content);
    if (key === reported.current) return;
    reported.current = key;
    void callbacks.current.onChange({ ...content, kind: tick ? 'tick' : 'edit', ...(tick ? { tick } : {}) });
  };
  const reportFormat = (editor: Editor) => {
    const format = formatOf(editor);
    const key = JSON.stringify(format);
    if (key === lastFormat.current) return;
    lastFormat.current = key;
    void callbacks.current.onFormat(format);
  };

  const slashExtension = useMemo(() => Extension.create({
    name: 'noteSlashMenu',
    addProseMirrorPlugins() {
      return [Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        pluginKey: slashKey,
        char: '/',
        flip: false,
        floatingUi: { middleware: slashMenuPlacement(sizes.current.space[2], sizes.current.menuWidth) },
        // Only at the start of a line or after a space, and never in the title or in code.
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name === 'title' || $from.parent.type.spec.code) return false;
          const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
          return before === '' || /\s$/.test(before);
        },
        items: ({ query }) => {
          const wanted = query.trim().toLowerCase();
          return SLASH_COMMANDS.filter(({ key, syntax }) => !wanted || words.current.commands[key].toLowerCase().includes(wanted) || key.toLowerCase().startsWith(wanted) || syntax.startsWith(wanted)).map(({ key }) => key);
        },
        command: ({ editor, range, props: key }) => {
          const chain = editor.chain().focus().deleteRange(range);
          if (key === 'taskList') chain.toggleTaskList();
          else if (key === 'bulletList') chain.toggleBulletList();
          else if (key === 'orderedList') chain.toggleOrderedList();
          else if (key === 'heading') chain.setHeading({ level: 2 });
          else if (key === 'blockquote') chain.toggleBlockquote();
          else if (key === 'horizontalRule') chain.setHorizontalRule();
          else if (key === 'codeBlock') chain.toggleCodeBlock();
          chain.run();
          if (key === 'table' || key === 'link') void callbacks.current.onRequest(key, '');
        },
        render: () => {
          let unmount: (() => void) | null = null;
          const open = (props: SuggestionProps<SlashCommand, SlashCommand>) => {
            setSlash(current => ({ items: props.items, active: current && current.items.join() === props.items.join() ? current.active : 0, command: props.command }));
          };
          return {
            onStart: props => {
              open(props);
              if (!menu) return;
              // On Web a phone's note window is a modal dialog over the page: the menu joins
              // that dialog, as the app's other menus do, instead of sinking under it.
              (props.editor.view.dom.closest('[aria-modal="true"]') ?? document.body).append(menu);
              unmount = props.mount(menu);
            },
            onUpdate: open,
            onExit: () => { unmount?.(); unmount = null; menu?.remove(); setSlash(null); },
            onKeyDown: ({ event }: SuggestionKeyDownProps) => {
              const current = slashRef.current;
              if (!current) return false;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const step = event.key === 'ArrowDown' ? 1 : -1;
                setSlash({ ...current, active: (current.active + step + current.items.length) % Math.max(1, current.items.length) });
                return true;
              }
              if (event.key === 'Enter') {
                const key = current.items[current.active];
                if (key) current.command(key);
                return Boolean(key);
              }
              return false;
            },
          };
        },
      })];
    },
  }), [menu]);

  const shortcuts = useMemo(() => Extension.create({
    name: 'noteShortcuts',
    addKeyboardShortcuts: () => ({ 'Mod-Enter': () => { void callbacks.current.onSave(); return true; } }),
  }), []);

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        document: false, hardBreak: false, underline: false, text: false,
        link: { openOnClick: false, autolink: false, linkOnPaste: true, protocols: ['http', 'https', 'mailto'], isAllowedUri: url => /^(https?:|mailto:)/i.test(url), HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null } },
      }),
      NoteDocument, Title, TextNode, PlainHardBreak,
      NoteTaskList, NoteTaskItem.configure({ labels: () => words.current }),
      MarkdownTable.configure({ resizable: false }), TableRow, AlignedHeader, AlignedCell,
      Dialect.configure({ initialTitle }),
      Placeholders.configure({ labels: () => words.current }),
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: false, breaks: true, transformPastedText: true, transformCopiedText: true }),
      slashExtension, shortcuts,
    ],
    content: initialBody,
    editorProps: {
      attributes: { 'aria-label': labels.body, 'aria-multiline': 'true', role: 'textbox' },
      // A copied title pastes as an ordinary heading.
      transformPastedHTML: html => html.replace(/data-note-title/g, 'data-pasted-title'),
    },
    onCreate: ({ editor: created }) => {
      reported.current = JSON.stringify(bodyOf(created));
      // onCreate can run during the first render; report after it.
      setTimeout(() => { reportFormat(created); void onReady(); }, 0);
    },
    onUpdate: ({ editor: updated, transaction }) => report(updated, transaction.getMeta('noteTick') as ChecklistTick | undefined),
    onSelectionUpdate: ({ editor: current }) => reportFormat(current),
    onTransaction: ({ editor: current }) => reportFormat(current),
    onFocus: () => { void callbacks.current.onFocusChange(true); },
    onBlur: ({ editor: current }) => {
      // A composition that never ended must not hold back the last words.
      if (composing.current) { composing.current = false; void callbacks.current.onComposing(false); report(current); }
      void callbacks.current.onFocusChange(false);
    },
  });

  // Composition: nothing is reported until the words are chosen.
  useEffect(() => {
    if (!editor) return undefined;
    const dom = editor.view.dom;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => { composing.current = true; clearTimeout(timer); void callbacks.current.onComposing(true); };
    // ProseMirror applies the chosen words shortly after compositionend.
    const end = () => {
      composing.current = false;
      clearTimeout(timer);
      timer = setTimeout(() => { if (!editor.isDestroyed) report(editor); void callbacks.current.onComposing(false); }, 50);
    };
    dom.addEventListener('compositionstart', start);
    dom.addEventListener('compositionend', end);
    return () => { clearTimeout(timer); dom.removeEventListener('compositionstart', start); dom.removeEventListener('compositionend', end); };
    // report reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // The keyboard, and then the format toolbar above it, each shrink the page: keep
  // the caret's line in sight once the page has taken its new size.
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = pane.current;
    if (!editor || !node || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (!editor.isDestroyed && editor.isFocused) editor.commands.scrollIntoView(); });
    });
    observer.observe(node);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [editor]);

  // On Web the page's toolbar is in the same document: pressing it must not take focus from the text.
  // Escape closes an open `/` menu before the pane around the editor sees it.
  useEffect(() => {
    if (!editor || IS_DOM) return undefined;
    const keep = (event: MouseEvent) => { if ((event.target as Element | null)?.closest?.('#note-toolbar')) event.preventDefault(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !slashRef.current || !editor.view.dom.contains(event.target as globalThis.Node)) return;
      event.preventDefault();
      event.stopPropagation();
      exitSuggestion(editor.view, slashKey);
    };
    document.addEventListener('mousedown', keep, true);
    window.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('mousedown', keep, true); window.removeEventListener('keydown', escape, true); };
  }, [editor]);

  useDOMImperativeHandle(ref as Ref<NoteEditorHandle>, () => ({
    load(body, title) {
      if (!editor || editor.isDestroyed) return;
      pendingTitles.set(editor, String(title ?? ''));
      editor.chain().command(({ tr }) => { tr.setMeta('addToHistory', false); return true; }).setContent(String(body ?? ''), { emitUpdate: false }).run();
      reported.current = JSON.stringify(bodyOf(editor));
    },
    toggleTaskList() { editor?.chain().focus().toggleTaskList().run(); },
    toggleBulletList() { editor?.chain().focus().toggleBulletList().run(); },
    toggleOrderedList() { editor?.chain().focus().toggleOrderedList().run(); },
    setHeading(level) {
      const value = Number(level);
      if (value >= 1 && value <= 6) editor?.chain().focus().toggleHeading({ level: value as 1 | 2 | 3 | 4 | 5 | 6 }).run();
      else editor?.chain().focus().setParagraph().run();
    },
    toggleBold() { editor?.chain().focus().toggleBold().run(); },
    setLink(href, label) {
      const url = String(href);
      if (!editor || !/^(https?:|mailto:)/i.test(url)) return;
      const text = String(label ?? '').trim() || editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ') || url;
      editor.chain().focus().insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href: url } }] }).run();
    },
    insertTable(columns, rows, headings) {
      if (!editor) return;
      // Named columns, so the header row is never empty; the first name is selected to type over.
      const names = Array.isArray(headings) ? headings.map(String) : [];
      const cell = (type: 'tableHeader' | 'tableCell', text: string) => ({ type, content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }] });
      const from = editor.state.selection.from;
      editor.chain().focus().insertContent({ type: 'table', content: [
        { type: 'tableRow', content: Array.from({ length: Number(columns) }, (_, column) => cell('tableHeader', names[column] ?? '')) },
        ...Array.from({ length: Number(rows) }, () => ({ type: 'tableRow', content: Array.from({ length: Number(columns) }, () => cell('tableCell', '')) })),
      ] }).run();
      let first: { from: number; to: number } | null = null;
      editor.state.doc.nodesBetween(Math.max(0, from - 1), editor.state.doc.content.size, (node, position) => {
        if (first || node.type.name !== 'tableHeader') return !first;
        first = { from: position + 2, to: position + node.nodeSize - 2 };
        return false;
      });
      if (first) editor.commands.setTextSelection(first);
    },
    focus(where) {
      if (!editor) return;
      if (where === 'title') editor.commands.focus(1);
      else if (where === 'start') editor.commands.focus(bodyStart(editor.state.doc) + 1);
      else if (where === 'end') editor.commands.focus('end');
      // Anything else returns to where the caret was, as after a link or table step.
      else editor.commands.focus();
    },
    blur() { editor?.commands.blur(); },
  }), [editor]);

  const style = useMemo(() => css(colors, metrics), [colors, metrics]);
  const activeId = slash ? `note-slash-${slash.items[slash.active] ?? 'none'}` : undefined;
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    if (activeId) { dom.setAttribute('aria-activedescendant', activeId); dom.setAttribute('aria-controls', 'note-slash-menu'); dom.setAttribute('aria-expanded', 'true'); }
    else { dom.removeAttribute('aria-activedescendant'); dom.removeAttribute('aria-controls'); dom.removeAttribute('aria-expanded'); }
  }, [editor, activeId]);

  return <div className="note-editor" ref={pane}>
    <style>{style}</style>
    <EditorContent editor={editor} className="note-editor-content" />
    {menu && slash ? createPortal(<div id="note-slash-menu" className="note-slash-menu" role="listbox" aria-label={labels.menu} onMouseDown={event => event.preventDefault()}>
      {slash.items.length ? slash.items.map((key, index) => <div key={key} id={`note-slash-${key}`} role="option" aria-selected={index === slash.active} className="note-slash-item" onMouseEnter={() => setSlash({ ...slash, active: index })} onClick={() => slash.command(key)}>
        <span>{labels.commands[key]}</span>
        <span className="note-slash-syntax" aria-hidden="true">{SLASH_COMMANDS.find(item => item.key === key)?.syntax}</span>
      </div>) : <div className="note-slash-empty">{labels.menuEmpty}</div>}
    </div>, menu) : null}
  </div>;
}
