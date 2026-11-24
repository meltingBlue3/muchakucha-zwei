import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Keyboard, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import type { NoteResponseDto } from '@muchakucha/api-client';
import Bold from 'lucide-react-native/icons/bold';
import Check from 'lucide-react-native/icons/check';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import CloudOff from 'lucide-react-native/icons/cloud-off';
import Copy from 'lucide-react-native/icons/copy';
import Heading from 'lucide-react-native/icons/heading';
import Link from 'lucide-react-native/icons/link';
import List from 'lucide-react-native/icons/list';
import ListTodo from 'lucide-react-native/icons/list-todo';
import Share2 from 'lucide-react-native/icons/share-2';
import { useTranslation } from '../../i18n';
import { exportMarkdown, markdownExportKind } from '../../platform/clipboard/markdown-export';
import { useSoftKeyboardShown } from '../../platform/keyboard/soft-keyboard';
import { CardActionsMenu, type CardAction } from '../../ui/card-actions-menu';
import { formatDateTime } from '../../ui/date-values';
import { DraftNotice } from '../../ui/draft-notice';
import { summarizeLatest } from '../../ui/edit-conflict';
import { HouseholdContextNote } from '../../ui/household-components';
import { Banner, Button, IconButton, Inline, Stack, Text, TextField } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useDesktop, useDesktopDensity } from '../../ui/use-desktop';
import { contentDeleteConfirmation, useContentDeletion } from '../content/content-deletion';
import { useCanDeleteContent } from '../content/use-content-delete';
import { HouseholdTargetField } from '../overview/household-target-field';
import { safeLink } from './markdown';
import NoteEditor, { type NoteEditorChange, type NoteEditorColors, type NoteEditorFormat, type NoteEditorHandle, type NoteEditorLabels, type NoteEditorMetrics } from './note-editor-dom';
import { NoteWindow } from './note-window';
import { useNoteAutosave, type NoteSaveStatus } from './use-note-autosave';

const NO_FORMAT: NoteEditorFormat = { taskList: false, bulletList: false, orderedList: false, heading: 0, bold: false, link: false, inTitle: false, selection: '' };
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface NoteDocumentProps {
  householdId: string;
  /** `new` until the first save. */
  noteId: string;
  note: NoteResponseDto | null;
  /** Display names by user id, or null while the household could not be read. */
  members: ReadonlyMap<string, string> | null;
  /** A new note opened from the 总览, which asks which household it goes to. */
  chooseHousehold: boolean;
  householdName: string;
  onCreated(note: NoteResponseDto): void;
  onClose(): void;
}

/**
 * One note as a page that is read and written in place: the title is the
 * document's first line, changes save themselves, and boxes tick while
 * reading. The editor is a DOM component; this component is its native frame.
 */
