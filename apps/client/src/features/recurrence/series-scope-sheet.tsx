import { useTheme } from '@shopify/restyle';
import { useCallback, useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Heading, Spinner, Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

export type SeriesScope = 'this_only' | 'this_and_following';
export type SeriesScopeMode = 'edit' | 'delete' | 'rule-change';

export interface SeriesScopeSheetProps {
  error?: string | null;
  mode: SeriesScopeMode;
  onClose(): void;
  onSelect(scope: SeriesScope): void;
  submitting?: SeriesScope | null;
  visible: boolean;
}

const MODE_COPY: Record<SeriesScopeMode, { body: string; title: string }> = {
  edit: {
    body: '这是一个重复安排。选择这次改动的影响范围。',
    title: '保存这次改动？',
  },
  delete: {
    body: '这是一个重复安排。选择要删除的范围，此操作不可撤销。',
    title: '删除这次重复？',
  },
  'rule-change': {
    body: '重复规则的更改会影响之后的每一次，不能只改这一次。',
    title: '更改重复规则？',
  },
};

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type Focusable = { focus?: () => void };

export const SeriesScopeSheet = ({
  error = null,
  mode,
  onClose,
  onSelect,
  submitting = null,
  visible,
}: SeriesScopeSheetProps) => {
  const activeTheme = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const panelRef = useRef<View>(null);
  const thisOnlyRef = useRef<View>(null);
  const followingRef = useRef<View>(null);
  const cancelRef = useRef<View>(null);
  const returnFocusRef = useRef<Focusable | null>(null);
  const busy = submitting !== null;
  const thisOnlyDisabled = busy || mode === 'rule-change';

  const getDefaultRef = useCallback(
    () =>
      mode === 'delete'
        ? cancelRef
        : mode === 'rule-change'
          ? followingRef
          : thisOnlyRef,
    [mode],
  );

  useEffect(() => {
    if (!visible) return undefined;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      returnFocusRef.current = document.activeElement as Focusable | null;
    }

    const focusTimer = setTimeout(() => {
      (getDefaultRef().current as unknown as Focusable | null)?.focus?.();
    }, activeTheme.motion.reducedTransitionMs);

    return () => {
      clearTimeout(focusTimer);
      if (Platform.OS === 'web') returnFocusRef.current?.focus?.();
    };
  }, [activeTheme.motion.reducedTransitionMs, getDefaultRef, visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current as unknown as HTMLElement | null;
      const focusable = panel === null
        ? []
        : Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose, visible]);

  // React Native Web keeps a closed Modal subtree in the DOM. Unmounting it
  // prevents stale dialog copy from polluting navigation and a11y queries.
  if (!visible) return null;

  const actionStyle = (
    scope: SeriesScope | 'cancel',
    pressed: boolean,
  ) => {
    const disabled = scope === 'this_only' ? thisOnlyDisabled : busy;
    const destructiveFill = mode === 'delete' && scope === 'this_and_following';
    const primaryFill =
      (mode === 'edit' && scope === 'this_only') ||
      (mode === 'rule-change' && scope === 'this_and_following');
    const filled = destructiveFill || primaryFill;
    const destructiveOutline = mode === 'delete' && scope === 'this_only';

    return {
      alignItems: 'center' as const,
      backgroundColor: disabled
        ? activeTheme.colors.disabled
        : destructiveFill
          ? activeTheme.colors.destructive
          : primaryFill
            ? activeTheme.colors.coral
            : activeTheme.colors.surface,
      borderColor: destructiveOutline
        ? activeTheme.colors.destructive
        : filled
          ? activeTheme.colors.transparent
          : activeTheme.colors.border,
      borderRadius: activeTheme.borderRadii.sm,
      borderWidth: activeTheme.borderWidths.default,
      flexDirection: 'row' as const,
      gap: activeTheme.spacing[2],
      justifyContent: 'center' as const,
      minHeight: activeTheme.controlSizes.primary,
      minWidth: activeTheme.controlSizes.touchTarget,
      opacity: pressed ? 0.72 : 1,
      paddingHorizontal: activeTheme.spacing[4],
      width: '100%' as const,
    };
  };

  const actionTextColor = (scope: SeriesScope | 'cancel') => {
    if (scope === 'this_only' && thisOnlyDisabled) return 'surface' as const;
    if (mode === 'delete') {
      return scope === 'this_and_following' ? 'surface' as const :
        scope === 'this_only' ? 'destructive' as const : 'ink' as const;
    }
    if (
      (mode === 'edit' && scope === 'this_only') ||
      (mode === 'rule-change' && scope === 'this_and_following')
    ) {
      return 'surface' as const;
    }
    return 'ink' as const;
  };

  const content = (
    <View
      accessibilityLabel={MODE_COPY[mode].title}
      accessibilityViewIsModal
      aria-modal
      ref={panelRef}
      role={'dialog' as never}
      style={{
        backgroundColor: activeTheme.colors.surface,
        borderRadius: Platform.OS === 'web' ? activeTheme.borderRadii.lg : undefined,
        borderTopLeftRadius: activeTheme.borderRadii.lg,
        borderTopRightRadius: activeTheme.borderRadii.lg,
        maxHeight: '75%',
        maxWidth: Platform.OS === 'web' ? activeTheme.layout.switcherWidth : undefined,
        overflow: 'hidden',
        width:
          Platform.OS === 'web'
            ? (`calc(100% - ${activeTheme.spacing[6] * 2}px)` as never)
            : '100%',
        ...(Platform.OS === 'web'
          ? { boxShadow: activeTheme.elevation.softWeb as string }
          : {}),
      }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: activeTheme.spacing[4],
          paddingBottom: activeTheme.spacing[4] + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack gap={3}>
          {error ? <Banner>{error}</Banner> : null}
          <Heading>{MODE_COPY[mode].title}</Heading>
          <Text variant="bodySm">{MODE_COPY[mode].body}</Text>
          <Text color="inkMuted" variant="caption">
            「此后所有」只影响这一次和之后的重复，已经过去的不受影响。
          </Text>

          <Pressable
            accessibilityLabel="仅此一次"
            accessibilityRole="button"
            accessibilityState={{
              busy: submitting === 'this_only',
              disabled: thisOnlyDisabled,
            }}
            disabled={thisOnlyDisabled}
            onPress={() => onSelect('this_only')}
            ref={thisOnlyRef}
            style={({ pressed }) => actionStyle('this_only', pressed)}
          >
            {submitting === 'this_only' ? <Spinner /> : null}
            <Text color={actionTextColor('this_only')} variant="button">
              仅此一次
            </Text>
          </Pressable>
          {mode === 'rule-change' ? (
            <Text color="inkMuted" variant="caption">
              重复规则的改动只能应用到这一次和之后。
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="此后所有"
            accessibilityRole="button"
            accessibilityState={{
              busy: submitting === 'this_and_following',
              disabled: busy,
            }}
            disabled={busy}
            onPress={() => onSelect('this_and_following')}
            ref={followingRef}
            style={({ pressed }) => actionStyle('this_and_following', pressed)}
          >
            {submitting === 'this_and_following' ? <Spinner /> : null}
            <Text color={actionTextColor('this_and_following')} variant="button">
              此后所有
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="取消"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onClose}
            ref={cancelRef}
            style={({ pressed }) => actionStyle('cancel', pressed)}
          >
            <Text color={actionTextColor('cancel')} variant="button">
              取消
            </Text>
          </Pressable>
        </Stack>
      </ScrollView>
    </View>
  );

  return (
    <Modal
      animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
      onRequestClose={busy ? undefined : onClose}
      transparent
      visible
    >
      <View
        style={{
          alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
          flex: 1,
          justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
        }}
      >
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={busy ? undefined : onClose}
          style={{
            backgroundColor: activeTheme.colors.overlay,
            bottom: activeTheme.spacing[0],
            left: activeTheme.spacing[0],
            position: 'absolute',
            right: activeTheme.spacing[0],
            top: activeTheme.spacing[0],
          }}
        />
        {content}
      </View>
    </Modal>
  );
};
