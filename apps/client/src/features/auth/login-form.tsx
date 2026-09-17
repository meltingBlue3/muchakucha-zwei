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
  username: z.string().trim().min(1, '请输入用户名。').transform((value) => value.normalize('NFC')),
  password: z.string().min(1, '请输入密码。'),
});

type LoginValues = z.infer<typeof loginSchema>;

export interface LoginFormProps {
  onAuthenticated(): void;
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

export const LoginForm = ({
  onAuthenticated,
  onOffline,
  onRegister,
  reauthenticationRequired = false,
  sessionStateStore,
  sessionTransport,
}: LoginFormProps) => {
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting, submitCount },
    getValues,
    handleSubmit,
    setError,
  } = useForm<LoginValues>({ defaultValues: { username: '', password: '' } });

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
        if (field === 'username' || field === 'password') {
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
          ? '用户名或密码不正确，请重新输入。'
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
    <Stack gap={5}>
      <Stack gap={2}>
        <Heading>欢迎回来</Heading>
      </Stack>
      {reauthenticationRequired ? (
        <Banner title="需要重新登录">
          登录已过期，请重新登录。完成后我们会带你回到刚才的位置。
        </Banner>
      ) : null}
      {formError ? <Banner title="暂时无法登录">{formError}</Banner> : null}
      <Controller
        control={control}
        name="username"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <TextField
            submitAttempt={submitCount}
            disabled={isSubmitting}
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            {...(errors.username?.message === undefined ? {} : { error: errors.username.message })}
            label="用户名"
            onBlur={() => {
              onBlur();
              validateField('username');
            }}
            onChangeText={onChange}
            ref={ref}
            textContentType="username"
            value={value}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <PasswordField
            submitAttempt={submitCount}
            disabled={isSubmitting}
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
      <Stack gap={1} style={{ alignItems: 'center' }}><Text variant="bodySm">第一次来到这里？</Text><LinkText style={{ alignSelf: 'center' }} onPress={onRegister}>创建账户</LinkText></Stack>
    </Stack>
  );
};
