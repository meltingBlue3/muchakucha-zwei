import { memberColors, theme } from '../theme';

const luminance = (hex: string): number => {
  const channels = hex.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Expected six-digit hex color, received ${hex}`);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
};

const contrast = (foreground: string, background: string): number => {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

describe('measured WCAG 2.2 AA palette contract', () => {
  test('computes at least 4.5:1 for ink, muted and faint text on paper and white', () => {
    for (const text of [theme.colors.ink, theme.colors.inkMuted, theme.colors.inkFaint]) {
      expect(contrast(text, theme.colors.canvas)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(theme.colors.inkMuted, theme.colors.surfaceMuted)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.inkMuted, theme.colors.surfaceSelected)).toBeGreaterThanOrEqual(4.5);
  });

  test('computes at least 4.5:1 for white text on ink, vermilion, success, and destructive fills', () => {
    for (const fill of [theme.colors.primary, theme.colors.accent, theme.colors.success, theme.colors.destructive]) {
      expect(contrast(theme.colors.surface, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('keeps vermilion readable as text on paper, white, and its own soft wash', () => {
    expect(contrast(theme.colors.accent, theme.colors.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.accent, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.accentStrong, theme.colors.accentSoft)).toBeGreaterThanOrEqual(4.5);
  });

  test('computes at least 3:1 for input borders and other non-text control boundaries', () => {
    expect(contrast(theme.colors.border, theme.colors.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme.colors.border, theme.colors.canvas)).toBeGreaterThanOrEqual(3);
  });

  test('computes at least 3:1 for the focus ring against adjacent canvas and surface colors', () => {
    expect(contrast(theme.colors.focusRing, theme.colors.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme.colors.focusRing, theme.colors.surface)).toBeGreaterThanOrEqual(3);
  });

  test('computes at least 4.5:1 for links on canvas and muted status surfaces', () => {
    expect(contrast(theme.colors.link, theme.colors.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.link, theme.colors.surfaceMuted)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.link, theme.colors.accentSoft)).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps pressed fills above AA instead of relying on opacity', () => {
    expect(contrast(theme.colors.surface, theme.colors.primaryPressed)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.surface, theme.colors.accentStrong)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.surface, theme.colors.destructivePressed)).toBeGreaterThanOrEqual(4.5);
  });

  test('pairs success, error, and disabled colors with readable text and non-color semantics', () => {
    expect(contrast(theme.colors.success, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.ink, theme.colors.successSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.ink, theme.colors.destructiveSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.destructive, theme.colors.destructiveSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.ink, theme.colors.disabled)).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps white initials readable on every member color', () => {
    for (const color of memberColors) {
      expect(contrast(theme.colors.surface, color)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
