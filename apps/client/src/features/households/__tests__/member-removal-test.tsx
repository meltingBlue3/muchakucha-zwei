import { canRemove } from '../member-governance';

describe('member removal policy', () => {
  describe('canRemove', () => {
    // D-09: owner can remove any non-owner, including other admins.
    test('owner can remove admin', () => {
      expect(canRemove('OWNER', 'ADMIN', false, false)).toBe(true);
    });

    test('owner can remove member', () => {
      expect(canRemove('OWNER', 'MEMBER', false, false)).toBe(true);
    });

    // D-09: admin can remove any non-owner, including other admins.
    test('admin can remove member', () => {
      expect(canRemove('ADMIN', 'MEMBER', false, false)).toBe(true);
    });

    test('admin can remove another admin', () => {
      expect(canRemove('ADMIN', 'ADMIN', false, false)).toBe(true);
    });

    // D-09: owner is never a valid removal target.
    test('owner cannot remove another owner', () => {
      expect(canRemove('OWNER', 'OWNER', true, false)).toBe(false);
    });

    test('admin cannot remove owner', () => {
      expect(canRemove('ADMIN', 'OWNER', true, false)).toBe(false);
    });

    // D-09: member cannot remove anyone.
    test('member cannot remove admin', () => {
      expect(canRemove('MEMBER', 'ADMIN', false, false)).toBe(false);
    });

    test('member cannot remove member', () => {
      expect(canRemove('MEMBER', 'MEMBER', false, false)).toBe(false);
    });

    test('member cannot remove owner', () => {
      expect(canRemove('MEMBER', 'OWNER', true, false)).toBe(false);
    });

    // Cannot remove yourself.
    test('owner cannot remove self', () => {
      expect(canRemove('OWNER', 'MEMBER', false, true)).toBe(false);
    });

    test('admin cannot remove self', () => {
      expect(canRemove('ADMIN', 'ADMIN', false, true)).toBe(false);
    });

    test('member cannot remove self', () => {
      expect(canRemove('MEMBER', 'MEMBER', false, true)).toBe(false);
    });
  });
});
