import { zh } from '../../i18n/locales/zh';

export type AuthErrorKey = `errors.${keyof typeof zh.auth.errors}` | 'common:genericError';

export function authErrorKey(message: string): AuthErrorKey {
  if (message === 'common:genericError') return message;
  if (message.startsWith('errors.') && Object.hasOwn(zh.auth.errors, message.slice('errors.'.length))) {
    return message as AuthErrorKey;
  }
  return 'errors.checkInput';
}
