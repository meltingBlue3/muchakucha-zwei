import type { ApiClient, RegisterDto, RegistrationAcceptedDto } from '@muchakucha/api-client';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { PendingProofStore } from '../../platform/session/pending-proof';
import {
  Banner,
  Button,
  Heading,
  PasswordField,
  Stack,
  Text,
  TextField,
} from '../../ui/primitives';

const registrationSchema = z.object({
  displayName: z.string().trim().min(1, '请输入昵称。').max(80, '昵称不能超过 80 个字符。'),
  email: z.string().trim().email('请输入有效的邮箱地址。'),
  password: z.string().min(12, '密码至少需要 12 个字符。').max(128, '密码不能超过 128 个字符。'),
});

type RegistrationValues = z.infer<typeof registrationSchema>;
type RegisterClient = Pick<ApiClient, 'register'>;

export interface RegisterFormProps {
  apiClient: RegisterClient;
  onAccepted(email: string): void;
  pendingProofStore?: PendingProofStore | undefined;
  platform: RegisterDto['platform'];
}

const fieldMessages: Record<keyof RegistrationValues, string> = {
  displayName: '请检查昵称后重试。',
  email: '请输入有效的邮箱地址。',
  password: '请检查密码后重试。',
};

const isRegistrationField = (value: unknown): value is keyof RegistrationValues =>
  value === 'displayName' || value === 'email' || value === 'password';

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
  onAccepted,
  pendingProofStore,
  platform,
}: RegisterFormProps) => {
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    setError,
  } = useForm<RegistrationValues>({
    defaultValues: { displayName: '', email: '', password: '' },
  });
  const formError = errors.root?.server?.message;

  const validateField = (field: keyof RegistrationValues) => {
    const result = registrationSchema.shape[field].safeParse(getValues(field));
    if (result.success) clearErrors(field);
    else setError(field, { message: result.error.issues[0]?.message ?? fieldMessages[field] });
  };

  const submitRegistration = handleSubmit(async (values) => {
    clearErrors();
    const parsed = registrationSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (isRegistrationField(field)) setError(field, { message: issue.message });
      }
      return;
    }

    const controller = new AbortController();
    let accepted: RegistrationAcceptedDto;
    try {
      accepted = await apiClient.register({ ...parsed.data, platform }, controller.signal);
    } catch (error) {
      const fields = getServerFields(error);
      if (fields.length > 0) {
        for (const field of fields) setError(field, { message: fieldMessages[field] });
      } else {
        setError('root.server', {
          message: '这次没有完成。请检查网络后重试。',
        });
      }
      return;
    }

    if (platform === 'native') {
      if (accepted.pendingProof === undefined || pendingProofStore === undefined) {
        setError('root.server', {
          message: '这次没有完成。请检查网络后重试。',
        });
        return;
      }
      try {
        await pendingProofStore.write(accepted.pendingProof);
      } catch {
        setError('root.server', {
          message: '这次没有完成。请检查网络后重试。',
        });
        return;
      }
    }

    onAccepted(parsed.data.email);
  });

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading>创建你的账户</Heading>
        <Text>填写邮箱、昵称和密码，完成后我们会发送验证邮件。</Text>
      </Stack>
      {formError ? <Banner title="暂时无法创建账户">{formError}</Banner> : null}
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
        name="displayName"
        render={({ field: { onBlur, onChange, ref, value } }) => (
          <TextField
            autoComplete="name"
            {...(errors.displayName?.message === undefined ? {} : { error: errors.displayName.message })}
            label="昵称"
            onBlur={() => {
              onBlur();
              validateField('displayName');
            }}
            onChangeText={onChange}
            ref={ref}
            textContentType="name"
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
            autoComplete="new-password"
            {...(errors.password?.message === undefined ? {} : { error: errors.password.message })}
            label="密码"
            onBlur={() => {
              onBlur();
              validateField('password');
            }}
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
        onPress={() => void submitRegistration()}
      />
    </Stack>
  );
};
