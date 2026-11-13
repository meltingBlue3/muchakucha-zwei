import type { ApiClient, CurrentUserDto } from '@muchakucha/api-client';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { useTranslation } from '../../i18n';
import type { SessionStateStore } from '../auth/session-state';
import type { SessionTransport } from '../../platform/session/session-transport';
import { Banner, Button, LoadError, Spinner, Stack, Text, TextField } from '../../ui/primitives';
import { MemberAvatar } from '../../ui/member-avatar';

// The messages are keys of the profile catalog's form section.
const nicknameSchema = z
  .string()
  .trim()
  .min(1, 'nicknameRequired')
  .max(80, 'nicknameTooLong');

function nicknameIssue(message: string | undefined): 'nicknameRequired' | 'nicknameTooLong' | 'checkNickname' {
  return message === 'nicknameRequired' || message === 'nicknameTooLong' ? message : 'checkNickname';
}

type ProfileValues = { displayName: string };

export type ProfileApi = Pick<ApiClient, 'getMe' | 'updateMe'>;

export interface ProfileFormProps {
  apiClient: ProfileApi;
  sessionStateStore: SessionStateStore;
  sessionTransport: SessionTransport;
  onBusyChange?: (busy: boolean) => void;
}

function isDisplayNameFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('body' in error)) return false;
  const body = (error as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const details = (body as { error?: { details?: unknown } }).error?.details;
  return (
    Array.isArray(details) &&
    details.some(
      (detail) =>
        typeof detail === 'object' &&
        detail !== null &&
        'field' in detail &&
        (detail as { field?: unknown }).field === 'displayName',
    )
  );
}

/** The nickname editor inside the 个人资料 window, opened from the account menu or 个人中心. */
export const ProfileForm = ({ apiClient, sessionStateStore, sessionTransport, onBusyChange }: ProfileFormProps) => {
  const [reload, setReload] = useState(0);
  const [savedName, setSavedName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [username, setUsername] = useState<string>();
  const { t } = useTranslation(['profile', 'common']);
  const genericError = t('common:genericError');
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting, isDirty, submitCount },
    getFieldState,
    getValues,
    handleSubmit,
    reset,
    setError,
  } = useForm<ProfileValues>({ defaultValues: { displayName: '' } });

  useEffect(() => { onBusyChange?.(isSubmitting); }, [isSubmitting, onBusyChange]);

  useEffect(() => {
    setLoading(true);
    setLoadError(undefined);
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) {
      setLoadError(genericError);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void apiClient
      .getMe(accessToken, controller.signal)
      .then((user) => {
        reset({ displayName: user.displayName });
        setSavedName(user.displayName);
        setUserId(user.id);
        setUsername(user.username);
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === 'AbortError')) setLoadError(genericError);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiClient, reset, sessionTransport, reload]);

  const validateNickname = (): boolean => {
    const parsed = nicknameSchema.safeParse(getValues('displayName'));
    if (parsed.success) {
      clearErrors('displayName');
      return true;
    }
    setError('displayName', { message: t(`form.${nicknameIssue(parsed.error.issues[0]?.message)}`) });
    return false;
  };

  const submit = handleSubmit(async (values) => {
    setSuccess(undefined);
    clearErrors();
    const parsed = nicknameSchema.safeParse(values.displayName);
    if (!parsed.success) {
      setError('displayName', { message: t(`form.${nicknameIssue(parsed.error.issues[0]?.message)}`) });
      return;
    }
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) {
      setError('root.server', { message: genericError });
      return;
    }
    try {
      const user: CurrentUserDto = await apiClient.updateMe(
        accessToken,
        { displayName: parsed.data },
        new AbortController().signal,
      );
      reset({ displayName: user.displayName });
        setSavedName(user.displayName);
        setUserId(user.id);
      sessionStateStore.enterAuthenticated({ accessToken, currentUser: user });
      setSuccess(t('form.nicknameUpdated'));
    } catch (error) {
      if (isDisplayNameFailure(error)) {
        setError('displayName', { message: t('form.nicknameLength') });
      } else {
        setError('root.server', { message: genericError });
      }
    }
  });

  if (loading) {
    return (
      <Stack accessibilityLabel={t('form.loading')} gap={2}>
        <Spinner label={t('form.loading')} />
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      {userId ? <MemberAvatar id={userId} name={savedName || t('form.me')} size="lg" /> : null}
      {loadError ? (
        <LoadError title={t('form.loadFailedTitle')} message={loadError} retryLabel={t('form.reload')} onRetry={() => setReload((value) => value + 1)} />
      ) : errors.root?.server?.message ? (
        <Banner title={t('form.saveFailedTitle')}>{errors.root.server.message}</Banner>
      ) : null}
      {success ? (
        <Stack accessibilityLiveRegion="polite" accessibilityRole={'status' as never} gap={1}>
          <Text>{success}</Text>
        </Stack>
      ) : null}
      {username ? (
        <Stack gap={1}>
          <Text variant="label">{t('username')}</Text>
          <Text>{username}</Text>
          <Text variant="caption">{t('usernameNote')}</Text>
        </Stack>
      ) : null}
      <Controller
        control={control}
        name="displayName"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <TextField
            autoCapitalize="words"
            autoComplete="name"
            disabled={loadError !== undefined || isSubmitting}
            {...(errors.displayName?.message === undefined
              ? {}
              : { error: errors.displayName.message })}
            label={t('nickname')}
            submitAttempt={submitCount}
            returnKeyType="done"
            onSubmitEditing={() => { if (isDirty && !isSubmitting) void submit(); }}
            onBlur={() => {
              onBlur();
              // An empty nickname is reported only on submit.
              if (getValues('displayName').trim() !== '' || getFieldState('displayName').error !== undefined) validateNickname();
            }}
            onChangeText={(value) => {
              setSuccess(undefined);
              onChange(value);
              if (getFieldState('displayName').error !== undefined) validateNickname();
            }}
            ref={ref}
            textContentType="name"
            value={value}
          />
        )}
      />
      <Button
        disabled={loadError !== undefined || isSubmitting || !isDirty}
        label={t('common:save')}
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Stack>
  );
};
