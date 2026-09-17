import { AppShell } from '../../../src/ui/household-components';
import { AccountCard } from '../../../src/ui/account-components';
import { theme } from '../../../src/ui/theme';
import { Controller, useForm } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { z } from 'zod';

import { sessionApiClient, sessionTransport } from '../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../src/features/households/household-context';
import { Banner, Button, Heading, Stack, Text, TextField } from '../../../src/ui/primitives';

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
  const router = useRouter();
  const { refreshHouseholds } = useHouseholdContext();
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState(false);
  const [successHouseholdId, setSuccessHouseholdId] = useState<string | null>(null);
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
  const { errors, isSubmitting, submitCount } = formState;

  const validateName = (): boolean => {
    const parsed = nameSchema.safeParse(getValues('name'));
    if (parsed.success) {
      clearErrors('name');
      return true;
    }
    setError('name', { message: parsed.error.issues[0]?.message ?? '请检查家庭名称。' });
    return false;
  };

  const handleEnterHousehold = useCallback(async () => {
    if (successHouseholdId === null || entering) return;
    setEntering(true);
    setEnterError(false);
    try {
      if (!await refreshHouseholds(successHouseholdId)) {
        setEnterError(true);
        return;
      }
      router.replace(`/households/${encodeURIComponent(successHouseholdId)}`);
    } catch {
      setEnterError(true);
    } finally {
      setEntering(false);
    }
  }, [successHouseholdId, refreshHouseholds, router, entering]);

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
      setSuccessHouseholdId(household.id);
    } catch {
      setError('root.server', { message: GENERIC_ERROR });
    }
  });

  if (successHouseholdId !== null) {
    return (
      <AppShell title="创建家庭" showBack showProfile onBack={() => router.canGoBack() ? router.back() : router.replace('/household-handoff')}><Stack style={{ width: '100%', maxWidth: theme.layout.authCardMaxWidth, alignSelf: 'center' }}><AccountCard>
        <Stack gap={6}>
          <Stack gap={2}>
            <Text variant="label" color="teal">准备好了</Text>
            <Heading>家庭已创建</Heading>
          </Stack>
          <Stack accessibilityLiveRegion="polite" accessibilityRole={'status' as never} gap={1}>
            <Text>家庭已创建。你现在是这个家庭的所有者。</Text>
          </Stack>
          <Text variant="bodySm">先添加一件小事，也可以稍后到「家庭 → 家庭设置」邀请家人。</Text>
          {enterError ? <Banner title="暂时无法进入">家庭已经创建，无需重复创建。请重试进入。</Banner> : null}
          <Button
            loading={entering}
            label="进入家庭"
            onPress={() => void handleEnterHousehold()}
          />
        </Stack>
      </AccountCard></Stack></AppShell>
    );
  }

  return (
    <AppShell title="创建家庭" showBack showProfile onBack={() => router.canGoBack() ? router.back() : router.replace('/household-handoff')}><Stack style={{ width: '100%', maxWidth: theme.layout.authCardMaxWidth, alignSelf: 'center' }}><AccountCard>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading>创建家庭</Heading>
          <Text>给你们的共享空间起个名字。只需这一步，之后可以再邀请家人。</Text>
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
              submitAttempt={submitCount}
              hint="1–40 个字符，之后可以在家庭设置中修改。"
              placeholder="例如：我们的小家"
              returnKeyType="done"
              onSubmitEditing={() => { if (!isSubmitting) void submit(); }}
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
    </AccountCard></Stack></AppShell>
  );
}
