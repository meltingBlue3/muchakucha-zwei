import { useTranslation } from '../../i18n';
import Mail from 'lucide-react-native/icons/mail';
import { useDesktop } from '../../ui/use-desktop';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { insetFocusRing } from '../../platform/focus-ring/focus-ring';
import { AppDialog } from '../../ui/app-dialog';
import { Banner, Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { formatDate } from '../../ui/date-values';

export interface InboxAction {
  id: string;
  label: string;
  accessibilityLabel: string;
  primary?: boolean;
  run(): Promise<void>;
}

// The list and detail shell know nothing about invitations. Each notification
// source supplies its summary, metadata and optional actions.
export interface InboxMessage {
  id: string;
  category: string;
  summary: string;
  createdAt: string;
  details: Array<{ label: string; value: string }>;
  actions: InboxAction[];
}
export interface InboxListProps {
  messages: InboxMessage[];
  loading: boolean;
  busy: boolean;
  error?: string | undefined;
  notice?: string | undefined;
  reload(): Promise<void>;
}

export function InboxList({ messages, loading, busy, error, notice, reload }: InboxListProps) {
  const { t } = useTranslation('inbox');
  const desktop = useDesktop();
  const [selectedId, setSelectedId] = useState<string>();
  const trigger = useRef<View>(null);
  const container = useRef<View>(null);
  const rowTriggers = useRef(new Map<string, View>());
  const selected = messages.find(message => message.id === selectedId);
  const run = (action: InboxAction) => {
    // The message can disappear after processing; return focus to the list.
    trigger.current = container.current;
    void action.run();
  };
  // In a row: compact pills, the primary answer filled and the other outlined.
  // A desktop row reads like the window: the secondary answer first, the primary last.
  const actions = (message: InboxMessage) => (desktop ? [...message.actions].sort((a, b) => Number(Boolean(a.primary)) - Number(Boolean(b.primary))) : message.actions).map(action => (
    <Button key={action.id} label={action.label} accessibilityLabel={action.accessibilityLabel} tone={action.primary ? 'primary' : 'secondary'} size="compact" disabled={busy || loading} onPress={() => run(action)} />
  ));
  // In the message window: the app's standard buttons, secondary first.
  const windowActions = (message: InboxMessage) => [...message.actions].sort((a, b) => Number(Boolean(a.primary)) - Number(Boolean(b.primary))).map(action => (
    <Button key={action.id} label={action.label} accessibilityLabel={action.accessibilityLabel} tone={action.primary ? 'primary' : 'secondary'} disabled={busy || loading} onPress={() => run(action)} style={{ flexGrow: 1, flexBasis: theme.controlSizes.touchTarget * 3 }} />
  ));
  return <View ref={container} tabIndex={-1} accessibilityLabel={t('messageList')}>
    <Stack gap={3}>
      {notice ? <View accessibilityLiveRegion="polite"><Text variant="bodySm">{notice}</Text></View> : null}
      {error ? <LoadError message={error} disabled={busy || loading} onRetry={() => { void reload(); }} /> : null}
      {loading && messages.length === 0 ? <LoadingState label={t('loading')} /> : null}
      {!loading && !error && messages.length === 0 ? <EmptyState title={t('emptyTitle')} message={t('emptyDetail')} /> : null}
      {messages.length > 0 ? <View style={{ backgroundColor: theme.colors.surface, borderRadius: desktop ? theme.borderRadii.md : theme.borderRadii.lg, overflow: 'hidden', ...(desktop ? { borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator } : {}) }}>
        {messages.map((message, index) => {
          const date = formatDate(new Date(message.createdAt));
          return <View key={message.id} testID={`inbox-row-${message.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1], borderBottomWidth: index < messages.length - 1 ? theme.borderWidths.default : 0, borderBottomColor: theme.colors.separator, paddingHorizontal: theme.spacing[2], ...(desktop ? { paddingLeft: theme.spacing[4], paddingRight: theme.spacing[3] } : {}) }}>
            {desktop ? <View style={{ width: theme.controlSizes.avatar + 8, height: theme.controlSizes.avatar + 8, borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}><Mail size={theme.controlSizes.icon - 4} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} /></View> : null}
            <Pressable {...insetFocusRing} ref={node => { if (node) rowTriggers.current.set(message.id, node); else rowTriggers.current.delete(message.id); }} accessibilityRole="button" accessibilityLabel={t('openMessage', { summary: message.summary })} accessibilityHint={t('openHint')}
              disabled={busy} onPress={() => { trigger.current = rowTriggers.current.get(message.id) ?? null; setSelectedId(message.id); }}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[2], paddingVertical: theme.spacing[4], backgroundColor: pressed ? theme.colors.surfaceSubtle : theme.colors.transparent })}>
              <Text variant="bodySm" color="ink" numberOfLines={2}>{message.summary}</Text>
              <Text variant="caption" style={{ marginTop: theme.spacing[1] }}>{desktop ? t('receivedAt', { date }) : date}</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', flexShrink: 0, gap: theme.spacing[2], paddingRight: theme.spacing[1] }}>{actions(message)}</View>
          </View>;
        })}
      </View> : null}
    </Stack>
    {selected ? <AppDialog title={t('details')} busy={busy} trigger={trigger} onClose={() => setSelectedId(undefined)}>
      <Stack gap={4}>
        <Text variant="caption">{selected.category}</Text>
        <Text variant="section">{selected.summary}</Text>
        {selected.details.map(detail => <Stack gap={1} key={detail.label}><Text variant="caption">{detail.label}</Text><Text>{detail.value}</Text></Stack>)}
        {error ? <Banner>{error}</Banner> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] }}>{windowActions(selected)}</View>
      </Stack>
    </AppDialog> : null}
  </View>;
}
