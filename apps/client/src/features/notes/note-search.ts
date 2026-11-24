import type { NoteResponseDto } from '@muchakucha/api-client';

import { parseSearchQuery } from '../search/search-query';
import { markdownExcerpt } from './markdown';

/** Where a body match sits, cut out of the body's plain text. */
export interface NoteSnippet {
  /** The text before the match, starting with … when the body goes on before it. */
  before: string;
  match: string;
  /** The text after the match, ending with … when the body goes on after it. */
  after: string;
}

export interface NoteSearchResult {
  note: NoteResponseDto;
  /** Where the body matched; null when only the title did, or nothing was searched. */
  snippet: NoteSnippet | null;
}

/** Characters kept before a match, and the length a snippet is filled to. */
const SNIPPET_BEFORE = 12;
const SNIPPET_LENGTH = 40;

const plainBodies = new WeakMap<NoteResponseDto, string>();

/** A note's body as plain text, worked out once per note the list received. */
export function plainBody(note: NoteResponseDto): string {
  let text = plainBodies.get(note);
  if (text === undefined) {
    text = markdownExcerpt(note.body ?? '');
    plainBodies.set(note, text);
  }
  return text;
}

/** The match with some text around it, cut at whole characters. */
function snippet(text: string, start: number, end: number): NoteSnippet {
  const head = Array.from(text.slice(0, start));
  const kept = head.slice(-SNIPPET_BEFORE);
  const match = text.slice(start, end);
  const tail = Array.from(text.slice(end));
  const room = Math.max(0, SNIPPET_LENGTH - kept.length - Array.from(match).length);
  return {
    before: (head.length > kept.length ? '…' : '') + kept.join('').trimStart(),
    match,
    after: tail.slice(0, room).join('').trimEnd() + (tail.length > room ? '…' : ''),
  };
}

/**
 * Searches titles and bodies on the client: `listNotes` already returns every
 * note in the household with its full text, so each keystroke is answered
 * without a round trip. Bodies are searched as plain text, the way the note
 * reads, not as Markdown. Words compare as every search box compares them —
 * see `parseSearchQuery` — and each word may be in the title or the body.
 *
 * A note whose body holds a word gets a snippet around the earliest one, so
 * the row can show why it matched; a title-only match shows the row as usual.
 * A blank query returns every note without snippets. Order is kept.
 */
export function searchNotes(notes: readonly NoteResponseDto[], query: string): NoteSearchResult[] {
  const search = parseSearchQuery(query);
  if (search.blank) return notes.map(note => ({ note, snippet: null }));
  return notes.flatMap(note => {
    const body = plainBody(note);
    if (!search.matches(note.title, body)) return [];
    const range = search.locate(body);
    return [{ note, snippet: range === null ? null : snippet(body, range.start, range.end) }];
  });
}
