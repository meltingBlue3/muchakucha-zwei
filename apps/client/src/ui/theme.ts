import { createTheme } from '@shopify/restyle';

export const theme = createTheme({
  colors: {
    canvas: '#FFF8F2',
    surface: '#FFFFFF',
    surfaceMuted: '#F5E9E1',
    ink: '#2D2725',
    inkMuted: '#6F625D',
    border: '#9C877E',
    coral: '#B94736',
    coralPressed: '#963A2D',
    coralSoft: '#F7DDD5',
    teal: '#277A72',
    tealSoft: '#DCEEEA',
    destructive: '#B42318',
    destructiveSoft: '#FDE4E1',
    focusRing: '#7B2F25',
    link: '#7B2F25',
    disabled: '#B7AAA4',
    transparent: 'transparent',
    overlay: 'rgba(45,39,37,0.60)',
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
    full: 999,
  },
  borderWidths: {
    default: 1,
    focus: 2,
  },
  fontFamilies: {
    regular: 'NotoSansSC-Regular',
    medium: 'NotoSansSC-Medium',
    semibold: 'NotoSansSC-SemiBold',
  },
  typography: {
    caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
    bodySm: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    label: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
    button: { fontSize: 16, fontWeight: '600' as const, lineHeight: 20 },
    heading: { fontSize: 24, fontWeight: '600' as const, lineHeight: 32 },
    display: { fontSize: 32, fontWeight: '600' as const, lineHeight: 40 },
  },
  textVariants: {
    defaults: {
      color: 'ink',
      fontFamily: 'NotoSansSC-Regular',
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
    },
    caption: {
      color: 'inkMuted',
      fontFamily: 'NotoSansSC-Medium',
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    bodySm: {
      color: 'inkMuted',
      fontFamily: 'NotoSansSC-Regular',
      fontSize: 14,
      fontWeight: '400',
      lineHeight: 20,
    },
    body: {
      color: 'ink',
      fontFamily: 'NotoSansSC-Regular',
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
    },
    label: {
      color: 'ink',
      fontFamily: 'NotoSansSC-SemiBold',
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
    button: {
      color: 'surface',
      fontFamily: 'NotoSansSC-SemiBold',
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 20,
    },
    heading: {
      color: 'ink',
      fontFamily: 'NotoSansSC-SemiBold',
      fontSize: 24,
      fontWeight: '600',
      lineHeight: 32,
    },
    display: {
      color: 'ink',
      fontFamily: 'NotoSansSC-SemiBold',
      fontSize: 32,
      fontWeight: '600',
      lineHeight: 40,
    },
  },
  controlSizes: {
    touchTarget: 48,
    field: 52,
    primary: 52,
    icon: 20,
    iconStroke: 2,
  },
  focus: {
    width: 2,
    offset: 2,
  },
  elevation: {
    softWeb: '0 8px 28px rgba(45,39,37,0.08)',
    native: 0,
  },
  shadow: {
    soft: '0 8px 28px rgba(45,39,37,0.08)',
  },
  layout: {
    authCardMaxWidth: 440,
    compactInset: 20,
    mobileInset: 24,
    webCardPadding: 32,
    householdMaxWidth: 960,
    switcherWidth: 360,
    switcherMaxHeight: 480,
    settingsNavWidth: 280,
  },
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
 * files, matching the theme's raw-value ownership boundary.
 */
export const labelColorPresets: string[] = [
  '#B94736', '#E07050', '#277A72', '#4A9E94',
  '#6B5B95', '#8B7DC4', '#D4A030', '#E8C252',
  '#3B7DD8', '#6BA3E0', '#7B4B8A', '#A87BB5',
];
