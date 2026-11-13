import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType, type RefObject } from 'react';
import { Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import type { EventResponseDto, NoteResponseDto, TaskResponseDto } from '@muchakucha/api-client';
import Search from 'lucide-react-native/icons/search';
import Bell from 'lucide-react-native/icons/bell';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Inbox from 'lucide-react-native/icons/inbox';
import NotebookText from 'lucide-react-native/icons/notebook-text';
import UserRound from 'lucide-react-native/icons/user-round';

import { useTranslation } from '../../i18n';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { toDateIso } from '../events/calendar-utils';
import { formatDueDate } from '../tasks/task-utils';
import { useOverlayFocus } from '../../platform/overlays/overlay-focus';
import { holdsCommandKey, useCommandKeyLabel } from '../../ui/command-key';
import { formatDate, formatDateTime } from '../../ui/date-values';
import { DialogBackdrop } from '../../ui/dialog-backdrop';
import { destinations, familyPages, householdPath } from '../../ui/household-navigation';
import { Spinner, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useWorkspaceState } from '../../ui/workspace-state';

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

interface Hit {
  id: string;
  group: string;
  title: string;
  detail?: string | undefined;
  icon: Icon;
  open(): void;
}

interface Content {
  tasks: TaskResponseDto[];
  events: EventResponseDto[];
  notes: NoteResponseDto[];
}

/** Results per kind; the rest are reached by a longer query or from the page's own list. */
const GROUP_LIMIT = 5;

const accountPages: ReadonlyArray<{ path: '/profile' | '/reminders' | '/inbox'; label: string; icon: Icon }> = [
  { path: '/profile', label: '个人资料', icon: UserRound },
  { path: '/reminders', label: '提醒', icon: Bell },
  { path: '/inbox', label: '收件箱', icon: Inbox },
];

const normalize = (text: string) => text.normalize('NFKC').toLowerCase();

/** 2 when the title holds the query, 1 when only another field does, 0 otherwise. */
function score(query: string, title: string, ...rest: Array<string | null | undefined>): number {
  if (normalize(title).includes(query)) return 2;
  return rest.some(field => field && normalize(field).includes(query)) ? 1 : 0;
}

/** Best matches first, keeping each kind's own order among equals. */
function ranked<T>(items: T[], rate: (item: T) => number): T[] {
  return items.map((item, index) => ({ item, index, rank: rate(item) }))
    .filter(entry => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .slice(0, GROUP_LIMIT)
    .map(entry => entry.item);
}

/** A key name drawn as a small key, such as `Ctrl K` beside the search entry. */
export function Keycap({ children }: { children: string }) {
  return (
    <View accessible={false} style={{ borderWidth: theme.borderWidths.default, borderColor: theme.colors.outline, borderRadius: theme.spacing[1], paddingHorizontal: theme.spacing[1] + 1, backgroundColor: theme.colors.surface }}>
      <Text variant="caption" color="inkMuted" style={{ fontFamily: theme.fontFamilies.numeric, fontWeight: '400', fontSize: theme.typography.tag.fontSize - 0.5, lineHeight: theme.spacing[4] }}>{children}</Text>
    </View>
  );
}

/**
 * The sidebar's way into search: a quiet field with its shortcut, or a search
 * icon when the sidebar is a rail.
 */
export function SearchEntry({ rail, trigger, onPress }: { rail: boolean; trigger: RefObject<View | null>; onPress(): void }) {
  const commandKey = useCommandKeyLabel();
  return (
    <Pressable
      ref={trigger}
      accessibilityRole="button"
      accessibilityLabel="搜索"
      {...{ 'aria-keyshortcuts': 'Control+K Meta+K' }}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: theme.spacing[2], height: theme.layout.desktopControl, paddingHorizontal: rail ? 0 : theme.spacing[2] + 2, borderRadius: theme.borderRadii.sm, backgroundColor: pressed || hovered ? theme.colors.surfaceSelected : theme.colors.surfaceMuted })}
    >
      <Search size={theme.controlSizes.icon - 6} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
      {rail ? null : <>
        <Text variant="meta" color="inkMuted" style={{ flex: 1 }}>搜索</Text>
        <Keycap>{`${commandKey} K`}</Keycap>
      </>}
    </Pressable>
  );
}

/**
 * Ctrl+K (⌘K on a Mac) toggles search while this page has focus, also from
 * inside a text field: React Native Web's fields stop key events from
 * bubbling, so the key is caught while capturing.
 */
