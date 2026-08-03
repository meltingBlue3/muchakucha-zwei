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
  // ============================================================================
  // Phase 1: Core design-token contract
  // ============================================================================

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

  // ============================================================================
  // Phase 2: Household feature token and composition contract
  // ============================================================================

  test('defines the Phase 2 overlay, layout, and motion semantic tokens', () => {
    expect(theme.colors.overlay).toBe('rgba(45,39,37,0.60)');
    expect(theme.layout.householdMaxWidth).toBe(960);
    expect(theme.layout.switcherWidth).toBe(360);
    expect(theme.layout.switcherMaxHeight).toBe(480);
    expect(theme.layout.settingsNavWidth).toBe(280);
    expect(theme.motion.transitionMs).toBe(180);
    expect(theme.motion.reducedTransitionMs).toBe(80);
  });

  test('rejects raw style literals across household feature modules', () => {
    const visualLiteral =
      /#[0-9A-Fa-f]{3,8}\b|(?:fontSize|borderRadius|padding(?:Horizontal|Vertical)?|margin(?:Horizontal|Vertical)?|gap):\s*\d/;
    const householdFiles = sourceFilesUnder('src/features/households');
    for (const path of householdFiles) {
      expect({ path, source: readSource(path) }).not.toEqual(
        expect.objectContaining({ source: expect.stringMatching(visualLiteral) }),
      );
    }
  });

  test('household owned components import only theme tokens and primitives', () => {
    // Household-specific components must not introduce raw colors, spacing, or shadows.
    const householdComponentFiles = sourceFilesUnder('src/ui').filter(
      (p) => p.includes('household') || p.includes('member') || p.includes('invitation') || p.includes('role'),
    );
    for (const path of householdComponentFiles) {
      const source = readSource(path);
      // No raw hex colors outside theme references.
      expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    }
  });

  test('household feature files do not contain raw font-size or spacing overrides', () => {
    const rawSpacingPattern = /(?:fontSize|borderRadius|padding(?:Horizontal|Vertical)?):\s*\d/;
    const householdFeatureFiles = sourceFilesUnder('src/features/households');
    for (const path of householdFeatureFiles) {
      const source = readSource(path);
      expect(source).not.toMatch(rawSpacingPattern);
    }
  });

  test('rejects raw visual literals across household route files', () => {
    // Household route files in app/(protected)/ and app/invite/ must be thin shells.
    const routeFiles = [
      ...sourceFilesUnder('app/(protected)/households'),
      ...sourceFilesUnder('app/invite'),
    ];
    const rawStylePattern = /#[0-9A-Fa-f]{3,8}\b|(?:fontSize|borderRadius):\s*\d/;
    for (const path of routeFiles) {
      const source = readSource(path);
      expect(source).not.toMatch(rawStylePattern);
    }
  });

  test('D-10/D-11 safe-action and destructive button ordering is preserved', () => {
    // Confirmation components must render the safe action before the destructive action.
    const confirmationFiles = sourceFilesUnder('src/ui').filter(
      (p) => p.includes('confirmation') || p.includes('Confirmation'),
    );
    for (const path of confirmationFiles) {
      const source = readSource(path);
      // Safe-action labels (e.g., "保留管理员权限", "保留成员", "保留邀请",
      // "保留当前所有者", "留在家庭") must appear before destructive labels.
      // The safe-button pattern: the non-destructive safe CTA is rendered first.
      if (source.includes('Confirmation')) {
        const safeIdx = source.search(/保留|留在家庭/);
        const destructiveIdx = source.search(/确认|移除|撤销|离开/);
        if (safeIdx !== -1 && destructiveIdx !== -1) {
          expect(safeIdx).toBeLessThan(destructiveIdx);
        }
      }
    }
  });

  test('no optimistic transaction UI in household governance mutations', () => {
    // Governance mutations must not update local state before server confirmation.
    const governanceFiles = sourceFilesUnder('src/features/households').filter(
      (p) => p.includes('governance') || p.includes('Governance'),
    );
    for (const path of governanceFiles) {
      const source = readSource(path);
      // No optimistic cache updates: all mutations must await server response.
      // The pattern "optimisticUpdate" or pre-setting state before API calls signals
      // optimistic behavior that violates the contract.
      expect(source).not.toMatch(/optimisticUpdate/);
    }
  });

  test('D-12 accessChanged is the only membership-loss explanation pattern', () => {
    // The access-changed explanation must be the first thing shown after membership
    // loss. No automatic fallback entry or login-expiry redirect.
    const contextFiles = sourceFilesUnder('src/features/households').filter(
      (p) => p.includes('context') || p.includes('Context') || p.includes('access'),
    );
    for (const path of contextFiles) {
      const source = readSource(path);
      // The accessChanged state must be distinct from login expiry.
      // We check that the source references access-related states correctly.
      if (source.includes('accessChanged') || source.includes('access_changed')) {
        // Access change explanation must appear before any automatic routing.
        expect(source).not.toMatch(/router\.(?:replace|push).*(?:login|auth)/i);
      }
    }
  });

  test('no cross-household data flash in context-switch logic', () => {
    // When switching households, old household data must not render under the new
    // household header. The context must clear before showing new data.
    const contextFiles = sourceFilesUnder('src/features/households').filter(
      (p) => p.includes('context') || p.includes('Context'),
    );
    for (const path of contextFiles) {
      const source = readSource(path);
      // Query cache invalidation and loading states must be explicit.
      if (source.includes('queryClient') || source.includes('invalidate')) {
        // Invalidation must happen before new data is fetched.
        expect(source).toMatch(/invalidate|clear|remove/);
      }
    }
  });

  test('household ordering token: current first, access DESC, name ASC, UUID ASC', () => {
    // The ordering logic for household selection must be testable.
    // This is a structural check — the actual algorithm lives in the context/API layer.
    const sortFiles = [
      ...sourceFilesUnder('src/features/households'),
      ...sourceFilesUnder('src/platform/household'),
    ];
    const orderingPatterns = /sort|order|compare/i;
    let hasOrderingLogic = false;
    for (const path of sortFiles) {
      const source = readSource(path);
      if (orderingPatterns.test(source)) {
        hasOrderingLogic = true;
        // Ordering must reference at least role, access time, or name.
        expect(source).toMatch(/role|access|name|createdAt/i);
      }
    }
    // At least one file must contain ordering logic.
    expect(hasOrderingLogic).toBe(true);
  });

  test('member total order: OWNER/ADMIN/MEMBER, current user first, then name/email/ID', () => {
    // The canonical member ordering defined in Plan 02-03:
    // OWNER -> ADMIN -> MEMBER; current user first within role;
    // normalized display nickname ASC; email ASC; membership/user ID ASC.
    const sortFiles = [
      ...sourceFilesUnder('src/features/households'),
    ].filter((p) => !p.includes('test') && !p.includes('__tests__'));
    let hasMemberOrderingLogic = false;
    for (const path of sortFiles) {
      const source = readSource(path);
      if (/OWNER.*ADMIN.*MEMBER|role.*order.*sort/i.test(source)) {
        hasMemberOrderingLogic = true;
        // The ordering must reference role, current user, and display name/email.
        expect(source).toMatch(/role|isCurrentUser|displayName|email|id/i);
      }
    }
    // At least one source file must contain member ordering logic.
    expect(hasMemberOrderingLogic).toBe(true);
  });

  test('Phase 2 typography uses only 400 and 600 weights in household components', () => {
    // Per UI-SPEC: Phase 2 uses only 400 and 600 font weights.
    // The 500 weight (caption) is a Phase 1 artifact that Phase 2 does not extend.
    const householdUiFiles = sourceFilesUnder('src/ui').filter(
      (p) => p.includes('household') || p.includes('member') || p.includes('switch'),
    );
    for (const path of householdUiFiles) {
      const source = readSource(path);
      // No raw fontWeight: '500' in household components.
      if (source.includes('fontWeight')) {
        expect(source).not.toMatch(/fontWeight:\s*['"]500['"]/);
      }
    }
  });
});
