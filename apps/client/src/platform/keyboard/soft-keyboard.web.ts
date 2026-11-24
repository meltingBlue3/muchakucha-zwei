/**
 * A browser does not say whether a software keyboard is open, so on Web this
 * is always true and callers go by whether their field has focus.
 */
export function useSoftKeyboardShown(): boolean {
  return true;
}