export function useSearchShortcut(enabled: boolean, toggle: () => void) {
  const latest = useRef(toggle);
  latest.current = toggle;
  useFocusEffect(useCallback(() => {
    if (!enabled || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !holdsCommandKey(event) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      latest.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]));
}

/**
 * Search across the household: its pages and the titles and text of its
 * tasks, events and notes. Arrow keys move through the results, Enter opens
 * one in its own page, Esc closes.
 */
export function CommandPalette({ householdId, trigger, onClose }: { householdId: string; trigger: RefObject<View | null>; onClose(): void }) {
  const router = useRouter();
  const { t } = useTranslation('navigation');
  const pathname = usePathname();
  const panel = useRef<View>(null);
  const input = useRef<TextInput>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [content, setContent] = useState<Content | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const today = useMemo(() => new Date(), []);
  const [, setCalendarYear] = useWorkspaceState(`view:${householdId}:events:year`, today.getFullYear());
  const [, setCalendarMonth] = useWorkspaceState(`view:${householdId}:events:month`, today.getMonth());
  const [, setCalendarDate] = useWorkspaceState<string | null>(`view:${householdId}:events:selectedDateIso`, toDateIso(today));
  const focus = useOverlayFocus({ mode: 'dialog', panel, initial: input as unknown as RefObject<View | null>, trigger, onClose });

  useEffect(() => {
    let live = true;
    setFailed(false);
    void (async () => {
      try {
        const token = await sessionTransport.getAccessToken();
        if (!token) throw new Error('Session expired');
        const [tasks, events, notes] = await Promise.all([
          sessionApiClient.listTasks(token, householdId),
          sessionApiClient.listEvents(token, householdId),
          sessionApiClient.listNotes(token, householdId),
        ]);
        if (live) setContent({ tasks: tasks.tasks, events: events.events, notes: notes.notes });
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; };
  }, [householdId, attempt]);

  const go = useCallback((navigate: () => void) => { onClose(); navigate(); }, [onClose]);
  /**
   * Opens an item beside its section's list. From that list it opens as from a
   * row; from elsewhere it replaces the page, and the item's window then draws
   * its own list behind it, as a link to the item would.
   */
  const openItem = useCallback((section: 'tasks' | 'events' | 'notes', itemId: string) => go(() => {
    const detail = householdPath(householdId, `${section}/${encodeURIComponent(itemId)}`);
    if (pathname === detail) return;
    if (pathname === householdPath(householdId, section)) router.push(detail);
    else router.replace(detail);
  }), [go, householdId, pathname, router]);

  const hits = useMemo((): Hit[] => {
    const q = normalize(query.trim());
    const pages: Hit[] = [
      ...destinations.map(({ key, icon }) => ({ id: `page:${key}`, group: '页面', title: t(`pages.${key}`), icon, open: () => go(() => { if (pathname !== householdPath(householdId, key)) router.replace(householdPath(householdId, key)); }) })),
      ...familyPages.map(({ key, icon }) => ({ id: `page:${key}`, group: '页面', title: t(`pages.${key}`), icon, open: () => go(() => { if (pathname !== householdPath(householdId, key)) router.push(householdPath(householdId, key)); }) })),
      ...accountPages.map(({ path, label, icon }) => ({ id: `page:${path}`, group: '页面', title: label, icon, open: () => go(() => { if (pathname !== path) router.push(path); }) })),
    ];
    if (!q) return pages;
    const matchedPages = pages.filter(page => normalize(page.title).includes(q));
    if (!content) return matchedPages;
    const now = Date.now();
    const tasks = ranked(content.tasks, task => score(q, task.title, task.description)).map((task): Hit => ({
      id: `task:${task.id}`, group: '任务', title: task.title, icon: CircleCheck,
      detail: task.status === 'completed' ? '已完成' : formatDueDate(task.dueDate ?? null) || undefined,
      open: () => openItem('tasks', task.id),
    }));
    // The nearest events in time come first: what is coming up, then what just happened.
    const events = ranked([...content.events].sort((a, b) => Math.abs(Date.parse(a.startTime) - now) - Math.abs(Date.parse(b.startTime) - now)), event => score(q, event.title, event.location, event.description)).map((event): Hit => ({
      id: `event:${event.id}`, group: '日程', title: event.title, icon: CalendarDays,
      detail: event.allDay ? formatDate(new Date(event.startTime)) : formatDateTime(new Date(event.startTime)),
      open: () => {
        const start = new Date(event.startTime);
        setCalendarYear(start.getFullYear());
        setCalendarMonth(start.getMonth());
        setCalendarDate(toDateIso(start));
        openItem('events', event.id);
      },
    }));
    const notes = ranked(content.notes, note => score(q, note.title, note.body)).map((note): Hit => ({
      id: `note:${note.id}`, group: '笔记', title: note.title || '无标题笔记', icon: NotebookText,
      detail: `更新于 ${formatDate(new Date(note.updatedAt))}`,
      open: () => openItem('notes', note.id),
    }));
    return [...matchedPages, ...tasks, ...events, ...notes];
  }, [query, content, householdId, pathname, router, go, openItem, setCalendarYear, setCalendarMonth, setCalendarDate, t]);

  useEffect(() => { setActive(0); }, [query]);
  const current = Math.min(active, Math.max(0, hits.length - 1));
  const optionId = (index: number) => `${listId}-option-${index}`;
  const move = (step: number) => { if (hits.length) setActive((current + step + hits.length) % hits.length); };
  const loading = !content && !failed && query.trim() !== '';

  return (
    <Modal {...(Platform.OS === 'web' ? { 'aria-label': '搜索' } : {})} transparent visible animationType="none" onShow={focus} onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <DialogBackdrop onPress={onClose} blur={false} testID="command-palette" />
        <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', paddingTop: '12%', paddingHorizontal: theme.spacing[5] }}>
          <View ref={panel} testID="command-palette-panel" style={{ width: '100%', maxWidth: theme.layout.commandPaletteWidth, maxHeight: '70%', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, boxShadow: theme.shadow.raised, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] + 2, height: theme.spacing[12], paddingHorizontal: theme.spacing[4], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator }}>
              <Search size={theme.controlSizes.icon - 2} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
              <TextInput
                ref={input}
                accessibilityLabel="搜索页面、任务、日程和笔记"
                role="combobox"
                aria-expanded
                {...{ 'aria-controls': listId, ...(hits.length ? { 'aria-activedescendant': optionId(current) } : {}) }}
                placeholder="搜索页面、任务、日程和笔记"
                placeholderTextColor={theme.colors.inkFaint}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onKeyPress={event => {
                  const key = event.nativeEvent.key;
                  if (key === 'ArrowDown' || key === 'ArrowUp') { event.preventDefault(); move(key === 'ArrowDown' ? 1 : -1); }
                }}
                onSubmitEditing={() => hits[current]?.open()}
                style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', color: theme.colors.ink, fontFamily: theme.fontFamilies.regular, fontSize: theme.typography.readingBody.fontSize, outlineStyle: 'none' } as never}
              />
              <Keycap>Esc</Keycap>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ padding: theme.spacing[2] }}>
              <View nativeID={listId} {...({ role: 'listbox' } as object)} aria-label="搜索结果">
                {hits.map((hit, index) => {
                  const Glyph = hit.icon;
                  const selected = index === current;
                  const first = index === 0 || hits[index - 1]!.group !== hit.group;
                  return (
                    <View key={hit.id}>
                      {first ? <Text variant="caption" color="inkFaint" aria-hidden style={{ fontWeight: '400', paddingHorizontal: theme.spacing[2] + 2, paddingTop: index === 0 ? theme.spacing[1] : theme.spacing[3], paddingBottom: theme.spacing[1] }}>{hit.group}</Text> : null}
                      <Pressable
                        nativeID={optionId(index)}
                        role="option"
                        aria-selected={selected}
                        accessibilityLabel={`${hit.group}：${hit.title}${hit.detail ? `，${hit.detail}` : ''}`}
                        tabIndex={-1}
                        onHoverIn={() => setActive(index)}
                        onPress={hit.open}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] + 2, minHeight: theme.layout.desktopRowHeight - 4, paddingHorizontal: theme.spacing[2] + 2, borderRadius: theme.borderRadii.sm, backgroundColor: selected ? theme.colors.surfaceMuted : theme.colors.transparent }}
                      >
                        <Glyph size={theme.controlSizes.icon - 6} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
                        <Text variant="bodySm" numberOfLines={1} style={{ flex: 1 }}>{hit.title}</Text>
                        {hit.detail ? <Text variant="meta" color={selected ? 'inkMuted' : 'inkFaint'} numberOfLines={1} style={{ fontFamily: theme.fontFamilies.numeric }}>{hit.detail}</Text> : null}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              {loading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], padding: theme.spacing[3] }}><Spinner label="正在搜索" /><Text variant="meta">正在载入任务、日程和笔记…</Text></View> : null}
              {failed && query.trim() ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], padding: theme.spacing[3] }}>
                <Text variant="meta" color="destructive" accessibilityRole="alert" style={{ flexShrink: 1 }}>任务、日程和笔记没有载入，只能搜索页面。</Text>
                <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)}><Text variant="meta" color="link" style={{ textDecorationLine: 'underline' }}>重试</Text></Pressable>
              </View> : null}
              {!loading && !hits.length ? <Text variant="meta" accessibilityRole="alert" style={{ padding: theme.spacing[3] }}>{`没有找到「${query.trim()}」`}</Text> : null}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: theme.spacing[4], paddingHorizontal: theme.spacing[4], paddingVertical: theme.spacing[2], borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, backgroundColor: theme.colors.surfaceSubtle }}>
              <Text variant="caption" color="inkFaint" style={{ fontWeight: '400' }}>↑↓ 选择</Text>
              <Text variant="caption" color="inkFaint" style={{ fontWeight: '400' }}>Enter 打开</Text>
              <Text variant="caption" color="inkFaint" style={{ fontWeight: '400' }}>Esc 关闭</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
