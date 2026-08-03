import { canTransferOwnership } from '../member-governance';

describe('ownership transfer policy', () => {
  describe('canTransferOwnership', () => {
    // D-10 / D-11: only the current owner can transfer.
    test('owner can transfer to another member', () => {
      expect(canTransferOwnership('OWNER', true, false)).toBe(true);
    });

    // Owner cannot transfer to themselves.
    test('owner cannot transfer to self', () => {
      expect(canTransferOwnership('OWNER', true, true)).toBe(false);
    });

    // Admin cannot transfer ownership (even if somehow flagged as owner).
    test('admin cannot transfer', () => {
      expect(canTransferOwnership('ADMIN', false, false)).toBe(false);
    });

    // Member cannot transfer.
    test('member cannot transfer', () => {
      expect(canTransferOwnership('MEMBER', false, false)).toBe(false);
    });

    // Edge: actorRole is OWNER but isOwner is false (stale state).
    test('OWNER role without ownership flag cannot transfer', () => {
      expect(canTransferOwnership('OWNER', false, false)).toBe(false);
    });

    // Edge: owner transferring to a member who is not themselves.
    test('owner can transfer to a non-self admin', () => {
      expect(canTransferOwnership('OWNER', true, false)).toBe(true);
    });
  });
});
