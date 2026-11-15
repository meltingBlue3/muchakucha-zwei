import type { ApiClient, CurrentUserDto } from '@muchakucha/api-client';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { z } from 'zod';

import { useTranslation } from '../../i18n';
import type { SessionStateStore } from '../auth/session-state';
import type { SessionTransport } from '../../platform/session/session-transport';
import { Banner, Button, LoadError, Spinner, Stack, Text, TextField } from '../../ui/primitives';
import { MemberAvatar } from '../../ui/member-avatar';
import { SettingsSection } from '../../ui/settings-section';
import { theme } from '../../ui/theme';
import { useDesktop } from '../../ui/use-desktop';

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
  const desktop = useDesktop();
  // Desktop edits the nickname in its row; the row reads as text until 编辑.
  const [editing, setEditing] = useState(false);
  const editTrigger = useRef<View>(null);
  const wasEditing = useRef(false);
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
      setEditing(false);
    } catch (error) {
      if (isDisplayNameFailure(error)) {
        setError('displayName', { message: t('form.nicknameLength') });
      } else {
        setError('root.server', { message: genericError });
      }
    }
  });

  // Leaving the field, by saving or cancelling, returns focus to 编辑.
  useEffect(() => {
    const left = wasEditing.current && !editing;
    wasEditing.current = editing;
    if (!left) return undefined;
    const frame = requestAnimationFrame(() => editTrigger.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const cancelEditing = () => {
    reset({ displayName: savedName });
    clearErrors();
    setEditing(false);
  };

  if (loading) {
    return (
      <Stack accessibilityLabel={t('form.loading')} gap={2}>
        <Spinner label={t('form.loading')} />
      </Stack>
    );
  }

  if (desktop) {
    // One fact per row, as on 家庭设置's 基本信息: the label in its column, then the value.
    const row = (label: string, value: ReactNode, trailing?: ReactNode, alignTop = false) => <View style={{ flexDirection: 'row', alignItems: alignTop ? 'flex-start' : 'center', gap: theme.spacing[3], minHeight: theme.layout.desktopRowHeight, paddingVertical: alignTop ? theme.spacing[1] : 0, borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }}>
      <Text variant="meta" color="inkFaint" style={{ width: theme.layout.fieldLabelColumn, ...(alignTop ? { paddingTop: (theme.layout.desktopField - theme.typography.meta.lineHeight) / 2 } : {}) }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>{value}</View>
      {trailing}
    </View>;
    const nicknameField = <Controller
      control={control}
      name="displayName"
      render={({ field: { onBlur, onChange, ref, value } }) => (
        <TextField
          hideLabel
          autoFocus
          autoCapitalize="words"
          autoComplete="name"
          disabled={isSubmitting}
          {...(errors.displayName?.message === undefined ? {} : { error: errors.displayName.message })}
          label={t('nickname')}
          submitAttempt={submitCount}
          returnKeyType="done"
          onSubmitEditing={() => { if (isDirty && !isSubmitting) void submit(); }}
          onKeyPress={(event) => { if (Platform.OS === 'web' && event.nativeEvent.key === 'Escape' && !isSubmitting) cancelEditing(); }}
          onBlur={onBlur}
          onChangeText={(next) => {
            setSuccess(undefined);
            onChange(next);
            if (getFieldState('displayName').error !== undefined) validateNickname();
          }}
          ref={ref}
          textContentType="name"
          value={value}
        />
      )}
    />;
    return (
      <Stack gap={3}>
        {loadError ? (
          <LoadError title={t('form.loadFailedTitle')} message={loadError} retryLabel={t('form.reload')} onRetry={() => setReload((value) => value + 1)} />
        ) : errors.root?.server?.message ? (
          <Banner title={t('form.saveFailedTitle')}>{errors.root.server.message}</Banner>
        ) : null}
        <SettingsSection title={t('form.basics')} icon={null}>
          <View style={{ marginTop: theme.spacing[1] }}>
            {editing
              ? row(t('nickname'), nicknameField, <View style={{ flexDirection: 'row', gap: theme.spacing[2], marginTop: (theme.layout.desktopField - theme.layout.desktopControl) / 2 }}>
                <Button label={t('common:cancel')} tone="secondary" size="compact" disabled={isSubmitting} onPress={cancelEditing} />
                <Button label={t('common:save')} size="compact" loading={isSubmitting} disabled={isSubmitting || !isDirty} onPress={() => void submit()} />
              </View>, true)
              : row(t('nickname'), <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                {userId ? <MemberAvatar id={userId} name={savedName || t('form.me')} size="sm" /> : null}
                <Text variant="bodySm" color="ink" numberOfLines={1} style={{ flexShrink: 1, fontWeight: '600' }}>{savedName}</Text>
              </View>, <Button ref={editTrigger} label={t('common:edit')} accessibilityLabel={t('form.editNickname')} tone="secondary" size="compact" disabled={loadError !== undefined} style={{ minHeight: theme.spacing[6] + 2, paddingHorizontal: theme.spacing[3] }} onPress={() => { setSuccess(undefined); setEditing(true); }} />)}
            {username ? row(t('username'), <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: theme.spacing[3] }}>
              <Text variant="bodySm" color="ink">{username}</Text>
              <Text variant="meta" color="inkFaint">{t('usernameNote')}</Text>
            </View>) : null}
          </View>
        </SettingsSection>
        {success ? <Text variant="meta" accessibilityLiveRegion="polite" accessibilityRole={'status' as never}>{success}</Text> : null}
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
