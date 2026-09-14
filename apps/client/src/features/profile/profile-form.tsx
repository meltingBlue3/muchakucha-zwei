import type { ApiClient, CurrentUserDto } from '@muchakucha/api-client';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import type { SessionStateStore } from '../auth/session-state';
import type { SessionTransport } from '../../platform/session/session-transport';
import { Banner, Button, Heading, Spinner, Stack, Text, TextField } from '../../ui/primitives';

const GENERIC_ERROR = '这次没有完成。请检查网络后重试。';
const nicknameSchema = z
  .string()
  .trim()
  .min(1, '请输入昵称。')
  .max(80, '昵称不能超过 80 个字符。');

type ProfileValues = { displayName: string };

export type ProfileApi = Pick<ApiClient, 'getMe' | 'updateMe'>;

export interface ProfileFormProps {
  apiClient: ProfileApi;
  sessionStateStore: SessionStateStore;
  sessionTransport: SessionTransport;
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

export const ProfileForm = ({ apiClient, sessionStateStore, sessionTransport }: ProfileFormProps) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [username, setUsername] = useState<string>();
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    reset,
    setError,
  } = useForm<ProfileValues>({ defaultValues: { displayName: '' } });

  useEffect(() => {
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) {
      setLoadError(GENERIC_ERROR);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void apiClient
      .getMe(accessToken, controller.signal)
      .then((user) => {
        reset({ displayName: user.displayName });
        setUsername(user.username);
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === 'AbortError')) setLoadError(GENERIC_ERROR);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [apiClient, reset, sessionTransport]);

  const validateNickname = (): boolean => {
    const parsed = nicknameSchema.safeParse(getValues('displayName'));
    if (parsed.success) {
      clearErrors('displayName');
      return true;
    }
    setError('displayName', { message: parsed.error.issues[0]?.message ?? '请检查昵称。' });
    return false;
  };

  const submit = handleSubmit(async (values) => {
    setSuccess(undefined);
    clearErrors();
    const parsed = nicknameSchema.safeParse(values.displayName);
    if (!parsed.success) {
      setError('displayName', { message: parsed.error.issues[0]?.message ?? '请检查昵称。' });
      return;
    }
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) {
      setError('root.server', { message: GENERIC_ERROR });
      return;
    }
    try {
      const user: CurrentUserDto = await apiClient.updateMe(
        accessToken,
        { displayName: parsed.data },
        new AbortController().signal,
      );
      reset({ displayName: user.displayName });
      sessionStateStore.enterAuthenticated({ accessToken, currentUser: user });
      setSuccess('昵称已更新。');
    } catch (error) {
      if (isDisplayNameFailure(error)) {
        setError('displayName', { message: '请输入 1–80 个字符的昵称。' });
      } else {
        setError('root.server', { message: GENERIC_ERROR });
      }
    }
  });

  if (loading) {
    return (
      <Stack accessibilityLabel="正在加载个人资料" gap={2}>
        <Spinner label="正在加载个人资料" />
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading>个人资料</Heading>
        <Text>昵称可以与其他家庭成员重复。</Text>
      </Stack>
      {loadError || errors.root?.server?.message ? (
        <Banner title="暂时无法保存">{loadError ?? errors.root?.server?.message}</Banner>
      ) : null}
      {success ? (
        <Stack accessibilityLiveRegion="polite" accessibilityRole={'status' as never} gap={1}>
          <Text>{success}</Text>
        </Stack>
      ) : null}
      {username ? (
        <Stack gap={1}>
          <Text variant="label">用户名</Text>
          <Text>{username}</Text>
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
            label="昵称"
            onBlur={() => {
              onBlur();
              validateNickname();
            }}
            onChangeText={onChange}
            ref={ref}
            textContentType="name"
            value={value}
          />
        )}
      />
      <Button
        disabled={loadError !== undefined || isSubmitting}
        label="保存昵称"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Stack>
  );
};
