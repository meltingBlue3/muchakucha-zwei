import { theme } from '../../ui/theme';

const STYLE_ID = 'muchakucha-scrollbars';

/**
 * Classic scrollbars take layout width, as on Windows; overlay ones, the
 * macOS default and every phone, take none and already fade out of the way.
 */
function drawsClassicScrollbars(): boolean {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll';
  document.documentElement.append(probe);
  const width = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return width > 0;
}

/**
 * Replaces the browser's grey, arrowed scrollbar with a thin ink thumb on a
 * clear track, which thickens and darkens under the pointer or while dragged.
 * The thumb's transparent border keeps the whole gutter grabbable. Firefox
 * has no scrollbar pseudo-elements and takes the standard thin scrollbar.
 */
export function installScrollbars(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) || !drawsClassicScrollbars()) return;
  const { gutter, thumb, thumbActive } = theme.scrollbar;
  const { scrollbarThumb, scrollbarThumbActive } = theme.colors;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    `::-webkit-scrollbar { width: ${gutter}px; height: ${gutter}px; }`,
    '::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }',
    `::-webkit-scrollbar-thumb { background-color: ${scrollbarThumb}; background-clip: padding-box; border: ${(gutter - thumb) / 2}px solid transparent; border-radius: ${gutter}px; }`,
    `::-webkit-scrollbar-thumb:hover, ::-webkit-scrollbar-thumb:active { background-color: ${scrollbarThumbActive}; border-width: ${(gutter - thumbActive) / 2}px; }`,
    `@supports not selector(::-webkit-scrollbar) { * { scrollbar-width: thin; scrollbar-color: ${scrollbarThumb} transparent; } }`,
  ].join('\n');
  document.head.append(style);
}
