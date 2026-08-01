export {};

const missingDesignSystem = (contract: string): never => {
  throw new Error(`IMPLEMENTATION_MISSING_DESIGN_SYSTEM:${contract}`);
};

describe('typed design-token and composition contract', () => {
  test('D-14 exposes one Restyle-owned warm, modern, restrained typed theme', () => {
    missingDesignSystem('D14_TYPED_WARM_THEME');
  });

  test('D-15 defines the approved cream, coral, ink, and limited teal semantic palette', () => {
    missingDesignSystem('D15_SEMANTIC_PALETTE');
  });

  test('defines the complete spacing, typography, radius, border, focus, and soft-elevation scales', () => {
    missingDesignSystem('COMPLETE_TYPED_TOKEN_SCALES');
  });

  test('rejects raw color, spacing, radius, and font-size literals outside theme-owned files', () => {
    missingDesignSystem('RAW_STYLE_BOUNDARY');
  });

  test('keeps every feature file outside the raw-style allowlist', () => {
    missingDesignSystem('FEATURE_RAW_STYLE_ALLOWLIST_FORBIDDEN');
  });

  test('D-16 composes authentication from BrandMark, form primitives, and decorative abstract fields only', () => {
    missingDesignSystem('D16_BRAND_FORM_ABSTRACT_COMPOSITION');
  });

  test('D-16 forbids large household-scene or character illustration primitives', () => {
    missingDesignSystem('D16_LARGE_ILLUSTRATION_FORBIDDEN');
  });

  test('D-17 limits elevation to the light Web auth-card hierarchy and avoids heavy native shadows', () => {
    missingDesignSystem('D17_LIGHT_ELEVATION_ONLY');
  });
});
