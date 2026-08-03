import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { z } from 'zod';

import { sessionApiClient, sessionTransport } from '../../../src/features/auth/session-runtime';
import { AuthShell, Banner, Button, Heading, Stack, Text, TextField } from '../../../src/ui/primitives';

const GENERIC_ERROR = '这次没有完成。请检查网络后重试。';
const NAME_MIN = 1;
const NAME_MAX = 40;

const nameSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      const codePointCount = [...value.normalize('NFC')].length;
      return codePointCount >= NAME_MIN && codePointCount <= NAME_MAX;
    },
    { message: `请输入 1–${NAME_MAX} 个字符的家庭名称。` },
  );

type HouseholdFormValues = { name: string };

export default function NewHouseholdRoute() {
  const [successHousehold, setSuccessHousehold] = useState<{
    name: string;
    role: string;
  } | null>(null);
  const {
    clearErrors,
    control,
    formState,
    getValues,
    handleSubmit,
    setError,
  } = useForm<HouseholdFormValues>({
    defaultValues: { name: '' },
  });
  const { errors, isSubmitting } = formState;

  const validateName = (): boolean => {
    const parsed = nameSchema.safeParse(getValues('name'));
    if (parsed.success) {
      clearErrors('name');
      return true;
    }
    setError('name', { message: parsed.error.issues[0]?.message ?? '请检查家庭名称。' });
    return false;
  };

  const submit = handleSubmit(async (values) => {
    clearErrors();
    const parsed = nameSchema.safeParse(values.name);
    if (!parsed.success) {
      setError('name', { message: parsed.error.issues[0]?.message ?? '请检查家庭名称。' });
      return;
    }
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) {
      setError('root.server', { message: GENERIC_ERROR });
      return;
    }
    const normalizedName = parsed.data.normalize('NFC');
    try {
      const household = await sessionApiClient.createHousehold(
        accessToken,
        { name: normalizedName },
        new AbortController().signal,
      );
      setSuccessHousehold({
        name: household.name,
        role: household.membership.role === 'ADMIN' ? '所有者' : '成员',
      });
    } catch {
      setError('root.server', { message: GENERIC_ERROR });
    }
  });

  if (successHousehold !== null) {
    return (
      <AuthShell>
        <Stack gap={6}>
          <Stack gap={2}>
            <Heading>{successHousehold.name}</Heading>
          </Stack>
          <Stack accessibilityLiveRegion="polite" accessibilityRole={'status' as never} gap={1}>
            <Text>家庭已创建。你现在是这个家庭的所有者。</Text>
            <Text>角色：{successHousehold.role}</Text>
          </Stack>
        </Stack>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading>创建家庭</Heading>
          <Text>输入 1–40 个字符的家庭名称。</Text>
        </Stack>
        {errors.root?.server?.message ? (
          <Banner title="创建失败">{errors.root.server.message}</Banner>
        ) : null}
        <Controller
          control={control}
          name="name"
          render={({ field: { onBlur, onChange, ref, value } }) => (
            <TextField
              autoCapitalize="words"
              autoComplete="off"
              disabled={isSubmitting}
              {...(errors.name?.message === undefined ? {} : { error: errors.name.message })}
              label="家庭名称"
              onBlur={() => {
                onBlur();
                validateName();
              }}
              onChangeText={onChange}
              ref={ref}
              textContentType="none"
              value={value}
            />
          )}
        />
        <Button
          disabled={isSubmitting}
          label="创建家庭"
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      </Stack>
    </AuthShell>
  );
}
