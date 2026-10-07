import { createTheme } from '@shopify/restyle';
import { numericFontFamily, numericStrongFontFamily, systemFontFamily } from '../platform/typography/font-family';

export type ColorScheme = 'light' | 'dark';

/**
 * 纸 · 墨 · 朱 — paper, ink and vermilion.
 *
 * Paper and ink carry the interface; ink also fills the primary action.
 * Vermilion is kept for "now and needs attention" — today, the current time,
 * overdue and urgent — so it still means something when it appears. Colour
 * otherwise comes from the family itself: member avatars and labels.
 */
export const theme = createTheme({
  /** Drives native chrome whose contrast must follow the active app theme. */
  colorScheme: 'light' as ColorScheme,
  colors: {
    canvas: '#F6F4EF',
    surface: '#FFFFFF',
    /** Pressed rows, sunken fields and quiet fills. */
    surfaceMuted: '#EFECE6',
    /** Lightest wash, for hover and grouped backgrounds on a white surface. */
    surfaceSubtle: '#FAF8F4',
    /** The current navigation destination or selected row. */
    surfaceSelected: '#EAE6DF',
    ink: '#1D1B18',
    inkMuted: '#5F5A52',
    /** Metadata on paper or white; not for text on `surfaceMuted`. */
    inkFaint: '#736E66',
    /** Boundaries a control needs to be recognised by (inputs, checkboxes). */
    border: '#8E887E',
    /** Edge of a secondary button or chip whose label already names it. */
    outline: '#D8D3CA',
    separator: '#E5E1D9',
    primary: '#1D1B18',
    primaryPressed: '#3A3631',
    accent: '#C2381C',
    /** Pressed accent fills, and accent text on `accentSoft`. */
    accentStrong: '#9E2E16',
    accentSoft: '#FBE8E1',
    success: '#2F6B4F',
    successSoft: '#E3EFE8',
    destructive: '#A61B1B',
    destructivePressed: '#841515',
    destructiveSoft: '#FBE3E1',
    focusRing: '#C2381C',
    link: '#1D1B18',
    disabled: '#DDD9D1',
    transparent: 'transparent',
    overlay: 'rgba(29,27,24,0.60)',
    dialogOverlay: 'rgba(29,27,24,0.20)',
  },
  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
  },
  breakpoints: {
    compact: 0,
    mobile: 360,
    web: 768,
  },
  borderRadii: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 999,
  },
  borderWidths: {
    default: 1,
    focus: 2,
  },
  fontFamilies: {
    regular: systemFontFamily,
    medium: systemFontFamily,
    semibold: systemFontFamily,
    /** Inter with tabular figures, for times, dates and counts. */
    numeric: numericFontFamily,
    numericStrong: numericStrongFontFamily,
  },
  typography: {
    caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
    meta: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
    bodySm: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    label: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
    button: { fontSize: 15, fontWeight: '600' as const, lineHeight: 20 },
    section: { fontSize: 17, fontWeight: '600' as const, lineHeight: 24 },
    heading: { fontSize: 22, fontWeight: '700' as const, lineHeight: 30 },
    display: { fontSize: 30, fontWeight: '700' as const, lineHeight: 38 },
    time: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
    numeral: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20 },
  },
  textVariants: {
    defaults: {
      color: 'ink',
      fontFamily: systemFontFamily,
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
    },
    caption: {
      color: 'inkMuted',
      fontFamily: systemFontFamily,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    meta: {
      color: 'inkMuted',
      fontFamily: systemFontFamily,
      fontSize: 13,
      fontWeight: '400',
      lineHeight: 18,
    },
    bodySm: {
      color: 'inkMuted',
      fontFamily: systemFontFamily,
      fontSize: 14,
      fontWeight: '400',
      lineHeight: 20,
    },
    body: {
      color: 'ink',
      fontFamily: systemFontFamily,
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
    },
    label: {
      color: 'ink',
      fontFamily: systemFontFamily,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
    button: {
      color: 'surface',
      fontFamily: systemFontFamily,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
    },
    section: {
      color: 'ink',
      fontFamily: systemFontFamily,
      fontSize: 17,
      fontWeight: '600',
      lineHeight: 24,
    },
    heading: {
      color: 'ink',
      fontFamily: systemFontFamily,
      fontSize: 22,
      fontWeight: '700',
      lineHeight: 30,
    },
    display: {
      color: 'ink',
      fontFamily: systemFontFamily,
      fontSize: 30,
      fontWeight: '700',
      lineHeight: 38,
    },
    /** A clock time or short date beside a row, in tabular figures. */
    time: {
      color: 'inkMuted',
      fontFamily: numericFontFamily,
      fontSize: 13,
      fontWeight: '400',
      lineHeight: 18,
    },
    /** A standalone number such as a calendar day or a count. */
    numeral: {
      color: 'ink',
      fontFamily: numericFontFamily,
      fontSize: 15,
      fontWeight: '400',
      lineHeight: 20,
    },
  },
  controlSizes: {
    touchTarget: 48,
    field: 48,
    primary: 48,
    /** A small pill for secondary actions in a header, a row or a phone sheet; its hit area stays `touchTarget`. */
    compact: 36,
    fab: 56,
    icon: 20,
    iconStroke: 1.75,
    checkbox: 22,
    avatarSm: 22,
    avatar: 28,
    avatarLg: 44,
  },
  focus: {
    width: 2,
    offset: 2,
  },
  elevation: {
    softWeb: '0 1px 2px rgba(29,27,24,0.06), 0 8px 24px rgba(29,27,24,0.08)',
    native: 0,
  },
  shadow: {
    soft: '0 1px 2px rgba(29,27,24,0.06), 0 8px 24px rgba(29,27,24,0.08)',
    raised: '0 2px 6px rgba(29,27,24,0.12), 0 10px 28px rgba(29,27,24,0.16)',
  },
  layout: {
    authWideBreakpoint: 960,
    authLayoutMaxWidth: 1040,
    authCardMaxWidth: 420,
    compactInset: 16,
    mobileInset: 20,
    webCardPadding: 32,
    householdMaxWidth: 960,
    /** A single reading column, such as a list page on a wide screen. */
    contentMaxWidth: 720,
    navigationBreakpoint: 1024,
    navigationWidth: 248,
    assistantReadingWidth: 760,
    assistantInspectorWidth: 320,
    assistantInspectorBreakpoint: 1280,
    switcherWidth: 360,
    switcherMaxHeight: 480,
    settingsNavWidth: 280,
    accountMenuWidth: 200,
    accountMenuHeight: 168,
    dialogMaxWidth: 440,
    editorDialogMaxWidth: 640,
    editorSheetBreakpoint: 600,
    /** A task, event or note window docked beside the page on a wide screen. */
    dockedPanelWidth: 480,
    formColumnsBreakpoint: 480,
    /** Width of the time column in a timeline or agenda row. */
    timeColumn: 60,
    /** Name column of a fact shown on one line, such as 「截止时间」 beside its value. */
    fieldLabelColumn: 72,
  },
  blur: { dialog: 24 },
  motion: {
    transitionMs: 180,
    reducedTransitionMs: 80,
  },
});

export type Theme = typeof theme;
export type Space = keyof Theme['spacing'];
export type TextVariant = keyof Theme['textVariants'];

/**
 * Curated palette offered when a member picks a label color. Labels carry
 * arbitrary user-assigned colors (not semantic theme colors), so this lives
 * here as a design-system-owned constant rather than inlined in feature/route
 * files, matching the theme's raw-value ownership boundary. Vermilion is left
 * out so a label dot never reads as "overdue".
 */
export const labelColorPresets: string[] = [
  '#B5562F', '#C98A1B', '#8A9A2B', '#4C7537',
  '#2C716C', '#3B7DD8', '#4A57A6', '#7A478A',
  '#AD4067', '#87573A', '#4B6680', '#6E6A63',
];

/**
 * Each family member keeps one color, chosen from their user id, so the same
 * person reads the same everywhere. White initials stay above 5:1 on all of
 * them; vermilion is reserved for attention and never assigned to a person.
 */
export const memberColors: string[] = [
  '#4A57A6', '#4C7537', '#AD4067', '#956511',
  '#2C716C', '#7A478A', '#4B6680', '#87573A',
];