export function NoteDocument({ householdId, noteId, note, members, chooseHousehold, householdName, onCreated, onClose }: NoteDocumentProps) {
  const { t, i18n } = useTranslation(['notes', 'auth', 'deleteContent', 'common']);
  const desktop = useDesktop();
  const dense = useDesktopDensity();
  const editor = useRef<NoteEditorHandle>(null);
  const ready = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // The WebView may be gone after leaving the page; never call into it then.
  const command = useCallback((run: (handle: NoteEditorHandle) => void) => {
    if (alive.current && ready.current && editor.current) run(editor.current);
  }, []);

  const autosave = useNoteAutosave({
    householdId, noteId, note, onCreated,
    onReplace: content => command(handle => handle.load(content.body, content.title)),
  });
  const { change, flush, composing } = autosave;
  const latest = autosave.saved;

  const [format, setFormat] = useState<NoteEditorFormat>(NO_FORMAT);
  const [focused, setFocused] = useState(false);
  const keyboard = useSoftKeyboardShown();
  const [insert, setInsert] = useState<{ kind: 'link' | 'table'; label: string } | null>(null);
  const [exported, setExported] = useState<'copied' | 'failed' | null>(null);
  // A copy confirmation is a passing remark.
  useEffect(() => {
    if (exported === null) return undefined;
    const timer = setTimeout(() => setExported(null), theme.motion.noticeMs);
    return () => clearTimeout(timer);
  }, [exported]);
  const [comparing, setComparing] = useState(false);
  const exitAllowed = useRef(false);
  const canDelete = useCanDeleteContent();
  const deletion = useContentDeletion('notes', householdId, latest?.id, () => { exitAllowed.current = true; onClose(); });

  // The editor's callbacks stay the same functions, so it is never sent new props while typing.
  const onReady = useCallback(async () => { ready.current = true; }, []);
  const onChange = useCallback(async (next: NoteEditorChange) => { setExported(null); change(next); }, [change]);
  const onFormat = useCallback(async (next: NoteEditorFormat) => { setFormat(next); }, []);
  const onFocusChange = useCallback(async (next: boolean) => { setFocused(next); }, []);
  const onComposing = useCallback(async (active: boolean) => { composing(active); }, [composing]);
  const onRequest = useCallback(async (kind: 'table' | 'link', selection: string) => { setInsert({ kind, label: selection }); }, []);
  const onSave = useCallback(async () => { void flush(); }, [flush]);

  const colors = useMemo<NoteEditorColors>(() => ({
    ink: theme.colors.ink, inkMuted: theme.colors.inkMuted, inkFaint: theme.colors.inkFaint, border: theme.colors.border,
    outline: theme.colors.outline, separator: theme.colors.separator, surface: theme.colors.surface, surfaceMuted: theme.colors.surfaceMuted,
    surfaceSelected: theme.colors.surfaceSelected, link: theme.colors.link,
  }), []);
  const metrics = useMemo<NoteEditorMetrics>(() => {
    const title = desktop ? theme.typography.readingTitle : theme.typography.heading;
    const body = desktop ? theme.typography.readingBody : theme.typography.body;
    return {
      title: { fontSize: title.fontSize, lineHeight: title.lineHeight, fontWeight: title.fontWeight },
      body: { fontSize: body.fontSize, lineHeight: body.lineHeight },
      heading: { fontSize: theme.typography.heading.fontSize, lineHeight: theme.typography.heading.lineHeight },
      section: { fontSize: theme.typography.section.fontSize, lineHeight: theme.typography.section.lineHeight },
      small: { fontSize: theme.typography.bodySm.fontSize, lineHeight: theme.typography.bodySm.lineHeight },
      space: [theme.spacing[0], theme.spacing[1], theme.spacing[2], theme.spacing[3], theme.spacing[4], theme.spacing[6], theme.spacing[12]],
      // The wide pane already pads its content; on a phone the text lines up with the window title.
      gutter: desktop ? theme.spacing[0] : theme.spacing[2],
      readingWidth: desktop ? theme.layout.readingWidth : 0,
      radius: theme.borderRadii.sm, menuRadius: theme.borderRadii.md, line: theme.borderWidths.default, thick: theme.borderWidths.focus,
      box: theme.controlSizes.checkbox, boxRadius: theme.borderRadii.sm / 2,
      touchTarget: dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget,
      menuWidth: theme.layout.slashMenuWidth, menuLayer: theme.layout.popoverLayer, shadow: theme.shadow.raised,
      fontFamily: theme.fontFamilies.regular, monoFamily: MONO,
    };
  }, [desktop, dense]);
  const labels = useMemo<NoteEditorLabels>(() => ({
    titlePlaceholder: t('titlePlaceholder'),
    body: t('format.body'),
    bodyPlaceholder: t('bodyPlaceholder'),
    // The editor fills in each item's text itself.
    checked: t('format.checkedItem', { text: '{{text}}' }),
    unchecked: t('format.uncheckedItem', { text: '{{text}}' }),
    emptyItem: t('format.emptyItem'),
    menu: t('format.insert'),
    menuEmpty: t('format.insertEmpty'),
    commands: {
      taskList: t('format.commands.taskList'), bulletList: t('format.commands.bulletList'), orderedList: t('format.commands.orderedList'),
      heading: t('format.commands.heading'), blockquote: t('format.commands.blockquote'), horizontalRule: t('format.commands.horizontalRule'),
      table: t('format.commands.table'), codeBlock: t('format.commands.codeBlock'), link: t('format.commands.link'),
    },
    // The language is part of the key: labels change only when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [t, i18n.language]);

  const name = (userId: string | null | undefined) => (userId ? members?.get(userId) : undefined) ?? t('formerMember');
  const time = latest ? formatDateTime(new Date(latest.updatedAt)) : '';
  const byline = !latest ? null : !members ? t('updated', { date: time })
    : latest.updatedBy === latest.createdBy ? t('bylineByAuthor', { author: name(latest.createdBy), time })
      : t('byline', { author: name(latest.createdBy), editor: name(latest.updatedBy), time });

  const title = latest?.title ?? t('document');
  const openDelete = async (trigger: View | null) => {
    await flush();
    const current = autosave.latest();
    if (!current) return;
    (deletion.trigger as MutableRefObject<View | null>).current = trigger;
    deletion.open(current);
  };
  const exportNote = async () => {
    const content = autosave.current();
    const heading = content.title.trim() || latest?.title || '';
    const result = await exportMarkdown([heading ? `# ${heading}` : '', content.body].filter(Boolean).join('\n\n'));
    setExported(result === 'failed' ? 'failed' : markdownExportKind === 'copy' ? 'copied' : null);
  };
  const actions: CardAction[] = [
    ...(latest && canDelete(latest) ? [{ kind: 'delete' as const, accessibilityLabel: t('deleteCard', { title }), onPress: (trigger: View | null) => void openDelete(trigger) }] : []),
    { label: t(markdownExportKind === 'copy' ? 'menu.copy' : 'menu.share'), icon: markdownExportKind === 'copy' ? Copy : Share2, accessibilityLabel: t(markdownExportKind === 'copy' ? 'menu.copy' : 'menu.share'), onPress: () => void exportNote() },
  ];
  const header = <Inline gap={1}>
    <NoteSaveState status={autosave.status} />
    <CardActionsMenu subject={t('card', { title })} actions={actions} />
  </Inline>;

  const showToolbar = !desktop && focused && keyboard && insert === null;
  const toolbar = showToolbar ? <NoteToolbar format={format}
    onCommand={key => {
      if (key === 'link') { setInsert({ kind: 'link', label: format.selection }); return; }
      if (key === 'dismiss') { command(handle => handle.blur()); Keyboard.dismiss(); return; }
      command(handle => {
        if (key === 'taskList') handle.toggleTaskList();
        else if (key === 'bulletList') handle.toggleBulletList();
        else if (key === 'heading') handle.setHeading(format.heading === 2 ? 0 : 2);
        else handle.toggleBold();
      });
    }} /> : undefined;

  const step = insert ? {
    title: insert.kind === 'link' ? t('format.insertLink') : t('format.insertTable'),
    onClose: () => setInsert(null),
    onReturn: () => command(handle => handle.focus('')),
    content: <InsertStep kind={insert.kind} label={insert.label}
      onLink={(href, label) => { setInsert(null); command(handle => handle.setLink(href, label)); }}
      onTable={(columns, rows) => { setInsert(null); command(handle => handle.insertTable(columns, rows, Array.from({ length: columns }, (_, index) => t('format.column', { number: index + 1 })))); }} />,
  } : null;

  const conflict = autosave.conflict;
  // On a wide pane the notes above the document line up with its reading column.
  const column: ViewStyle | undefined = desktop ? { width: '100%', maxWidth: theme.layout.readingWidth, alignSelf: 'center' } : undefined;
  const quiet = [column, { paddingHorizontal: metrics.gutter }];
  return (
    <NoteWindow
      title={t('document')}
      fillContent
      busy={deletion.submitting !== null}
      exitAllowed={exitAllowed}
      onClose={() => { void flush(); onClose(); }}
      headerActions={header}
      {...(desktop && byline ? { headerNote: byline } : {})}
      {...(toolbar ? { footer: toolbar } : {})}
      step={step}
      centeredConfirmation={contentDeleteConfirmation('notes', deletion, t('deleteContent:title.notes'))}
    >
      <Stack gap={3} style={{ flex: 1, minHeight: 0 }}>
        {noteId === 'new' ? <View style={column}>{chooseHousehold ? <HouseholdTargetField householdId={householdId} resource="notes" /> : <HouseholdContextNote householdName={householdName} />}</View> : null}
        {!desktop && byline ? <Text variant="caption" color="inkMuted" style={{ paddingHorizontal: metrics.gutter, fontFamily: theme.fontFamilies.numeric }}>{byline}</Text> : null}
        <DraftNotice style={quiet} />
        {autosave.status === 'offline' || autosave.status === 'failed' ? <QuietNotice style={quiet} icon={CloudOff} text={t(autosave.status === 'offline' ? 'offline' : 'saveFailed')} /> : null}
        {exported ? <QuietNotice style={quiet} icon={exported === 'copied' ? Check : CircleAlert} text={t(exported === 'copied' ? 'menu.copied' : 'menu.exportFailed')} /> : null}
        {autosave.status === 'sessionExpired' ? <View style={column}><Banner>{t('auth:errors.sessionExpired')}</Banner></View> : null}
        {autosave.status === 'deleted' ? <View style={column}><Banner action={<Button label={t('saveAsNew')} tone="secondary" size="compact" onPress={() => void autosave.saveAsNew()} />}>{t('deleted')}</Banner></View> : null}
        {conflict ? <View accessibilityRole="alert" style={[column, { gap: theme.spacing[3], padding: theme.spacing[4], borderRadius: theme.borderRadii.lg, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, backgroundColor: theme.colors.surfaceSubtle }]}>
          <Text variant="bodySm" color="ink">{t('conflict.message', { name: conflict.latest?.updatedBy ? name(conflict.latest.updatedBy) : t('conflict.someone') })}</Text>
          <Inline gap={2} style={{ flexWrap: 'wrap' }}>
            {conflict.latest ? <Button label={t(comparing ? 'conflict.hide' : 'conflict.compare')} tone="secondary" size="compact" expanded={comparing} onPress={() => setComparing(!comparing)} /> : null}
            <Button label={t('conflict.keepMine')} size="compact" onPress={() => { setComparing(false); conflict.keepMine(); }} />
          </Inline>
          {comparing && conflict.latest ? <Stack gap={2}>
            {summarizeLatest(conflict.latest).map(([label, value]) => <Text key={label} variant="bodySm">{t('common:fieldValue', { label, value })}</Text>)}
            <View style={{ alignSelf: 'flex-start' }}><Button label={t('conflict.takeLatest')} accessibilityHint={t('conflict.takeLatestHint')} tone="secondary" size="compact" onPress={() => { setComparing(false); conflict.takeLatest(); }} /></View>
          </Stack> : null}
        </View> : null}
        <View style={{ flex: 1, minHeight: 0 }}>
          <NoteEditor
            ref={editor}
            initialTitle={autosave.initial.title}
            initialBody={autosave.initial.body}
            colors={colors}
            metrics={metrics}
            labels={labels}
            onReady={onReady}
            onChange={onChange}
            onFormat={onFormat}
            onFocusChange={onFocusChange}
            onComposing={onComposing}
            onRequest={onRequest}
            onSave={onSave}
            dom={{ style: { flex: 1 }, hideKeyboardAccessoryView: true }}
          />
        </View>
      </Stack>
    </NoteWindow>
  );
}

/** Saved, saving or not saved: words and a small mark, never in vermilion. */
function NoteSaveState({ status }: { status: NoteSaveStatus }) {
  const { t } = useTranslation('notes');
  if (status === 'idle') return null;
  const label = status === 'saved' ? t('status.saved') : status === 'saving' ? t('status.saving') : t('status.unsaved');
  const Icon = status === 'saved' ? Check : status === 'offline' || status === 'failed' ? CloudOff : null;
  return <Inline gap={1} testID="note-save-state">
    {Icon ? <Icon size={theme.controlSizes.icon - theme.spacing[1]} color={theme.colors.inkFaint} strokeWidth={theme.controlSizes.iconStroke} /> : null}
    <Text variant="meta" color="inkFaint" numberOfLines={1}>{label}</Text>
  </Inline>;
}

function QuietNotice({ icon: Icon, text, style }: { icon: typeof CloudOff; text: string; style: StyleProp<ViewStyle> }) {
  return <Inline gap={2} accessibilityLiveRegion="polite" style={[{ alignItems: 'flex-start' }, style]}>
    <Icon size={theme.controlSizes.icon - theme.spacing[1]} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
    <Text variant="bodySm" color="inkMuted" style={{ flex: 1 }}>{text}</Text>
  </Inline>;
}

type ToolbarKey = 'taskList' | 'bulletList' | 'heading' | 'bold' | 'link' | 'dismiss';

/** Above the keyboard on a phone: the formats a family note uses most, and a way to put the keyboard away. */
function NoteToolbar({ format, onCommand }: { format: NoteEditorFormat; onCommand(key: ToolbarKey): void }) {
  const { t } = useTranslation('notes');
  // On a phone's sheet the bar takes the footer's side padding back, so six tools fit at 320 points.
  const sheet = useWindowDimensions().width < theme.layout.editorSheetBreakpoint;
  const tool = (key: Exclude<ToolbarKey, 'dismiss'>, label: string, Icon: typeof Bold, pressed: boolean) => (
    <IconButton key={key} appearance="plain" label={label} aria-pressed={pressed} accessibilityState={{ selected: pressed, disabled: format.inTitle }} disabled={format.inTitle}
      icon={<Icon size={theme.controlSizes.icon} color={format.inTitle ? theme.colors.inkFaint : theme.colors.ink} strokeWidth={pressed ? theme.focus.width : theme.controlSizes.iconStroke} />}
      style={pressed ? { backgroundColor: theme.colors.surfaceSelected } : undefined}
      onPress={() => onCommand(key)} />
  );
  // Its id lets the Web editor keep focus while these are pressed.
  return <View nativeID="note-toolbar" accessibilityRole="toolbar" accessibilityLabel={t('format.toolbar')} style={{ flexDirection: 'row', alignItems: 'center', ...(sheet ? { marginHorizontal: -theme.spacing[3] } : { gap: theme.spacing[1] }) }}>
    {tool('taskList', t('format.checklist'), ListTodo, format.taskList)}
    {tool('bulletList', t('format.bulletList'), List, format.bulletList)}
    {tool('heading', t('format.heading'), Heading, format.heading === 2)}
    {tool('bold', t('format.bold'), Bold, format.bold)}
    {tool('link', t('format.link'), Link, format.link)}
    <View style={{ flex: 1 }} />
    <IconButton appearance="plain" label={t('format.dismiss')} icon={<ChevronDown size={theme.controlSizes.icon} color={theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} />} onPress={() => onCommand('dismiss')} />
  </View>;
}

/** 链接 and 表格: a step in the window, as the old Markdown editor had. */
function InsertStep({ kind, label: initialLabel, onLink, onTable }: { kind: 'link' | 'table'; label: string; onLink(href: string, label: string): void; onTable(columns: number, rows: number): void }) {
  const { t } = useTranslation('notes');
  const [label, setLabel] = useState(initialLabel);
  const [url, setUrl] = useState('');
  const [columns, setColumns] = useState('2');
  const [rows, setRows] = useState('2');
  const [error, setError] = useState<'format.invalidUrl' | 'format.invalidSize' | null>(null);
  return <Stack gap={3}>
    {kind === 'link' ? <>
      <TextField autoFocus label={t('format.linkText')} value={label} onChangeText={setLabel} />
      <TextField label={t('format.url')} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Button label={t('format.insertLink')} onPress={() => {
        const target = url.trim();
        if (!safeLink(target) || /[\s\u0000-\u001f]/.test(target)) { setError('format.invalidUrl'); return; }
        onLink(target, label.replace(/\s+/g, ' ').trim());
      }} />
    </> : <>
      <TextField autoFocus label={t('format.columns')} value={columns} onChangeText={setColumns} keyboardType="number-pad" />
      <TextField label={t('format.rows')} value={rows} onChangeText={setRows} keyboardType="number-pad" />
      <Button label={t('format.insertTable')} onPress={() => {
        const cols = Number(columns), count = Number(rows);
        if (!Number.isInteger(cols) || cols < 1 || cols > 6 || !Number.isInteger(count) || count < 1 || count > 20) { setError('format.invalidSize'); return; }
        onTable(cols, count);
      }} />
    </>}
    {error ? <Text accessibilityRole="alert" color="destructive">{t(error)}</Text> : null}
  </Stack>;
}
