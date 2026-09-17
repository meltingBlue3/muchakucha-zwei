import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { LabelResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { LabelChip } from '../../../../../src/features/labels/label-chip';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../../../../src/ui/household-components';
import { Stack, Text, Heading } from '../../../../../src/ui/primitives';
import { labelColorPresets, type Theme } from '../../../../../src/ui/theme';

const PRESET_COLORS = labelColorPresets;

export default function LabelsIndexRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
    switchHousehold,
  } = useHouseholdContext();

  const [labels, setLabels] = useState<LabelResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]!);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]!);
  const [editing, setEditing] = useState(false);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;

  const fetchLabels = useCallback(async () => {
    if (householdId === undefined || householdId === '') return;
    setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期。');
        return;
      }
      const result = await sessionApiClient.listLabels(token, householdId);
      setLabels(result.labels);
    } catch {
      setError('无法加载标签。');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  // Refetch whenever this screen regains focus (e.g. returning from
  // create/edit), not just on first mount — otherwise the list shows
  // stale data after a mutation elsewhere in the stack.
  useFocusEffect(
    useCallback(() => {
      void fetchLabels();
    }, [fetchLabels]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLabels();
    setRefreshing(false);
  }, [fetchLabels]);

  const handleSwitch = useCallback(async (householdId: string) => {
    if (householdId === (id ?? currentHouseholdId)) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(householdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(householdId)}/labels`);
    }
    setSwitcherOpen(false);
  }, [id, currentHouseholdId, switchHousehold, router]);

  const handleCreate = useCallback(async () => {
    if (householdId === undefined || householdId === '' || newName.trim() === '') return;
    setCreating(true);
    setCreateError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) return;
      await sessionApiClient.createLabel(token, householdId, {
        name: newName.trim(),
        color: newColor,
      });
      setNewName('');
      void fetchLabels();
    } catch {
      setCreateError('创建标签失败。');
    } finally {
      setCreating(false);
    }
  }, [householdId, newName, newColor, fetchLabels]);

  const handleStartEdit = useCallback((label: LabelResponseDto) => {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (householdId === undefined || householdId === '' || editingId === null || editName.trim() === '') return;
    setEditing(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) return;
      await sessionApiClient.updateLabel(token, householdId, editingId, {
        name: editName.trim(),
        color: editColor,
      });
      setEditingId(null);
      void fetchLabels();
    } catch {
      // silently ignore
    } finally {
      setEditing(false);
    }
  }, [householdId, editingId, editName, editColor, fetchLabels]);

  const handleDelete = useCallback(async () => {
    if (householdId === undefined || householdId === '' || confirmDeleteId === null) return;
    setDeleting(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) return;
      await sessionApiClient.deleteLabel(token, householdId, confirmDeleteId);
      setConfirmDeleteId(null);
      void fetchLabels();
    } catch {
      // silently ignore
    } finally {
      setDeleting(false);
    }
  }, [householdId, confirmDeleteId, fetchLabels]);

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

  if (householdId === undefined || householdId === '') {
    return (
      <AppShell accessibilityLabel="页面未找到">
        <Stack gap={4}>
          <Text>这个页面暂时无法访问。</Text>
        </Stack>
      </AppShell>
    );
  }

  const inputStyle = {
    backgroundColor: activeTheme.colors.surface,
    borderWidth: 1,
    borderColor: activeTheme.colors.border,
    borderRadius: activeTheme.borderRadii.sm,
    paddingHorizontal: activeTheme.spacing[4],
    paddingVertical: activeTheme.spacing[3],
    fontSize: activeTheme.typography.body.fontSize,
    color: activeTheme.colors.ink,
    minHeight: activeTheme.controlSizes.field,
    flex: 1,
  };

  return (
    <>
      <AppShell accessibilityLabel="标签管理" refreshing={refreshing} onRefresh={handleRefresh} title="标签管理" showProfile>
        <Stack gap={4}>
          <HouseholdHeader
            householdName={currentHousehold?.name ?? ''}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />

          <Heading>标签管理</Heading>

          {/* Create new label */}
          <View style={{
            backgroundColor: activeTheme.colors.surface,
            borderRadius: activeTheme.borderRadii.md,
            padding: activeTheme.spacing[4],
            borderWidth: 1,
            borderColor: activeTheme.colors.border,
          }}>
            <Stack gap={3}>
              <Text variant="label">创建新标签</Text>
              <View style={{ flexDirection: 'row', gap: activeTheme.spacing[2] }}>
                <TextInput
                  value={newName}
                  onChangeText={(v) => {
                    setNewName(v);
                    setCreateError(null);
                  }}
                  placeholder="标签名称"
                  placeholderTextColor={activeTheme.colors.inkMuted}
                  style={inputStyle}
                  maxLength={30}
                  accessibilityLabel="标签名称"
                />
                <Pressable
                  onPress={handleCreate}
                  disabled={creating || newName.trim() === ''}
                  style={({ pressed }) => ({
                    backgroundColor: creating || newName.trim() === '' ? activeTheme.colors.disabled : activeTheme.colors.coral,
                    borderRadius: activeTheme.borderRadii.sm,
                    paddingHorizontal: activeTheme.spacing[4],
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: creating || newName.trim() === '' }}
                  accessibilityLabel="创建标签"
                >
                  <Text variant="button" color="surface">
                    {creating ? '…' : '创建'}
                  </Text>
                </Pressable>
              </View>
              {createError !== null && (
                <Text variant="caption" color="destructive">{createError}</Text>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
                {PRESET_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setNewColor(color)}
                    accessibilityLabel={`选择颜色 ${color}`}
                    accessibilityRole="radio"
                    aria-checked={newColor === color}
                    hitSlop={activeTheme.spacing[3]}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: activeTheme.borderRadii.full,
                      backgroundColor: color,
                      borderWidth: newColor === color ? 3 : 0,
                      borderColor: activeTheme.colors.ink,
                    }}
                  />
                ))}
              </View>
            </Stack>
          </View>

          {/* Labels list */}
          {loading && (
            <View style={{ alignItems: 'center', paddingVertical: activeTheme.spacing[6] }}>
              <ActivityIndicator color={activeTheme.colors.coral} />
            </View>
          )}

          {error !== null && (
            <View style={{
              backgroundColor: activeTheme.colors.destructiveSoft,
              padding: activeTheme.spacing[4],
              borderRadius: activeTheme.borderRadii.md,
            }}>
              <Text variant="bodySm" color="destructive">{error}</Text>
            </View>
          )}

          {!loading && error === null && labels.length === 0 && (
            <Text variant="bodySm" color="inkMuted">
              还没有标签。使用上方表单创建标签，然后可以给事件和任务打标签。
            </Text>
          )}

          {labels.map((label) => (
            <View
              key={label.id}
              style={{
                backgroundColor: activeTheme.colors.surface,
                borderRadius: activeTheme.borderRadii.md,
                padding: activeTheme.spacing[4],
                borderWidth: 1,
                borderColor: activeTheme.colors.border,
              }}
            >
              {editingId === label.id ? (
                <Stack gap={3}>
                  <View style={{ flexDirection: 'row', gap: activeTheme.spacing[2], alignItems: 'center' }}>
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      style={inputStyle}
                      maxLength={30}
                      accessibilityLabel="编辑标签名称"
                    />
                    <Pressable
                      onPress={handleSaveEdit}
                      disabled={editing || editName.trim() === ''}
                      style={({ pressed }) => ({
                        backgroundColor: editing || editName.trim() === '' ? activeTheme.colors.disabled : activeTheme.colors.teal,
                        borderRadius: activeTheme.borderRadii.sm,
                        paddingHorizontal: activeTheme.spacing[4],
                        paddingVertical: activeTheme.spacing[3],
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: editing || editName.trim() === '' }}
                      accessibilityLabel="保存"
                    >
                      <Text variant="button" color="surface">保存</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setEditingId(null)}
                      style={({ pressed }) => ({
                        padding: activeTheme.spacing[2],
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityRole="button"
                      accessibilityLabel="取消编辑"
                    >
                      <Text variant="label" color="inkMuted">取消</Text>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
                    {PRESET_COLORS.map((color) => (
                      <Pressable
                        key={color}
                        onPress={() => setEditColor(color)}
                        accessibilityLabel={`选择颜色 ${color}`}
                        accessibilityRole="radio"
                        aria-checked={editColor === color}
                        hitSlop={activeTheme.spacing[3]}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: activeTheme.borderRadii.full,
                          backgroundColor: color,
                          borderWidth: editColor === color ? 3 : 0,
                          borderColor: activeTheme.colors.ink,
                        }}
                      />
                    ))}
                  </View>
                </Stack>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <LabelChip label={label} />
                  <View style={{ flexDirection: 'row', gap: activeTheme.spacing[2] }}>
                    <Pressable
                      onPress={() => handleStartEdit(label)}
                      disabled={confirmDeleteId === label.id}
                      hitSlop={activeTheme.spacing[2]}
                      style={({ pressed }) => ({
                        padding: activeTheme.spacing[2],
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityRole="button"
                      accessibilityLabel={`编辑标签 ${label.name}`}
                    >
                      <Text variant="bodySm" color="coral">编辑</Text>
                    </Pressable>
                    {confirmDeleteId === label.id ? (
                      <View style={{ flexDirection: 'row', gap: activeTheme.spacing[1], alignItems: 'center' }}>
                        <Text variant="caption" color="destructive">确定删除？</Text>
                        <Pressable onPress={handleDelete} disabled={deleting} accessibilityRole="button" accessibilityState={{ disabled: deleting, busy: deleting }} accessibilityLabel={`确认删除标签 ${label.name}`} hitSlop={activeTheme.spacing[4]} style={{ paddingHorizontal: activeTheme.spacing[1] }}>
                          <Text variant="caption" color="destructive" style={{ fontWeight: '600' as const }}>
                            {deleting ? '删除中…' : '确认'}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => setConfirmDeleteId(null)} accessibilityRole="button" accessibilityLabel="取消删除" hitSlop={activeTheme.spacing[4]} style={{ paddingHorizontal: activeTheme.spacing[1] }}>
                          <Text variant="caption" color="inkMuted">取消</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setConfirmDeleteId(label.id)}
                        hitSlop={activeTheme.spacing[2]}
                        style={({ pressed }) => ({
                          padding: activeTheme.spacing[2],
                          opacity: pressed ? 0.7 : 1,
                        })}
                        accessibilityRole="button"
                        accessibilityLabel={`删除标签 ${label.name}`}
                      >
                        <Text variant="bodySm" color="destructive">删除</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>
          ))}
        </Stack>
      </AppShell>

      <HouseholdSwitcher
        currentHouseholdId={id ?? currentHouseholdId}
        households={households}
        onCreateNew={() => {
          void router.push('/households/new');
          setSwitcherOpen(false);
        }}
        onClose={() => setSwitcherOpen(false)}
        onSelect={(hid) => { void handleSwitch(hid); }}
        visible={switcherOpen}
      />
    </>
  );
}
