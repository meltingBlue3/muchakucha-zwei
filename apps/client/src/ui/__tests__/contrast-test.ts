export {};

const missingDesignSystem = (contract: string): never => {
  throw new Error(`IMPLEMENTATION_MISSING_DESIGN_SYSTEM:${contract}`);
};

describe.skip('measured WCAG 2.2 AA palette contract', () => {
  test('computes at least 4.5:1 for normal ink and muted text on their intended surfaces', () => {
    missingDesignSystem('TEXT_CONTRAST_MEASUREMENT');
  });

  test('computes at least 4.5:1 for white text on coral, teal, and destructive fills', () => {
    missingDesignSystem('FILLED_ACTION_CONTRAST_MEASUREMENT');
  });

  test('computes at least 3:1 for input borders and other non-text control boundaries', () => {
    missingDesignSystem('CONTROL_BOUNDARY_CONTRAST_MEASUREMENT');
  });

  test('computes at least 3:1 for the focus ring against adjacent canvas and surface colors', () => {
    missingDesignSystem('FOCUS_RING_CONTRAST_MEASUREMENT');
  });

  test('keeps pressed primary actions above AA instead of relying on opacity', () => {
    missingDesignSystem('PRESSED_ACTION_CONTRAST_MEASUREMENT');
  });

  test('pairs success, error, and disabled colors with readable text and non-color semantics', () => {
    missingDesignSystem('STATUS_AND_DISABLED_CONTRAST_MEASUREMENT');
  });
});
