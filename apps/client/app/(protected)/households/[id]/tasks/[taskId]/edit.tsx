import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { TaskResponseDto, GetHouseholdMemberDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { TaskForm } from '../../../../../../src/features/tasks/task-form';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
} from '../../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';
import type { CreateTaskDto } from '@muchakucha/api-client';

export default function EditTaskRoute() {
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
  } = useHouseholdContext();

  const [task, setTask] = useState<TaskResponseDto | null>(null);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

  const memberOptions = useMemo(
    () => members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    [members],
  );

  useEffect(() => {
    if (householdId === undefined || householdId === '' || taskId === undefined || taskId === '') return;
    const fetchData = async () => {
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) return;
        const [taskResult, householdResult] = await Promise.all([
          sessionApiClient.getTask(token, householdId, taskId),
          sessionApiClient.getHousehold(token, householdId),
        ]);
        setTask(taskResult);
        setMembers(householdResult.members);
        setSelectedLabelIds((taskResult.labels ?? []).map((l) => l.id));
      } catch {
        // leave empty
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [householdId, taskId]);

  const handleSubmit = useCallback(async (data: CreateTaskDto) => {
    if (householdId === undefined || householdId === '' || taskId === undefined || taskId === '') return;
    setSubmitting(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) return;
      await sessionApiClient.updateTask(token, householdId, taskId, data);
      // Sync labels: tag with all selected labels (replaces current)
      await sessionApiClient.tagTask(token, householdId, taskId, { labelIds: selectedLabelIds });
      router.back();
    } catch {
      setSubmitting(false);
    }
  }, [householdId, taskId, router, selectedLabelIds]);

  const handleDelete = useCallback(async () => {
    if (householdId === undefined || householdId === '' || taskId === undefined || taskId === '') return;
    setDeleting(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) return;
      await sessionApiClient.deleteTask(token, householdId, taskId);
      router.back();
    } catch {
      setDeleting(false);
    }
  }, [householdId, taskId, router]);

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
    <AppShell accessibilityLabel="编辑任务">
      <Stack gap={4}>
        <HouseholdHeader householdName={currentHousehold?.name ?? ''} onOpenSwitcher={() => {}} />

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: activeTheme.spacing[6] }}>
            <ActivityIndicator color={activeTheme.colors.coral} />
          </View>
        ) : task !== null ? (
          <Stack gap={4}>
            <TaskForm
              initial={task}
              members={memberOptions}
              onSubmit={handleSubmit}
              onCancel={() => router.back()}
              submitLabel="保存修改"
              isSubmitting={submitting}
              householdId={householdId}
              selectedLabelIds={selectedLabelIds}
              onLabelChange={setSelectedLabelIds}
            />
            {/* Delete section */}
            <View style={{ marginTop: activeTheme.spacing[4], borderTopWidth: 1, borderTopColor: activeTheme.colors.border, paddingTop: activeTheme.spacing[4] }}>
              {!confirmDelete ? (
                <Pressable
                  onPress={() => setConfirmDelete(true)}
                  disabled={deleting}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    paddingVertical: activeTheme.spacing[3],
                    borderRadius: activeTheme.borderRadii.sm,
                    borderWidth: 1,
                    borderColor: activeTheme.colors.destructive,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityLabel="删除任务"
                >
                  <Text variant="button" color="destructive">
                    删除任务
                  </Text>
                </Pressable>
              ) : (
                <Stack gap={3}>
                  <Text variant="bodySm" color="destructive">
                    确定要删除这个任务吗？此操作不可撤销。
                  </Text>
                  <View style={{ flexDirection: 'row', gap: activeTheme.spacing[3] }}>
                    <Pressable
                      onPress={() => setConfirmDelete(false)}
                      disabled={deleting}
                      style={({ pressed }) => ({
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: activeTheme.spacing[3],
                        borderRadius: activeTheme.borderRadii.sm,
                        borderWidth: 1,
                        borderColor: activeTheme.colors.border,
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityLabel="取消删除"
                    >
                      <Text variant="button" color="ink">取消</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleDelete}
                      disabled={deleting}
                      style={({ pressed }) => ({
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: activeTheme.spacing[3],
                        borderRadius: activeTheme.borderRadii.sm,
                        backgroundColor: deleting ? activeTheme.colors.disabled : activeTheme.colors.destructive,
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityLabel="确认删除任务"
                    >
                      <Text variant="button" color="surface">
                        {deleting ? '删除中…' : '确认删除'}
                      </Text>
                    </Pressable>
                  </View>
                </Stack>
              )}
            </View>
          </Stack>
        ) : (
          <Text variant="bodySm" color="inkMuted">任务未找到。</Text>
        )}
      </Stack>
    </AppShell>
  );
}
