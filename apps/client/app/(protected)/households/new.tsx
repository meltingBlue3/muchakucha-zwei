import { useTranslation } from '../../../src/i18n';
import { AppShell } from '../../../src/ui/household-components';
import { RouteWindow } from '../../../src/ui/route-window';
import { Controller, useForm } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { z } from 'zod';

import { sessionApiClient, sessionTransport } from '../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../src/features/households/household-context';
import { Banner, Button, Heading, Stack, Text, TextField } from '../../../src/ui/primitives';

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
    { message: 'nameLength' },
  );

type HouseholdFormValues = { name: string };

export default function NewHouseholdRoute() {
  const { t } = useTranslation(['households', 'common', 'navigation']);
  const router = useRouter();
  const exitAllowed = useRef(false);
  const { refreshHouseholds } = useHouseholdContext();
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState(false);
  const [successHouseholdId, setSuccessHouseholdId] = useState<string | null>(null);
  const {
    clearErrors,
    control,
    formState,
    getFieldState,
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
    setError('name', { message: 'nameLength' });
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
      exitAllowed.current = true;
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
      setError('name', { message: 'nameLength' });
      return;
    }
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) {
      setError('root.server', { message: 'common:genericError' });
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
      setError('root.server', { message: 'common:genericError' });
    }
  });

  if (successHouseholdId !== null) {
    return (
      <RouteWindow title={t('create')} resource="households" busy={isSubmitting || entering} exitAllowed={exitAllowed} fallback={<AppShell title={t('navigation:family')}><Text>{t('familyIntro')}</Text></AppShell>}>
        <Stack gap={6}>
          <Stack gap={2}>
            <Text variant="label" color="success">{t('createdReady')}</Text>
            <Heading>{t('createdTitle')}</Heading>
          </Stack>
          <Stack accessibilityLiveRegion="polite" accessibilityRole={'status' as never} gap={1}>
            <Text>{t('createdOwner')}</Text>
          </Stack>
          <Text variant="bodySm">{t('createdNext')}</Text>
          {enterError ? <Banner title={t('enterFailed')}>{t('enterRetryDetail')}</Banner> : null}
          <Button
            loading={entering}
            label={t('enter')}
            onPress={() => void handleEnterHousehold()}
          />
        </Stack>
      </RouteWindow>
    );
  }

  return (
    <RouteWindow title={t('create')} resource="households" busy={isSubmitting || entering} exitAllowed={exitAllowed} fallback={<AppShell title={t('navigation:family')}><Text>{t('familyIntro')}</Text></AppShell>}>
      <Stack gap={6}>
        <Stack gap={2}>
          <Text>{t('createIntro')}</Text>
        </Stack>
        {errors.root?.server?.message ? (
          <Banner title={t('createFailed')}>{t('common:genericError')}</Banner>
        ) : null}
        <Controller
          control={control}
          name="name"
          render={({ field: { onBlur, onChange, ref, value } }) => (
            <TextField
              autoCapitalize="words"
              autoComplete="off"
              disabled={isSubmitting}
              {...(errors.name?.message === undefined ? {} : { error: t('nameLength', { min: NAME_MIN, max: NAME_MAX }) })}
              label={t('name')}
              submitAttempt={submitCount}
              hint={t('nameHint')}
              placeholder={t('namePlaceholder')}
              returnKeyType="done"
              onSubmitEditing={() => { if (!isSubmitting) void submit(); }}
              onBlur={() => {
                onBlur();
                // An empty name is reported only on submit.
                if (getValues('name').trim() !== '' || getFieldState('name').error !== undefined) validateName();
              }}
              onChangeText={(text) => {
                onChange(text);
                if (getFieldState('name').error !== undefined) validateName();
              }}
              ref={ref}
              textContentType="none"
              value={value}
            />
          )}
        />
        <Button
          disabled={isSubmitting}
          label={t('create')}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      </Stack>
    </RouteWindow>
  );
}
