import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIN_PASSWORD_CODE_POINTS = 12;
const MAX_PASSWORD_CODE_POINTS = 128;
const COMMON_PASSWORDS = new Set(
  readFileSync(resolve(import.meta.dirname, 'data/common-passwords-top-3000.txt'), 'utf8')
    .trimEnd()
    .split('\n'),
);

export type PasswordPolicyFailure = 'COMMON_PASSWORD' | 'PASSWORD_LENGTH';

export function passwordPolicyFailure(password: string): PasswordPolicyFailure | undefined {
  const length = Array.from(password).length;
  if (length < MIN_PASSWORD_CODE_POINTS || length > MAX_PASSWORD_CODE_POINTS) {
    return 'PASSWORD_LENGTH';
  }
  if (COMMON_PASSWORDS.has(password)) {
    return 'COMMON_PASSWORD';
  }
  return undefined;
}
