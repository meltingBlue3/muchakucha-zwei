import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { GetHouseholdMemberDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { TaskForm } from '../../../../../src/features/tasks/task-form';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
} from '../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../src/ui/primitives';
import type { Theme } from '../../../../../src/ui/theme';
import type { CreateTaskDto } from '@muchakucha/api-client';

export default function CreateTaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
  } = useHouseholdContext();

  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

  const memberOptions = useMemo(
    () => members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    [members],
  );

  useEffect(() => {
    if (householdId === undefined || householdId === '') return;
    const fetchMembers = async () => {
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) return;
        const result = await sessionApiClient.getHousehold(token, householdId);
        setMembers(result.members);
      } catch {
        // leave empty
      } finally {
        setLoading(false);
      }
    };
    void fetchMembers();
  }, [householdId]);

  const handleSubmit = useCallback(async (data: CreateTaskDto) => {
    if (householdId === undefined || householdId === '') return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setSubmitError('登录已过期，请重新登录。');
        setSubmitting(false);
        return;
      }
      const task = await sessionApiClient.createTask(token, householdId, data);
      // Tag the new task with selected labels
      if (selectedLabelIds.length > 0) {
        await sessionApiClient.tagTask(token, householdId, task.id, { labelIds: selectedLabelIds });
      }
      router.back();
    } catch {
      setSubmitError('创建任务失败，请重试。');
      setSubmitting(false);
    }
  }, [householdId, router, selectedLabelIds]);

  if (viewState === 'accessChanged') {
    return (
      <AppShell accessibilityLabel="家庭访问权已变化">
        <AccessChangedPanel
          hasOtherHouseholds={households.length > 0}
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => { void refreshHouseholds().then(() => router.replace('/households')); }}
          onCreateNew={() => { void router.replace('/household-handoff'); }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell accessibilityLabel="创建任务">
      <Stack gap={4}>
        <HouseholdHeader householdName={currentHousehold?.name ?? ''} onOpenSwitcher={() => {}} />

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: activeTheme.spacing[6] }}>
            <ActivityIndicator color={activeTheme.colors.coral} />
          </View>
        ) : (
          <Stack gap={4}>
            {submitError !== null && (
              <View style={{
                backgroundColor: activeTheme.colors.destructiveSoft,
                padding: activeTheme.spacing[4],
                borderRadius: activeTheme.borderRadii.md,
              }}>
                <Text variant="bodySm" color="destructive">{submitError}</Text>
              </View>
            )}
            <TaskForm
              members={memberOptions}
              onSubmit={handleSubmit}
              onCancel={() => router.back()}
              submitLabel="创建任务"
              isSubmitting={submitting}
              householdId={householdId}
              selectedLabelIds={selectedLabelIds}
              onLabelChange={setSelectedLabelIds}
            />
          </Stack>
        )}
      </Stack>
    </AppShell>
  );
}
