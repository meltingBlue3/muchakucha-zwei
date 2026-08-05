import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { SessionStateStore } from './session-state';
import type { RestoreOutcome, SessionTransport } from '../../platform/session/session-transport';
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

const loginSchema = z.object({
  email: z.string().trim().email('请输入有效的邮箱地址。'),
  password: z.string().min(1, '请输入密码。'),
});

type LoginValues = z.infer<typeof loginSchema>;

export interface LoginFormProps {
  intendedRoute?: string | undefined;
  onAuthenticated(): void;
  onForgotPassword(): void;
  onOffline(): void;
  onRegister(): void;
  reauthenticationRequired?: boolean | undefined;
  sessionStateStore: SessionStateStore;
  sessionTransport: SessionTransport;
}

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === 401
  );
}

function isEmailNotVerified(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false;
  if ((error as { status?: unknown }).status !== 403) return false;
  const body = (error as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  return (body as { error?: { code?: string } }).error?.code === 'EMAIL_NOT_VERIFIED';
}

export const LoginForm = ({
  onAuthenticated,
  onForgotPassword,
  onOffline,
  onRegister,
  reauthenticationRequired = false,
  sessionStateStore,
  sessionTransport,
}: LoginFormProps) => {
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    setError,
  } = useForm<LoginValues>({ defaultValues: { email: '', password: '' } });

  const applyOutcome = async (outcome: RestoreOutcome): Promise<void> => {
    if (outcome.kind === 'authenticated') {
      sessionStateStore.enterAuthenticated(outcome.session);
      onAuthenticated();
      return;
    }
    if (outcome.kind === 'offline') {
      sessionStateStore.enterOfflineWaiting();
      onOffline();
      return;
    }
    if (outcome.kind === 'reauthRequired') {
      await sessionTransport.clear();
      sessionStateStore.enterReauthenticationRequired(outcome.reason);
      setError('root.server', { message: '登录已过期，请重新登录。' });
      return;
    }
    sessionStateStore.enterUnauthenticated();
  };

  const submit = handleSubmit(async (values) => {
    clearErrors();
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') {
          setError(field, { message: issue.message });
        }
      }
      return;
    }

    try {
      await applyOutcome(await sessionTransport.login(parsed.data));
    } catch (error) {
      setError('root.server', {
        message: isUnauthorized(error)
          ? '邮箱或密码不正确，请重新输入。'
          : isEmailNotVerified(error)
            ? '此邮箱尚未验证，请先完成邮箱验证后再登录。'
            : '这次没有完成。请检查网络后重试。',
      });
    }
  });

  const validateField = (field: keyof LoginValues) => {
    const result = loginSchema.shape[field].safeParse(getValues(field));
    if (result.success) clearErrors(field);
    else setError(field, { message: result.error.issues[0]?.message ?? '请检查输入。' });
  };

  const formError = errors.root?.server?.message;

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading>欢迎回来</Heading>
        <Text>登录后继续查看家里的安排。</Text>
      </Stack>
      {reauthenticationRequired ? (
        <Banner title="需要重新登录">
          登录已过期，请重新登录。完成后我们会带你回到刚才的位置。
        </Banner>
      ) : null}
      {formError ? <Banner title="暂时无法登录">{formError}</Banner> : null}
      <Controller
        control={control}
        name="email"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            {...(errors.email?.message === undefined ? {} : { error: errors.email.message })}
            keyboardType="email-address"
            label="邮箱"
            onBlur={() => {
              onBlur();
              validateField('email');
            }}
            onChangeText={onChange}
            ref={ref}
            textContentType="emailAddress"
            value={value}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <PasswordField
            autoCapitalize="none"
            autoComplete="current-password"
            {...(errors.password?.message === undefined ? {} : { error: errors.password.message })}
            label="密码"
            onBlur={() => {
              onBlur();
              validateField('password');
            }}
            onChangeText={onChange}
            onSubmitEditing={() => void submit()}
            ref={ref}
            textContentType="password"
            value={value}
          />
        )}
      />
      <Button disabled={isSubmitting} label="登录" loading={isSubmitting} onPress={() => void submit()} />
      <Stack gap={2}>
        <LinkText onPress={onRegister}>创建账户</LinkText>
        <LinkText onPress={onForgotPassword}>忘记密码</LinkText>
      </Stack>
    </Stack>
  );
};
