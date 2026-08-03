import type { ListMyHouseholdsItemDto } from '@muchakucha/api-client';
import Home from 'lucide-react-native/icons/home';
import X from 'lucide-react-native/icons/x';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Users from 'lucide-react-native/icons/users';
import Crown from 'lucide-react-native/icons/crown';
import AlertTriangle from 'lucide-react-native/icons/alert-triangle';

import React, { forwardRef, useCallback, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput as NativeTextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Theme } from './theme';
import {
  Button,
  Heading,
  Inline,
  Spinner,
  Stack,
  Text,
} from './primitives';
import { theme } from './theme';

// ---- AppShell ----

interface AppShellProps {
  children: React.ReactNode;
  accessibilityLabel?: string;
}

export const AppShell = ({ children, accessibilityLabel }: AppShellProps) => (
  <SafeAreaView
    accessibilityLabel={accessibilityLabel}
    role={Platform.OS === 'web' ? 'main' : undefined}
    style={{ backgroundColor: theme.colors.canvas, flex: 1 }}
  >
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: theme.layout.mobileInset,
        paddingVertical: theme.spacing[6],
        maxWidth: Platform.OS === 'web' ? theme.layout.householdMaxWidth : undefined,
        alignSelf: Platform.OS === 'web' ? 'center' : undefined,
        width: '100%',
      }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  </SafeAreaView>
);

// ---- HouseholdHeader ----

interface HouseholdHeaderProps {
  householdName: string;
  onOpenSwitcher: () => void;
}

export const HouseholdHeader = ({ householdName, onOpenSwitcher }: HouseholdHeaderProps) => (
  <View
    accessibilityLabel={`当前家庭：${householdName}，切换家庭`}
    accessibilityRole="button"
    style={{
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: theme.controlSizes.touchTarget + 8,
      paddingVertical: theme.spacing[2],
    }}
  >
    <View style={{ flex: 1 }}>
      <Text variant="caption">当前家庭</Text>
      <Text
        numberOfLines={2}
        variant="body"
        style={{ fontWeight: '600' as const }}
      >
        {householdName}
      </Text>
    </View>
    <Pressable
      accessible={false}
      hitSlop={theme.spacing[2]}
      onPress={onOpenSwitcher}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: theme.controlSizes.touchTarget,
        minWidth: theme.controlSizes.touchTarget,
      }}
    >
      <ChevronDown color={theme.colors.ink} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
    </Pressable>
  </View>
);

// ---- HouseholdContextNote ----

interface HouseholdContextNoteProps {
  householdName: string;
}

export const HouseholdContextNote = ({ householdName }: HouseholdContextNoteProps) => (
  <Inline gap={1}>
    <Home color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
    <Text variant="bodySm">保存到：{householdName}</Text>
  </Inline>
);

// ---- HouseholdCard ----

interface HouseholdCardProps {
  household: ListMyHouseholdsItemDto;
  isCurrent?: boolean;
  onSelect?: (id: string) => void;
  primaryAction?: { label: string; onPress: () => void };
}

export const HouseholdCard = ({ household, isCurrent = false, onSelect, primaryAction }: HouseholdCardProps) => {
  const roleText = household.role === 'ADMIN' ? '管理员' : '成员';
  const memberLabel = `${household.memberCount} 位成员`;

  return (
    <Pressable
      accessibilityRole={onSelect !== undefined ? 'button' : 'none'}
      onPress={onSelect !== undefined ? () => onSelect(household.id) : undefined}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
        borderColor: isCurrent ? theme.colors.coral : theme.colors.border,
        borderRadius: theme.borderRadii.lg,
        borderWidth: theme.borderWidths.default,
        padding: theme.spacing[4],
      })}
    >
      <Stack gap={2}>
        <Inline gap={2} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Stack gap={1} style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              variant="body"
              style={{ fontWeight: '600' as const }}
              accessibilityLabel={`家庭：${household.name}`}
            >
              {household.name}
            </Text>
            <Inline gap={2}>
              <Text variant="bodySm">{roleText}</Text>
              <Text variant="bodySm">{memberLabel}</Text>
            </Inline>
          </Stack>
          {isCurrent ? (
            <Check color={theme.colors.coral} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
          ) : null}
        </Inline>
        {primaryAction !== undefined ? (
          <Button
            label={primaryAction.label}
            onPress={primaryAction.onPress}
          />
        ) : null}
      </Stack>
    </Pressable>
  );
};

// ---- HouseholdSwitcher ----

interface HouseholdSwitcherProps {
  households: ListMyHouseholdsItemDto[];
  currentHouseholdId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  visible: boolean;
  onClose: () => void;
}

