import { theme } from '../../ui/theme';

const STYLE_ID = 'muchakucha-focus-ring';
const ring = `${theme.focus.width}px solid ${theme.colors.focusRing}`;

/**
 * Gives every focusable element on Web the vermilion keyboard ring that
 * Button draws itself: icon buttons, menu items, tabs, rows and scroll areas
 * would otherwise show the browser's own ring. `:focus-visible` keeps it to
 * keyboard focus, so a tap or a window focusing its close button shows none.
 * Text fields are left out; their ink border already marks focus.
 */
export function installFocusRing(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    `:focus-visible:not(input):not(textarea) { outline: ${ring}; outline-offset: ${theme.focus.offset}px; }`,
    `[data-focus-ring="inset"]:focus-visible { outline-offset: -${theme.focus.width}px; }`,
  ].join('\n');
  document.head.append(style);
}

/**
 * Draws the ring inside a control rather than around it, for a row that
 * fills a clipped group or touches the next row: an outer ring there would be
 * cut off or painted over.
 */
export const insetFocusRing = { dataSet: { focusRing: 'inset' } } as object;
