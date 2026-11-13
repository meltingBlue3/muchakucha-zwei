import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useTranslation } from '../../i18n';
import { authErrorKey } from './auth-error-key';
import type { SessionStateStore } from './session-state';
import type { RestoreOutcome, SessionTransport } from '../../platform/session/session-transport';
import {
  AuthSwitch,
  AuthTitle,
  Banner,
  Button,
  PasswordField,
  Stack,
  TextField,
} from '../../ui/primitives';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'errors.usernameRequired').transform((value) => value.normalize('NFC')),
  password: z.string().min(1, 'errors.passwordRequired'),
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
  const { t } = useTranslation(['auth', 'common']);
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting, submitCount },
    getFieldState,
    getValues,
    handleSubmit,
    setError,
    setFocus,
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
      setError('root.server', { message: 'errors.sessionExpired' });
      return;
    }
    sessionStateStore.enterUnauthenticated();
  };

  const submit = handleSubmit(async (values) => {
    clearErrors();
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      let focused = false;
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'username' || field === 'password') {
          setError(field, { message: issue.message }, { shouldFocus: !focused });
          focused = true;
        }
      }
      return;
    }

    try {
      await applyOutcome(await sessionTransport.login(parsed.data));
    } catch (error) {
      setError('root.server', {
        message: isUnauthorized(error)
          ? 'errors.invalidCredentials'
          : 'common:genericError',
      });
    }
  });

  const validateField = (field: keyof LoginValues) => {
    const result = loginSchema.shape[field].safeParse(getValues(field));
    if (result.success) clearErrors(field);
    else setError(field, { message: result.error.issues[0]?.message ?? 'errors.checkInput' });
  };
  // An empty field is reported only on submit; an error already shown follows
  // the input as the user corrects it.
  const validateOnBlur = (field: keyof LoginValues) => {
    if (getValues(field).trim() === '' && getFieldState(field).error === undefined) return;
    validateField(field);
  };
  const revalidateOnChange = (field: keyof LoginValues) => {
    if (getFieldState(field).error !== undefined) validateField(field);
  };

  const formError = errors.root?.server?.message;
  const errorText = (key: string) => t(authErrorKey(key));

  return (
    <Stack gap={5}>
      <AuthTitle title={t('login.title')}>{t('login.intro')}</AuthTitle>
      {reauthenticationRequired ? (
        <Banner title={t('login.reauthTitle')}>
          {t('login.reauthDetail')}
        </Banner>
      ) : null}
      {formError ? <Banner title={t('login.failed')}>{errorText(formError)}</Banner> : null}
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
            {...(errors.username?.message === undefined ? {} : { error: errorText(errors.username.message) })}
            label={t('username')}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => setFocus('password')}
            onBlur={() => {
              onBlur();
              validateOnBlur('username');
            }}
            onChangeText={(text) => { onChange(text); revalidateOnChange('username'); }}
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
            {...(errors.password?.message === undefined ? {} : { error: errorText(errors.password.message) })}
            label={t('password')}
            onBlur={() => {
              onBlur();
              validateOnBlur('password');
            }}
            onChangeText={(text) => { onChange(text); revalidateOnChange('password'); }}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            ref={ref}
            textContentType="password"
            value={value}
          />
        )}
      />
      <Button disabled={isSubmitting} label={t('login.action')} loading={isSubmitting} onPress={() => void submit()} />
      <AuthSwitch prompt={t('login.registerPrompt')} label={t('register.action')} onPress={onRegister} />
    </Stack>
  );
};
