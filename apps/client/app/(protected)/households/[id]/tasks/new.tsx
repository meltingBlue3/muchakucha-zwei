import { useCreateWithLabels } from '../../../../../src/features/households/use-create-with-labels';
import { useWorkspaceStore, useWorkspaceState } from '../../../../../src/ui/workspace-state';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { GetHouseholdMemberDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { TaskForm } from '../../../../../src/features/tasks/task-form';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdContextNote,
} from '../../../../../src/ui/household-components';
import { Button, Stack, Text } from '../../../../../src/ui/primitives';
import type { Theme } from '../../../../../src/ui/theme';
import type { CreateTaskDto } from '@muchakucha/api-client';

export default function CreateTaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:tasks:new:`;
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
  const [selectedLabelIds, setSelectedLabelIds] = useWorkspaceState<string[]>(draftPrefix + 'labels', []);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;

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

  const { submit, retry, created, pending: submitting, error: submitError } = useCreateWithLabels<CreateTaskDto>({
    key: draftPrefix + 'created',
    create: async (data) => {
      const token = sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      return sessionApiClient.createTask(token, id!, data);
    },
    tag: async (resourceId, labelIds) => {
      const token = sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      return sessionApiClient.tagTask(token, id!, resourceId, { labelIds });
    },
    onComplete: () => { workspace.clear(draftPrefix); router.back(); },
  });
  const handleSubmit = (data: CreateTaskDto) => submit(data, selectedLabelIds);

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
    <AppShell accessibilityLabel="创建任务" title="创建任务" showBack showProfile>
      <Stack gap={4}>
        <HouseholdContextNote householdName={currentHousehold?.name ?? ''} />

        {created !== null ? (
          <Stack gap={4}><Text>任务已创建</Text><Text accessibilityRole="alert">{submitError ?? '正在保存标签…'}</Text><Button label="重试保存标签" loading={submitting} onPress={() => void retry()} /></Stack>
        ) : loading ? (
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
            draftKey={draftPrefix + 'form'}
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
