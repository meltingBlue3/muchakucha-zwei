import type { ApiClient } from '@muchakucha/api-client';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import {
  AuthShell,
  Banner,
  Button,
  Heading,
  LinkText,
  PasswordField,
  Stack,
  StatusPanel,
  Text,
  TextField,
} from '../../ui/primitives';

export type PasswordResetApi = Pick<ApiClient, 'requestPasswordReset' | 'completePasswordReset'>;

const emailSchema = z.string().trim().email('请输入有效的邮箱地址。');
const passwordSchema = z
  .string()
  .min(12, '密码至少需要 12 个字符。')
  .max(128, '密码不能超过 128 个字符。');

const GENERIC_REQUEST_COPY = '如果该邮箱已注册，我们会发送一封重置邮件。';
const GENERIC_ERROR_COPY = '这次没有完成。请检查网络后重试。';

function errorPayload(error: unknown): { code?: unknown; details?: unknown } | undefined {
  if (typeof error !== 'object' || error === null || !('body' in error)) return undefined;
  const body = (error as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null) return undefined;
  if ('error' in body) {
    const nested = (body as { error?: unknown }).error;
    return typeof nested === 'object' && nested !== null
      ? (nested as { code?: unknown; details?: unknown })
      : undefined;
  }
  return body as { code?: unknown; details?: unknown };
}

function hasPasswordCode(error: unknown, code: string): boolean {
  const details = errorPayload(error)?.details;
  return (
    Array.isArray(details) &&
    details.some(
      (detail) =>
        typeof detail === 'object' &&
        detail !== null &&
        'field' in detail &&
        (detail as { field?: unknown }).field === 'password' &&
        'codes' in detail &&
        Array.isArray((detail as { codes?: unknown }).codes) &&
        ((detail as { codes: unknown[] }).codes).includes(code),
    )
  );
}

export interface ForgotPasswordFormProps {
  apiClient: Pick<PasswordResetApi, 'requestPasswordReset'>;
  onLogin(): void;
}

export const ForgotPasswordForm = ({ apiClient, onLogin }: ForgotPasswordFormProps) => {
  const [confirmation, setConfirmation] = useState<string>();
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    setError,
  } = useForm<{ email: string }>({ defaultValues: { email: '' } });

  const validateEmail = () => {
    const parsed = emailSchema.safeParse(getValues('email'));
    if (parsed.success) clearErrors('email');
    else setError('email', { message: parsed.error.issues[0]?.message ?? '请输入有效的邮箱地址。' });
  };

  const submit = handleSubmit(async (values) => {
    clearErrors();
    const parsed = emailSchema.safeParse(values.email);
    if (!parsed.success) {
      setError('email', { message: parsed.error.issues[0]?.message ?? '请输入有效的邮箱地址。' });
      return;
    }
    try {
      await apiClient.requestPasswordReset({ email: parsed.data }, new AbortController().signal);
      setConfirmation(GENERIC_REQUEST_COPY);
    } catch {
      setError('root.server', { message: GENERIC_ERROR_COPY });
    }
  });

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading>重置密码</Heading>
        <Text>输入登录邮箱，我们会发送一个限时重置链接。</Text>
      </Stack>
      {errors.root?.server?.message ? (
        <Banner title="暂时无法发送">{errors.root.server.message}</Banner>
      ) : null}
      {confirmation ? (
        <Stack accessibilityLiveRegion="polite" accessibilityRole={'status' as never} gap={2}>
          <Heading>请检查邮箱</Heading>
          <Text>{confirmation}</Text>
        </Stack>
      ) : (
        <>
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
                  validateEmail();
                }}
                onChangeText={onChange}
                onSubmitEditing={() => void submit()}
                ref={ref}
                textContentType="emailAddress"
                value={value}
              />
            )}
          />
          <Button
            disabled={isSubmitting}
            label="发送重置链接"
            loading={isSubmitting}
            onPress={() => void submit()}
          />
        </>
      )}
      <LinkText onPress={onLogin}>返回登录</LinkText>
    </Stack>
  );
};

export type ResetLinkOutcome = 'expired' | 'used' | 'invalid';

