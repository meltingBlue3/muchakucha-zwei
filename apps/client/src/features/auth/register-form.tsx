import type { ApiClient, RegisterDto } from '@muchakucha/api-client';
import { Controller, useForm } from 'react-hook-form';
import { Platform } from 'react-native';
import { z } from 'zod';

import type { SessionStateStore } from './session-state';
import type { SessionTransport } from '../../platform/session/session-transport';
import {
  Banner,
  Button,
  Heading,
  LinkText,
  PasswordField,
  Stack,
  Text,
  TextField,
} from '../../ui/primitives';

const registrationFields = z.object({
  username: z.string().trim().transform((value) => value.normalize('NFC'))
    .refine((value) => [...value].length >= 3, '用户名至少需要 3 个字符。')
    .refine((value) => [...value].length <= 32, '用户名不能超过 32 个字符。')
    .refine((value) => /^[\p{L}\p{N}._-]+$/u.test(value), '用户名只能包含字母、数字、点、下划线和短横线。'),
  password: z.string()
    .refine((value) => [...value].length >= 8, '密码至少需要 8 个字符。')
    .refine((value) => [...value].length <= 128, '密码不能超过 128 个字符。'),
  confirmPassword: z.string().min(1, '请再次输入密码。'),
});
const registrationSchema = registrationFields.refine(
  (values) => values.password === values.confirmPassword,
  { message: '两次输入的密码不一致。', path: ['confirmPassword'] },
);

type RegistrationValues = z.infer<typeof registrationSchema>;

export interface RegisterFormProps {
  apiClient: Pick<ApiClient, 'register'>;
  onAuthenticated(): void;
  onLogin(): void;
  platform: RegisterDto['platform'];
  sessionStateStore: SessionStateStore;
  sessionTransport: Pick<SessionTransport, 'acceptIssuedSession'>;
}

const fieldMessages: Record<keyof RegistrationValues, string> = {
  username: '请检查用户名后重试。',
  password: '请检查密码后重试。',
  confirmPassword: '两次输入的密码不一致。',
};

const isRegistrationField = (value: unknown): value is keyof RegistrationValues =>
  value === 'username' || value === 'password' || value === 'confirmPassword';

const focusFirstInvalidWebField = (): void => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  let attempts = 0;
  const focus = () => {
    const firstInvalid = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (firstInvalid) {
      firstInvalid.focus();
    } else if (attempts < 10) {
      attempts += 1;
      setTimeout(focus, 16);
    }
  };
  setTimeout(focus, 0);
};

const getServerFields = (error: unknown): Array<keyof RegistrationValues> => {
  if (typeof error !== 'object' || error === null || !('body' in error)) return [];
  const body = (error as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null || !('error' in body)) return [];
  const details = (body as { error?: { details?: unknown } }).error?.details;
  if (!Array.isArray(details)) return [];
  return details
    .map((detail) =>
      typeof detail === 'object' && detail !== null && 'field' in detail
        ? (detail as { field?: unknown }).field
        : undefined,
    )
    .filter(isRegistrationField);
};

export const RegisterForm = ({
  apiClient,
  onAuthenticated,
  onLogin,
  platform,
  sessionStateStore,
  sessionTransport,
}: RegisterFormProps) => {
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    setError,
  } = useForm<RegistrationValues>({
    defaultValues: { username: '', password: '', confirmPassword: '' },
  });
  const formError = errors.root?.server?.message;

  const validateField = (field: keyof RegistrationValues) => {
    const result = registrationSchema.safeParse(getValues());
    const issue = result.success ? undefined : result.error.issues.find((entry) => entry.path[0] === field);
    if (issue === undefined) clearErrors(field);
    else setError(field, { message: issue.message });
  };

  const submitRegistration = handleSubmit(async (values) => {
    clearErrors();
    const parsed = registrationSchema.safeParse(values);
    if (!parsed.success) {
      const firstField = parsed.error.issues.map((issue) => issue.path[0]).find(isRegistrationField);
      const handled = new Set<keyof RegistrationValues>();
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (isRegistrationField(field) && !handled.has(field)) {
          setError(field, { message: issue.message }, { shouldFocus: field === firstField });
          handled.add(field);
        }
      }
      return;
    }

    try {
      const accepted = await apiClient.register({ ...parsed.data, platform }, new AbortController().signal);
      const session = await sessionTransport.acceptIssuedSession({
        accessToken: accepted.accessToken ?? '',
        ...(accepted.refreshToken === undefined ? {} : { refreshToken: accepted.refreshToken }),
      });
      sessionStateStore.enterAuthenticated(session);
      onAuthenticated();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) {
        setError('username', { message: '这个用户名已被使用，请换一个。' }, { shouldFocus: true });
        return;
      }
      const fields = getServerFields(error);
      if (fields.length > 0) {
        for (const field of fields) setError(field, { message: fieldMessages[field] });
      } else {
        setError('root.server', { message: '这次没有完成。请检查网络后重试。' });
      }
    }
  });

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading>创建你的账户</Heading>
        <Text>填写用户名和密码，即可开始使用。</Text>
      </Stack>
      {formError ? <Banner title="暂时无法创建账户">{formError}</Banner> : null}
      <Controller
        control={control}
        name="username"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <TextField
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            {...(errors.username?.message === undefined ? {} : { error: errors.username.message })}
            label="用户名"
            onBlur={() => { onBlur(); validateField('username'); }}
            onChangeText={onChange}
            ref={ref}
            textContentType="username"
            value={value}
          />
        )}
      />
      <Text variant="bodySm">用户名为 3–32 个字符，可使用字母、数字、点、下划线和短横线，不区分大小写。密码至少 8 个字符。</Text>
      <Controller
        control={control}
        name="password"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <PasswordField
            autoCapitalize="none"
            autoComplete="new-password"
            {...(errors.password?.message === undefined ? {} : { error: errors.password.message })}
            label="密码"
            onBlur={() => {
              onBlur();
              validateField('password');
              if (getValues('confirmPassword')) validateField('confirmPassword');
            }}
            onChangeText={onChange}
            ref={ref}
            textContentType="newPassword"
            value={value}
          />
        )}
      />
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <PasswordField
            autoCapitalize="none"
            autoComplete="new-password"
            {...(errors.confirmPassword?.message === undefined ? {} : { error: errors.confirmPassword.message })}
            label="确认密码"
            onBlur={() => { onBlur(); validateField('confirmPassword'); }}
            onChangeText={onChange}
            onSubmitEditing={() => void submitRegistration()}
            ref={ref}
            textContentType="newPassword"
            value={value}
          />
        )}
      />
      <Button
        disabled={isSubmitting}
        label="创建账户"
        loading={isSubmitting}
        onPress={() => {
          void submitRegistration();
          focusFirstInvalidWebField();
        }}
      />
      <LinkText onPress={onLogin}>已有账户？登录</LinkText>
    </Stack>
  );
};
