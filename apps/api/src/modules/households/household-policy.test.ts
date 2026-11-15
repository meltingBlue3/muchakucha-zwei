import { describe, expect, test } from 'vitest';
import { directLeaveOutcome, removalFailure, roleChangeFailure, type Role } from './household-policy.js';

describe('admin governance boundary', () => {
  test.each<Role>(['OWNER', 'ADMIN', 'MEMBER'])('only the owner can appoint or demote admins (actor %s)', (actor) => {
    const expected = actor === 'OWNER' ? undefined : 'INSUFFICIENT_ROLE';
    expect(roleChangeFailure(false, actor, 'MEMBER', 'ADMIN')).toBe(expected);
    expect(roleChangeFailure(false, actor, 'ADMIN', 'MEMBER')).toBe(expected);
  });

  test('an admin loses removal authority when a member becomes an admin', () => {
    expect(removalFailure(false, 'ADMIN', false, 'MEMBER')).toBeUndefined();
    expect(removalFailure(false, 'ADMIN', false, 'ADMIN')).toBe('INSUFFICIENT_ROLE');
    expect(removalFailure(false, 'OWNER', false, 'ADMIN')).toBeUndefined();
  });

  test('owner and self-removal protections remain in force', () => {
    expect(removalFailure(true, 'ADMIN', false, 'OWNER')).toBe('TARGET_IS_OWNER');
    expect(removalFailure(false, 'ADMIN', true, 'ADMIN')).toBe('TARGET_IS_SELF');
    expect(roleChangeFailure(true, 'OWNER', 'OWNER', 'MEMBER')).toBe('TARGET_IS_OWNER');
  });
});

describe('leaving without a successor', () => {
  test('a member or admin simply leaves, however many remain', () => {
    expect(directLeaveOutcome(false, 2)).toBe('LEAVE');
    expect(directLeaveOutcome(false, 5)).toBe('LEAVE');
  });

  test('the owner hands over while anyone else remains, and takes the household along when alone', () => {
    expect(directLeaveOutcome(true, 2)).toBe('OWNER_TRANSFER_REQUIRED');
    expect(directLeaveOutcome(true, 1)).toBe('DELETE_HOUSEHOLD');
  });
});
