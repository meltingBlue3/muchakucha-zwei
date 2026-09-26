import type { TextInput } from 'react-native';
// RN Web exposes its underlying textarea through the input ref. Reading on
// blur also captures selections made by browser actions without an onSelect.
export function readTextSelection(input: TextInput | null): { start: number; end: number } | null {
  if (input && 'selectionStart' in input && 'selectionEnd' in input && typeof input.selectionStart === 'number' && typeof input.selectionEnd === 'number') {
    return { start: input.selectionStart, end: input.selectionEnd };
  }
  return null;
}
