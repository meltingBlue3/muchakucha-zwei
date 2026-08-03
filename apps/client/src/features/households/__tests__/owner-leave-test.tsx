import { canLeave } from '../member-governance';

describe('owner leave policy', () => {
  describe('canLeave', () => {
    // D-11: only the current owner can leave through the handoff flow.
    test('owner with other members can leave', () => {
      expect(canLeave('OWNER', true, 2)).toBe(true);
    });

    // Owner cannot leave if they are the only member.
    test('owner cannot leave when last member', () => {
      expect(canLeave('OWNER', true, 0)).toBe(false);
    });

    // Admin cannot leave through the handoff flow.
    test('admin cannot leave as owner', () => {
      expect(canLeave('ADMIN', false, 3)).toBe(false);
    });

    // Member cannot leave through the handoff flow.
    test('member cannot leave as owner', () => {
      expect(canLeave('MEMBER', false, 3)).toBe(false);
    });

    // Edge: actorRole is OWNER but isOwner is false (stale state).
    test('OWNER role without ownership flag cannot leave', () => {
      expect(canLeave('OWNER', false, 2)).toBe(false);
    });

    // Owner with exactly one other member (minimum successor count).
    test('owner with one other member can leave', () => {
      expect(canLeave('OWNER', true, 1)).toBe(true);
    });
  });
});
