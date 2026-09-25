import type { NoteResponseDto } from '@muchakucha/api-client';

/**
 * Folds a value into the form used for comparison: NFC so a title composed
 * differently from the query still matches, and lower case so the search is
 * case-insensitive for the Latin titles a household mixes in.
 */
function fold(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

/**
 * Title-only search, applied on the client because `listNotes` already returns
 * every note in the household: filtering here answers each keystroke without a
 * round trip and adds no request the server was not already serving.
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
  const needle = fold(query.trim());
  if (needle === '') return [...notes];
  return notes.filter((note) => fold(note.title).includes(needle));
}