export const HouseholdSwitcher = forwardRef<View, HouseholdSwitcherProps>(
  ({ households, currentHouseholdId, onSelect, onCreateNew, visible, onClose }, ref) => {
    const headingRef = useRef<View>(null);

    const handleSelect = useCallback((id: string) => {
      onSelect(id);
      onClose();
    }, [onSelect, onClose]);

    const content = (
      <View
        ref={ref}
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: Platform.OS === 'web' ? theme.borderRadii.lg : 0,
          maxHeight: Platform.OS === 'web'
            ? theme.layout.switcherMaxHeight
            : '75%' as unknown as number,
          width: Platform.OS === 'web' ? theme.layout.switcherWidth : '100%',
          ...(Platform.OS === 'web'
            ? { boxShadow: theme.elevation.softWeb as string }
            : {}),
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            alignItems: 'center',
            borderBottomColor: theme.colors.border,
            borderBottomWidth: theme.borderWidths.default,
            flexDirection: 'row',
            justifyContent: 'space-between',
            padding: theme.spacing[4],
          }}
        >
          <Heading ref={headingRef}>切换家庭</Heading>
          <Pressable
            accessibilityLabel="关闭切换家庭"
            onPress={onClose}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: theme.controlSizes.touchTarget,
              minWidth: theme.controlSizes.touchTarget,
            }}
          >
            <X color={theme.colors.ink} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }}>
          {households.map((household) => (
            <Pressable
              accessibilityLabel={`${household.name}，${household.role === 'ADMIN' ? '管理员' : '成员'}`}
              accessibilityRole="button"
              accessibilityState={{ selected: household.id === currentHouseholdId }}
              key={household.id}
              onPress={() => handleSelect(household.id)}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
                flexDirection: 'row',
                justifyContent: 'space-between',
                minHeight: 72,
                paddingHorizontal: theme.spacing[4],
                paddingVertical: theme.spacing[2],
              })}
            >
              <Stack gap={1} style={{ flex: 1 }}>
                <Text numberOfLines={1} variant="body">
                  {household.name}
                </Text>
                <Inline gap={2}>
                  <Text variant="caption">
                    {household.role === 'ADMIN' ? '管理员' : '成员'}
                  </Text>
                  <Text variant="caption">
                    {household.memberCount} 位成员
                  </Text>
                </Inline>
              </Stack>
              {household.id === currentHouseholdId ? (
                <Check color={theme.colors.coral} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
              ) : null}
            </Pressable>
          ))}
          <View style={{ padding: theme.spacing[4] }}>
            <Button label="创建家庭" onPress={onCreateNew} />
          </View>
        </ScrollView>
      </View>
    );

    if (Platform.OS === 'web') {
      return (
        <Modal
          animationType="fade"
          onRequestClose={onClose}
          transparent
          visible={visible}
        >
          <Pressable
            onPress={onClose}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.overlay,
              flex: 1,
              justifyContent: 'center',
              padding: theme.spacing[6],
            }}
          >
            <Pressable onPress={() => undefined}>
              {content}
            </Pressable>
          </Pressable>
        </Modal>
      );
    }

    return (
      <Modal
        animationType="slide"
        onRequestClose={onClose}
        transparent
        visible={visible}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            onPress={onClose}
            style={{
              backgroundColor: theme.colors.overlay,
              flex: 1,
            }}
          />
          {content}
        </View>
      </Modal>
    );
  },
);

HouseholdSwitcher.displayName = 'HouseholdSwitcher';

// ---- AccessChangedPanel ----

interface AccessChangedPanelProps {
  householdName?: string;
  hasOtherHouseholds: boolean;
  onChooseOther: () => void;
  onCreateNew: () => void;
}

export const AccessChangedPanel = ({
  householdName,
  hasOtherHouseholds,
  onChooseOther,
  onCreateNew,
}: AccessChangedPanelProps) => (
  <View
    accessibilityLiveRegion="assertive"
    accessibilityRole="alert"
    style={{
      backgroundColor: theme.colors.destructiveSoft,
      borderColor: theme.colors.destructive,
      borderRadius: theme.borderRadii.lg,
      borderWidth: theme.borderWidths.default,
      padding: theme.spacing[6],
    }}
  >
    <Stack gap={4}>
      <AlertTriangle color={theme.colors.destructive} size={theme.spacing[6]} strokeWidth={theme.controlSizes.iconStroke} />
      <Heading>家庭访问权已变化</Heading>
      <Text>
        {householdName !== undefined
          ? `你已不能继续访问「${householdName}」。请选择其他家庭继续。`
          : '你的家庭访问权已发生变化。请选择其他家庭继续。'}
      </Text>
      {hasOtherHouseholds ? (
        <Button label="选择其他家庭" onPress={onChooseOther} />
      ) : (
        <Button label="设置家庭" onPress={onCreateNew} />
      )}
    </Stack>
  </View>
);

// ---- SwitchErrorBanner ----

interface SwitchErrorBannerProps {
  householdName: string;
  onRetry: () => void;
}

export const SwitchErrorBanner = ({ householdName, onRetry }: SwitchErrorBannerProps) => (
  <View
    accessibilityLiveRegion="polite"
    style={{
      backgroundColor: theme.colors.surfaceMuted,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadii.md,
      borderWidth: theme.borderWidths.default,
      padding: theme.spacing[4],
    }}
  >
    <Stack gap={2}>
      <Text variant="bodySm">
        暂时无法切换家庭。当前仍在「{householdName}」。
      </Text>
      <Button label="重试" onPress={onRetry} />
    </Stack>
  </View>
);
