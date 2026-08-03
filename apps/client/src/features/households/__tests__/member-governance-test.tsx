import { canGovern, governanceAction, isPromotion } from '../member-governance';

describe('member governance policy', () => {
  describe('isPromotion', () => {
    test('MEMBER->ADMIN is a promotion', () => {
      expect(isPromotion('MEMBER', 'ADMIN')).toBe(true);
    });

    test('ADMIN->MEMBER is not a promotion', () => {
      expect(isPromotion('ADMIN', 'MEMBER')).toBe(false);
    });

    test('OWNER is not a promotion', () => {
      expect(isPromotion('OWNER', 'ADMIN')).toBe(false);
      expect(isPromotion('OWNER', 'MEMBER')).toBe(false);
    });
  });

  describe('canGovern', () => {
    test('owner can govern non-owner members', () => {
      // Actor is OWNER, target is ADMIN (non-owner)
      expect(canGovern('OWNER', true, 'ADMIN', false, false)).toBe(true);
      // Actor is OWNER, target is MEMBER (non-owner)
      expect(canGovern('OWNER', true, 'MEMBER', false, false)).toBe(true);
    });

    test('owner cannot govern other owners (no owner in same household normally)', () => {
      expect(canGovern('ADMIN', false, 'OWNER', true, false)).toBe(false);
    });

    test('owner cannot govern self', () => {
      expect(canGovern('OWNER', true, 'ADMIN', false, true)).toBe(false);
    });

    test('admin can govern non-owner members', () => {
      // Admin can govern another admin (D-09)
      expect(canGovern('ADMIN', false, 'ADMIN', false, false)).toBe(true);
      // Admin can govern member
      expect(canGovern('ADMIN', false, 'MEMBER', false, false)).toBe(true);
    });

    test('admin cannot govern owner', () => {
      expect(canGovern('ADMIN', false, 'OWNER', true, false)).toBe(false);
    });

    test('admin cannot govern self', () => {
      expect(canGovern('ADMIN', false, 'ADMIN', false, true)).toBe(false);
    });

    test('member cannot govern anyone', () => {
      expect(canGovern('MEMBER', false, 'ADMIN', false, false)).toBe(false);
      expect(canGovern('MEMBER', false, 'MEMBER', false, false)).toBe(false);
      expect(canGovern('MEMBER', false, 'OWNER', true, false)).toBe(false);
    });
  });

  describe('governanceAction', () => {
    test('returns promote for MEMBER target', () => {
      expect(governanceAction('OWNER', true, 'MEMBER', false, false)).toBe('promote');
      expect(governanceAction('ADMIN', false, 'MEMBER', false, false)).toBe('promote');
    });

    test('returns demote for ADMIN target', () => {
      expect(governanceAction('OWNER', true, 'ADMIN', false, false)).toBe('demote');
      expect(governanceAction('ADMIN', false, 'ADMIN', false, false)).toBe('demote');
    });

    test('returns none for OWNER target', () => {
      expect(governanceAction('ADMIN', false, 'OWNER', true, false)).toBe('none');
      expect(governanceAction('OWNER', true, 'OWNER', true, false)).toBe('none');
    });

    test('returns none for self', () => {
      expect(governanceAction('OWNER', true, 'ADMIN', false, true)).toBe('none');
      expect(governanceAction('ADMIN', false, 'MEMBER', false, true)).toBe('none');
    });

    test('returns none for MEMBER actor', () => {
      expect(governanceAction('MEMBER', false, 'ADMIN', false, false)).toBe('none');
      expect(governanceAction('MEMBER', false, 'MEMBER', false, false)).toBe('none');
    });
  });
});