const outcomeCopy: Record<ResetLinkOutcome, { action: string; body: string; heading: string }> = {
  expired: {
    action: '重新发送重置邮件',
    body: '这个重置链接已过期。请重新发起密码重置。',
    heading: '重置链接已过期',
  },
  used: {
    action: '前往登录',
    body: '这个重置链接已经使用过。请使用新密码登录。',
    heading: '重置链接已使用',
  },
  invalid: {
    action: '重新发起重置',
    body: '无法使用这个重置链接。请重新发起密码重置。',
    heading: '无法使用此重置链接',
  },
};

export const ResetOutcomePanel = ({
  onAction,
  outcome,
}: {
  onAction(): void;
  outcome: ResetLinkOutcome;
}) => {
  const copy = outcomeCopy[outcome];
  return (
    <StatusPanel
      action={<Button label={copy.action} onPress={onAction} />}
      body={copy.body}
      heading={copy.heading}
      kind="expired"
    />
  );
};

export interface ResetPasswordFormProps {
  apiClient: Pick<PasswordResetApi, 'completePasswordReset'>;
  onInvalidLink(): void;
  onSuccess(): void;
  token: string;
}

export const ResetPasswordForm = ({
  apiClient,
  onInvalidLink,
  onSuccess,
  token,
}: ResetPasswordFormProps) => {
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    setError,
  } = useForm<{ password: string }>({ defaultValues: { password: '' } });

  const validatePassword = () => {
    const parsed = passwordSchema.safeParse(getValues('password'));
    if (parsed.success) clearErrors('password');
    else setError('password', { message: parsed.error.issues[0]?.message ?? '请检查密码后重试。' });
  };

  const submit = handleSubmit(async (values) => {
    clearErrors();
    const parsed = passwordSchema.safeParse(values.password);
    if (!parsed.success) {
      setError('password', { message: parsed.error.issues[0]?.message ?? '请检查密码后重试。' });
      return;
    }
    try {
      await apiClient.completePasswordReset(
        { password: parsed.data, token },
        new AbortController().signal,
      );
      onSuccess();
    } catch (error) {
      if (hasPasswordCode(error, 'COMMON_PASSWORD')) {
        setError('password', { message: '这个密码过于常见，请使用更强的密码。' });
      } else if (errorPayload(error)?.code === 'INVALID_PASSWORD_RESET_TOKEN') {
        onInvalidLink();
      } else {
        setError('root.server', { message: GENERIC_ERROR_COPY });
      }
    }
  });

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading>设置新密码</Heading>
        <Text>请使用 12–128 个字符，并避开常见密码。</Text>
      </Stack>
      {errors.root?.server?.message ? (
        <Banner title="暂时无法更新">{errors.root.server.message}</Banner>
      ) : null}
      <Controller
        control={control}
        name="password"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <PasswordField
            autoCapitalize="none"
            autoComplete="new-password"
            {...(errors.password?.message === undefined ? {} : { error: errors.password.message })}
            label="新密码"
            onBlur={() => {
              onBlur();
              validatePassword();
            }}
            onChangeText={onChange}
            onSubmitEditing={() => void submit()}
            ref={ref}
            textContentType="newPassword"
            value={value}
          />
        )}
      />
      <Button
        disabled={isSubmitting}
        label="更新密码"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Stack>
  );
};

export interface ResetPasswordLandingProps extends ResetPasswordFormProps {
  onRequestNew(): void;
  replaceTokenBearingLocation(): (() => void) | void;
}

export const ResetPasswordLanding = ({
  onInvalidLink,
  onRequestNew,
  replaceTokenBearingLocation,
  ...formProps
}: ResetPasswordLandingProps) => {
  const sanitized = useRef(false);
  const stopSanitizing = useRef<(() => void) | undefined>(undefined);
  const [outcome, setOutcome] = useState<ResetLinkOutcome>();

  if (!sanitized.current) {
    stopSanitizing.current = replaceTokenBearingLocation() ?? undefined;
    sanitized.current = true;
  }

  useEffect(() => () => stopSanitizing.current?.(), []);

  if (outcome) return <ResetOutcomePanel onAction={onRequestNew} outcome={outcome} />;

  return (
    <ResetPasswordForm
      {...formProps}
      onInvalidLink={() => {
        setOutcome('invalid');
        onInvalidLink();
      }}
    />
  );
};

export const ResetSuccess = ({ onLogin }: { onLogin(): void }) => (
  <AuthShell>
    <StatusPanel
      action={<Button label="返回登录" onPress={onLogin} />}
      body="为保护账户安全，所有设备都需要重新登录。"
      heading="密码已更新"
      kind="resetSuccess"
    />
  </AuthShell>
);
