import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIN_PASSWORD_CODE_POINTS = 12;
const MAX_PASSWORD_CODE_POINTS = 128;
let commonPasswords: ReadonlySet<string> | undefined;

export type PasswordPolicyFailure = 'COMMON_PASSWORD' | 'PASSWORD_LENGTH';

export function passwordPolicyFailure(password: string): PasswordPolicyFailure | undefined {
  const length = Array.from(password).length;
  if (length < MIN_PASSWORD_CODE_POINTS || length > MAX_PASSWORD_CODE_POINTS) {
    return 'PASSWORD_LENGTH';
  }
  // Only the retained email API uses this policy. Username accounts do not
  // require the legacy password fixture to be loaded during application startup.
  commonPasswords ??= new Set(
    readFileSync(resolve(import.meta.dirname, 'data/common-passwords-top-3000.txt'), 'utf8')
      .trimEnd()
      .split('\n'),
  );
  if (commonPasswords.has(password)) {
    return 'COMMON_PASSWORD';
  }
  return undefined;
}
