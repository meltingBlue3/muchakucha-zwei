import { theme } from '../theme';

const readSource = (relativePath: string): string => {
  const fs = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('node:fs');
  return fs.readFileSync(relativePath, 'utf8');
};

const sourceFilesUnder = (relativeRoot: string): string[] => {
  const fs = jest.requireActual<{
    readdirSync(
      directory: string,
      options: { withFileTypes: true },
    ): Array<{ isDirectory(): boolean; name: string }>;
  }>('node:fs');
  const path = jest.requireActual<{ join(...parts: string[]): string }>('node:path');
  const visit = (directory: string): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) return visit(candidate);
      return /\.[cm]?tsx?$/.test(entry.name) && !entry.name.includes('-test.') ? [candidate] : [];
    });
  return visit(relativeRoot);
};

describe('typed design-token and composition contract', () => {
  test('D-14 exposes one Restyle-owned warm, modern, restrained typed theme', () => {
    expect(theme.colors.canvas).toBe('#FFF8F2');
    expect(theme.colors.surface).toBe('#FFFFFF');
    expect(theme.colors.ink).toBe('#2D2725');
    expect(Object.keys(theme.textVariants)).toEqual(
      expect.arrayContaining(['body', 'label', 'button', 'heading', 'display']),
    );
  });

  test('D-15 defines the approved cream, coral, ink, and limited teal semantic palette', () => {
    expect(theme.colors).toMatchObject({
      canvas: '#FFF8F2',
      coral: '#B94736',
      coralPressed: '#963A2D',
      destructive: '#B42318',
      ink: '#2D2725',
      inkMuted: '#6F625D',
      teal: '#277A72',
    });
  });

  test('defines the complete spacing, typography, radius, border, focus, and soft-elevation scales', () => {
    expect(Object.values(theme.spacing)).toEqual([0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
    expect(theme.typography).toMatchObject({
      body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
      button: { fontSize: 16, fontWeight: '600', lineHeight: 20 },
      caption: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
      display: { fontSize: 32, fontWeight: '600', lineHeight: 40 },
      heading: { fontSize: 24, fontWeight: '600', lineHeight: 32 },
    });
    expect(theme.borderRadii).toEqual({ full: 999, lg: 16, md: 12, sm: 8 });
    expect(theme.borderWidths).toEqual({ default: 1, focus: 2 });
    expect(theme.focus).toEqual({ offset: 2, width: 2 });
    expect(theme.elevation).toEqual({ native: 0, softWeb: '0 8px 28px rgba(45,39,37,0.08)' });
  });

  test('rejects raw color, spacing, radius, and font-size literals outside theme-owned files', () => {
    const primitives = readSource('src/ui/primitives.tsx');
    expect(primitives).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(primitives).not.toMatch(/(?:fontSize|borderRadius|padding(?:Horizontal|Vertical)?):\s*\d/);
  });

  test('keeps every feature file outside the raw-style allowlist', () => {
    const tests = [
      'src/features/auth/__tests__/register-form-test.tsx',
      'src/features/auth/__tests__/verification-flow-test.tsx',
      'src/features/auth/__tests__/session-bootstrap-test.tsx',
      'src/features/auth/__tests__/password-reset-flow-test.tsx',
      'src/features/profile/__tests__/profile-form-test.tsx',
    ];
    for (const path of tests) {
      expect(readSource(path)).not.toMatch(/rawStyleAllowlist|#[0-9A-Fa-f]{3,8}\b/);
    }
  });

  test('rejects raw visual literals across production routes and feature modules', () => {
    const visualLiteral =
      /#[0-9A-Fa-f]{3,8}\b|(?:fontSize|borderRadius|padding(?:Horizontal|Vertical)?|margin(?:Horizontal|Vertical)?|gap):\s*\d/;
    for (const path of [...sourceFilesUnder('app'), ...sourceFilesUnder('src/features')]) {
      expect({ path, source: readSource(path) }).not.toEqual(
        expect.objectContaining({ source: expect.stringMatching(visualLiteral) }),
      );
    }
  });

  test('D-16 composes authentication from BrandMark, form primitives, and decorative abstract fields only', () => {
    const primitives = readSource('src/ui/primitives.tsx');
    expect(primitives).toContain('export const BrandMark');
    expect(primitives).toContain('export const AuthShell');
    expect(primitives).toContain('shouldRenderAbstractFields');
  });

  test('D-16 forbids large household-scene or character illustration primitives', () => {
    const primitives = readSource('src/ui/primitives.tsx');
    expect(primitives).not.toMatch(/\b(Image|ImageBackground|householdIllustration|characterIllustration)\b/);
  });

  test('D-17 limits elevation to the light Web auth-card hierarchy and avoids heavy native shadows', () => {
    expect(theme.elevation.native).toBe(0);
    expect(theme.elevation.softWeb).toBe('0 8px 28px rgba(45,39,37,0.08)');
    expect(readSource('src/ui/primitives.tsx')).not.toMatch(/\belevation:\s*[1-9]|shadowOpacity:\s*(?:0\.[2-9]|1)/);
  });
});
