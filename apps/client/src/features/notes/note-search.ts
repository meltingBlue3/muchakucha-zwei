import type { NoteResponseDto } from '@muchakucha/api-client';

import { parseSearchQuery } from '../search/search-query';

/**
 * Title-only search, applied on the client because `listNotes` already returns
 * every note in the household: filtering here answers each keystroke without a
 * round trip and adds no request the server was not already serving. Titles
 * are compared as every search box compares them — see `parseSearchQuery`.
 *
 * Body text is deliberately out of scope — a body match would need to show
 * where it matched to be understandable, which the card does not do.
 *
 * A blank or whitespace-only query returns everything, so clearing the field
 * restores the list rather than emptying it.
 */
export function searchNotesByTitle(
  notes: readonly NoteResponseDto[],
  query: string,
): NoteResponseDto[] {
  const search = parseSearchQuery(query);
  if (search.blank) return [...notes];
  return notes.filter((note) => search.matches(note.title));
}
