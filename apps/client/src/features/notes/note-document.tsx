import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import type { LabelResponseDto, NoteResponseDto } from '@muchakucha/api-client';
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
import Pin from 'lucide-react-native/icons/pin';
import Share2 from 'lucide-react-native/icons/share-2';
import Tag from 'lucide-react-native/icons/tag';
import { useTranslation } from '../../i18n';
import { exportMarkdown, markdownExportKind } from '../../platform/clipboard/markdown-export';
import { useSoftKeyboardShown } from '../../platform/keyboard/soft-keyboard';
import { AnchoredPopover } from '../../ui/anchored-popover';
import { CardActionsMenu, type CardAction } from '../../ui/card-actions-menu';
import { formatDateTime } from '../../ui/date-values';
import { DraftNotice } from '../../ui/draft-notice';
import { summarizeLatest } from '../../ui/edit-conflict';
import { HouseholdContextNote } from '../../ui/household-components';
import { Banner, Button, IconButton, Inline, LoadError, LoadingState, Stack, Text, TextField } from '../../ui/primitives';
import { type RouteWindowProps, type RouteWindowStep } from '../../ui/route-window';
import { theme } from '../../ui/theme';
import { useDesktop, useDesktopDensity } from '../../ui/use-desktop';
import { useWorkspaceStore } from '../../ui/workspace-state';
import { contentDeleteConfirmation, useContentDeletion } from '../content/content-deletion';
import { useCanDeleteContent } from '../content/use-content-delete';
import { LabelChip } from '../labels/label-chip';
import { labelName } from '../labels/label-name';
import { LabelPicker } from '../labels/label-picker';
import { householdLabelsCacheKey, readCachedHouseholdLabels } from '../labels/use-household-labels';
import { HouseholdTargetField } from '../overview/household-target-field';
import { PickerActions } from '../../ui/picker-panels';
import { safeLink } from './markdown';
import { saveNoteLabels, saveNotePin, subscribeNoteMarks, type NoteMarks } from './note-marks';
import NoteEditor, { type NoteEditorChange, type NoteEditorColors, type NoteEditorFormat, type NoteEditorHandle, type NoteEditorLabels, type NoteEditorMetrics } from './note-editor-dom';
import { NoteWindow } from './note-window';
import { useNoteAutosave, type NoteSaveStatus } from './use-note-autosave';

const NO_FORMAT: NoteEditorFormat = { taskList: false, bulletList: false, orderedList: false, heading: 0, bold: false, link: false, inTitle: false, selection: '' };
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const EDITOR_START_TIMEOUT_MS = 10_000;

/**
 * On a phone Expo sends every prop of a DOM component into its WebView on each
 * render, the note's whole first body included. The page re-renders as it saves,
 * so the editor renders only when one of its own props changes.
 */
const Editor = memo(NoteEditor);
const EDITOR_DOM = { style: { flex: 1 }, hideKeyboardAccessoryView: true } as const;

interface NoteWindowChrome {
  busy: boolean;
  headerActions: ReactNode;
  headerNote?: string | undefined;
  footer?: ReactNode | undefined;
  step: RouteWindowStep | null;
  centeredConfirmation?: RouteWindowProps['centeredConfirmation'] | undefined;
}

const EMPTY_CHROME: NoteWindowChrome = { busy: false, headerActions: null, step: null };

interface NoteDocumentProps {
  /** Changes only when opening a different note, never when a new note takes its saved id. */
  documentKey?: string;
  householdId: string;
  /** `new` until the first save. */
  noteId: string;
  note: NoteResponseDto | null;
  loading?: boolean;
  error?: 'auth:errors.sessionExpired' | 'loadError' | 'notFound' | null;
  onRetry?(): void;
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
 * reading. The editor is a DOM component; this component owns the single
 * NoteWindow so loading, errors and note switches never unmount the modal.
 */
export function NoteDocument({ documentKey, householdId, noteId, note, loading = false, error = null, onRetry, members, chooseHousehold, householdName, onCreated, onClose }: NoteDocumentProps) {
  const { t } = useTranslation(['notes', 'auth']);
  const waiting = loading || error !== null;
  const exitAllowed = useRef(false);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [chrome, setChrome] = useState<NoteWindowChrome>(EMPTY_CHROME);
  const handleChrome = useCallback((next: NoteWindowChrome) => { setChrome(next); }, []);
  const bodyKey = documentKey ?? `${householdId}:${noteId}`;

  return (
    <NoteWindow
      title={t('document')}
      fillContent={error === null}
      busy={!waiting && chrome.busy}
      exitAllowed={exitAllowed}
      onClose={() => { void flushRef.current(); onClose(); }}
      headerActions={waiting ? null : chrome.headerActions}
      {...(!waiting && chrome.headerNote ? { headerNote: chrome.headerNote } : {})}
      {...(!waiting && chrome.footer ? { footer: chrome.footer } : {})}
      step={waiting ? null : chrome.step}
      centeredConfirmation={waiting ? undefined : chrome.centeredConfirmation}
    >
      {waiting ? (
        <Stack gap={3}>
          {loading ? <LoadingState label={t('loading')} /> : <LoadError message={t(error ?? 'notFound')} onRetry={() => onRetry?.()} />}
        </Stack>
      ) : (
        <NoteDocumentBody
          key={bodyKey}
          householdId={householdId}
          noteId={noteId}
          note={note}
          members={members}
          chooseHousehold={chooseHousehold}
          householdName={householdName}
          exitAllowed={exitAllowed}
          flushRef={flushRef}
          onChrome={handleChrome}
          onCreated={onCreated}
          onClose={onClose}
        />
      )}
    </NoteWindow>
  );
}

interface NoteDocumentBodyProps {
  householdId: string;
  noteId: string;
  note: NoteResponseDto | null;
  members: ReadonlyMap<string, string> | null;
  chooseHousehold: boolean;
  householdName: string;
  exitAllowed: MutableRefObject<boolean>;
  flushRef: MutableRefObject<() => Promise<void>>;
  onChrome(chrome: NoteWindowChrome): void;
  onCreated(note: NoteResponseDto): void;
  onClose(): void;
}

function NoteDocumentBody({ householdId, noteId, note, members, chooseHousehold, householdName, exitAllowed, flushRef, onChrome, onCreated, onClose }: NoteDocumentBodyProps) {
  const { t, i18n } = useTranslation(['notes', 'auth', 'deleteContent', 'common']);
  const desktop = useDesktop();
  const dense = useDesktopDensity();
  const workspace = useWorkspaceStore();
  const editor = useRef<NoteEditorHandle>(null);
  const ready = useRef(false);
  const alive = useRef(true);
  // On native the editor runs in a WebView, which is blank until TipTap finishes booting.
  // Keep the loading indicator over the document until onReady arrives so title and chrome appear together.
  const [editorReady, setEditorReady] = useState(Platform.OS === 'web');
  const [editorTimedOut, setEditorTimedOut] = useState(false);
  const [editorAttempt, setEditorAttempt] = useState(0);
  const currentEditorAttempt = useRef(editorAttempt);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (editorReady) return undefined;
    const timer = setTimeout(() => setEditorTimedOut(true), EDITOR_START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [editorReady, editorAttempt]);
  const retryEditor = () => {
    if (ready.current) return;
    setEditorTimedOut(false);
    setEditorAttempt(++currentEditorAttempt.current);
  };
  // The WebView may be gone after leaving the page; never call into it then.
  const command = useCallback((run: (handle: NoteEditorHandle) => void) => {
    if (alive.current && ready.current && editor.current) run(editor.current);
  }, []);

  const autosave = useNoteAutosave({
    householdId, noteId, note, onCreated,
    onReplace: content => command(handle => handle.load(content.body, content.title)),
  });
  const { change, flush, composing } = autosave;
  flushRef.current = flush;
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
  const marking = useNoteMarking(latest);
  const [picking, setPicking] = useState<'button' | 'row' | null>(null);
  const labelsButton = useRef<View>(null);
  const labelsRow = useRef<View>(null);
  const canDelete = useCanDeleteContent();
  const deletion = useContentDeletion('notes', householdId, latest?.id, () => { exitAllowed.current = true; onClose(); });

  // The editor's callbacks stay the same functions, so it is never sent new props while typing.
  const onReady = useCallback(async () => {
    if (!alive.current || currentEditorAttempt.current !== editorAttempt) return;
    ready.current = true;
    setEditorReady(true);
  }, [editorAttempt]);
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
  const marks = marking.marks;
  const pinned = marks !== null && marks.pinnedAt !== null;
  const hasMarks = marks !== null;
  const canDeleteLatest = Boolean(latest && canDelete(latest));
  const openLabels = useCallback((from: 'button' | 'row') => {
    // The choice covers the note on a phone; the keyboard goes with it.
    if (!desktop) { command(handle => handle.blur()); Keyboard.dismiss(); }
    setPicking(from);
  }, [desktop, command]);
  const closeLabels = useCallback(() => setPicking(null), []);
  const rememberLabels = useCallback((loaded: LabelResponseDto[]) => {
    workspace.set(householdLabelsCacheKey(householdId), loaded);
  }, [workspace, householdId]);
  const cachedLabels = useMemo(
    () => readCachedHouseholdLabels(workspace.get(householdLabelsCacheKey(householdId))),
    // Re-read when opening the picker so labels updated elsewhere are picked up at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace, householdId, picking],
  );

  // Keep latest handlers in a ref so the window chrome only updates when visible state changes.
  const handlers = useRef({ openDelete, exportNote, setPinned: marking.setPinned, setLabels: marking.setLabels, command, t });
  handlers.current = { openDelete, exportNote, setPinned: marking.setPinned, setLabels: marking.setLabels, command, t };

  const saveState = useMemo(() => <NoteSaveState status={autosave.status} />, [autosave.status]);
  const pickingOpen = picking !== null;
  const header = useMemo(() => {
    const actions: CardAction[] = [
      ...(canDeleteLatest ? [{ kind: 'delete' as const, accessibilityLabel: handlers.current.t('deleteCard', { title }), onPress: (trigger: View | null) => void handlers.current.openDelete(trigger) }] : []),
      { label: handlers.current.t(markdownExportKind === 'copy' ? 'menu.copy' : 'menu.share'), icon: markdownExportKind === 'copy' ? Copy : Share2, accessibilityLabel: handlers.current.t(markdownExportKind === 'copy' ? 'menu.copy' : 'menu.share'), onPress: () => void handlers.current.exportNote() },
    ];
    return <Inline gap={1}>
      {/* A phone's header keeps its width for the window's name and buttons; the state follows the byline there. */}
      {desktop ? saveState : null}
      {/* A note not saved yet has nothing to pin or label: these come with its first save. */}
      {hasMarks ? <>
        <HeaderButton label={handlers.current.t(pinned ? 'unpin' : 'pin')} filled={pinned} disabled={marking.busy} icon={Pin} onPress={() => void handlers.current.setPinned(!pinned)} />
        <HeaderButton ref={labelsButton} label={handlers.current.t('labels')} expanded={pickingOpen} icon={Tag} onPress={() => openLabels('button')} />
      </> : null}
      <CardActionsMenu subject={handlers.current.t('card', { title })} actions={actions} />
    </Inline>;
  }, [desktop, saveState, hasMarks, pinned, marking.busy, pickingOpen, openLabels, canDeleteLatest, title, i18n.language]);

  const selectedLabelKey = marks ? marks.labels.map(label => label.id).join(',') : '';
  const labelChoice = useMemo(() => pickingOpen && latest && hasMarks ? <NoteLabelChoice
    householdId={householdId}
    initialLabels={cachedLabels}
    selected={selectedLabelKey ? selectedLabelKey.split(',') : []}
    busy={marking.busy}
    onCancel={closeLabels}
    onLabelsLoaded={rememberLabels}
    onDone={(ids, known) => { setPicking(null); void handlers.current.setLabels(ids, known); }}
  /> : null, [pickingOpen, latest?.id, hasMarks, householdId, cachedLabels, selectedLabelKey, marking.busy, closeLabels, rememberLabels]);

  const showToolbar = !desktop && focused && keyboard && insert === null;
  const toolbar = useMemo(() => showToolbar ? <NoteToolbar format={format}
    onCommand={key => {
      if (key === 'link') { setInsert({ kind: 'link', label: format.selection }); return; }
      if (key === 'dismiss') { handlers.current.command(handle => handle.blur()); Keyboard.dismiss(); return; }
      handlers.current.command(handle => {
        if (key === 'taskList') handle.toggleTaskList();
        else if (key === 'bulletList') handle.toggleBulletList();
        else if (key === 'heading') handle.setHeading(format.heading === 2 ? 0 : 2);
        else handle.toggleBold();
      });
    }} /> : undefined, [showToolbar, format]);

  // 新建标签 inside it is a step of its own, back to this one when it closes.
  const step = useMemo<RouteWindowStep | null>(() => {
    if (labelChoice && !desktop) return { title: handlers.current.t('labels'), onClose: closeLabels, content: labelChoice, hostsStep: true };
    if (!insert) return null;
    return {
      title: insert.kind === 'link' ? handlers.current.t('format.insertLink') : handlers.current.t('format.insertTable'),
      onClose: () => setInsert(null),
      onReturn: () => handlers.current.command(handle => handle.focus('')),
      content: <InsertStep kind={insert.kind} label={insert.label}
        onLink={(href, label) => { setInsert(null); handlers.current.command(handle => handle.setLink(href, label)); }}
        onTable={(columns, rows) => { setInsert(null); handlers.current.command(handle => handle.insertTable(columns, rows, Array.from({ length: columns }, (_, index) => handlers.current.t('format.column', { number: index + 1 })))); }} />,
    };
  }, [labelChoice, desktop, closeLabels, insert, i18n.language]);

  const deletionConfirmation = useMemo(
    () => contentDeleteConfirmation('notes', deletion, t('deleteContent:title.notes')),
    // Recompute only when the confirmation dialog's own visible state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletion.target, deletion.submitting, deletion.error, t],
  );

  const chrome = useMemo<NoteWindowChrome>(() => ({
    busy: deletion.submitting !== null,
    headerActions: editorReady ? header : null,
    headerNote: editorReady && desktop && byline ? byline : undefined,
    footer: editorReady ? toolbar : undefined,
    step,
    centeredConfirmation: deletionConfirmation,
  }), [deletion.submitting, editorReady, header, desktop, byline, toolbar, step, deletionConfirmation]);

  useLayoutEffect(() => {
    onChrome(chrome);
  }, [onChrome, chrome]);
  useLayoutEffect(() => () => {
    onChrome(EMPTY_CHROME);
    flushRef.current = () => Promise.resolve();
  }, [onChrome, flushRef]);

  const conflict = autosave.conflict;
  // On a wide pane the notes above the document line up with its reading column.
  const column = desktop ? { width: '100%', maxWidth: theme.layout.readingWidth, alignSelf: 'center' } satisfies ViewStyle : undefined;
  const quiet = [column, { paddingHorizontal: metrics.gutter }];
  // On a phone the label row keeps its 48px touch target while offsetting the excess vertical padding
  // so the chips stay visually close to the byline above and the document title below.
  const labelRow = marks && marks.labels.length > 0
    ? <NoteLabelRow ref={labelsRow} labels={marks.labels} expanded={pickingOpen} onPress={() => openLabels('row')}
      style={desktop ? column : { paddingHorizontal: metrics.gutter, marginTop: -theme.spacing[1], marginBottom: -theme.spacing[3] }} />
    : null;
  const phoneMeta = !desktop && (byline || autosave.status !== 'idle') ? (
    <Inline gap={2} style={{ paddingHorizontal: metrics.gutter }}>
      <Text variant="caption" color="inkMuted" style={{ flex: 1, fontFamily: theme.fontFamilies.numeric }}>{byline}</Text>
      {saveState}
    </Inline>
  ) : null;
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <Stack gap={3} style={{ flex: 1, minHeight: 0 }} pointerEvents={editorReady ? 'auto' : 'none'} accessibilityElementsHidden={!editorReady} importantForAccessibility={editorReady ? 'auto' : 'no-hide-descendants'}>
        {noteId === 'new' ? <View style={column}>{chooseHousehold ? <HouseholdTargetField householdId={householdId} resource="notes" /> : <HouseholdContextNote householdName={householdName} />}</View> : null}
        {/* The title is the editor's first line, so the labels go above it: at the top of the column, or under the byline on a phone. */}
        {desktop ? labelRow : null}
        {!desktop && (phoneMeta || labelRow) ? (
          <Stack gap={1}>
            {phoneMeta}
            {labelRow}
          </Stack>
        ) : null}
        <DraftNotice style={quiet} />
        {marking.failure ? <QuietNotice style={quiet} icon={CircleAlert} text={t(marking.failure)} /> : null}
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
          <Editor
            key={editorAttempt}
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
            dom={EDITOR_DOM}
          />
        </View>
      </Stack>
      {!editorReady ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surface }]}>
          <Stack gap={3}>
            {editorTimedOut ? <LoadError message={t('editorLoadError')} onRetry={retryEditor} /> : <LoadingState label={t('loading')} />}
          </Stack>
        </View>
      ) : null}
      {labelChoice && desktop ? (
        <AnchoredPopover scrollable align={picking === 'button' ? 'end' : 'start'} title={t('labels')} trigger={picking === 'row' ? labelsRow : labelsButton} busy={marking.busy} onClose={closeLabels}>{labelChoice}</AnchoredPopover>
      ) : null}
    </View>
  );
}

/**
 * The note's pin and labels as this page shows them. They save at once and on
 * their own, never through the autosave: the page shows the change straight
 * away, takes the note as saved when it comes back, and puts it back as it
 * was if the save fails. The autosave's conflict base is not touched, since
 * neither changes the note's version.
 */
function useNoteMarking(latest: NoteResponseDto | null) {
  // What this page last chose or saved; until then, what the latest save of the note says.
  const [own, setOwn] = useState<(NoteMarks & { noteId: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'pinFailed' | 'unpinFailed' | 'labelsFailed' | null>(null);
  const noteId = latest?.id ?? null;
  const householdId = latest?.householdId ?? null;
  const marks: NoteMarks | null = latest === null ? null : own?.noteId === latest.id ? own : { pinnedAt: latest.pinnedAt, labels: latest.labels };

  // A pin or labels saved elsewhere on this device, such as from the list's menu.
  useEffect(() => subscribeNoteMarks(note => {
    if (note.id === noteId) setOwn({ noteId: note.id, pinnedAt: note.pinnedAt, labels: note.labels });
  }), [noteId]);

  const save = async (next: NoteMarks, write: (household: string, id: string) => Promise<NoteResponseDto>, failed: NonNullable<typeof failure>) => {
    if (noteId === null || householdId === null || marks === null) return;
    const before = marks;
    setFailure(null);
    setBusy(true);
    setOwn({ noteId, ...next });
    try {
      const saved = await write(householdId, noteId);
      setOwn({ noteId, pinnedAt: saved.pinnedAt, labels: saved.labels });
    } catch {
      setOwn({ noteId, ...before });
      setFailure(failed);
    } finally {
      setBusy(false);
    }
  };

  return {
    marks,
    busy,
    failure,
    setPinned: (pinned: boolean) => marks && save({ ...marks, pinnedAt: pinned ? marks.pinnedAt ?? new Date().toISOString() : null },
      (household, id) => saveNotePin(household, id, pinned), pinned ? 'pinFailed' : 'unpinFailed'),
    /** `known` names the chosen labels, in the household's order, until the saved note does. */
    setLabels: (ids: string[], known: readonly LabelResponseDto[]) => marks && save({ ...marks, labels: known.filter(label => ids.includes(label.id)) },
      (household, id) => saveNoteLabels(household, id, ids), 'labelsFailed'),
  };
}

/** An icon button in the note's header. `filled` inks the icon in, as a pinned note's pin. */
const HeaderButton = forwardRef<View, { label: string; icon: typeof Pin; filled?: boolean; expanded?: boolean; disabled?: boolean; onPress(): void }>(
  function HeaderButton({ label, icon: Icon, filled = false, expanded, disabled = false, onPress }, ref) {
    const dense = useDesktopDensity();
    const size = dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget;
    return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }}
      {...(expanded === undefined ? {} : { 'aria-expanded': expanded, 'aria-haspopup': 'dialog' as const })}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minWidth: size, minHeight: size, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.full, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      {/* Lucide passes an unset fill through as undefined, which an SVG paints black: leave it out instead. */}
      <Icon size={theme.controlSizes.icon - theme.spacing[1] / 2} color={theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} {...(filled ? { fill: theme.colors.ink } : {})} />
    </Pressable>;
  },
);

/** The note's labels above its title; pressing the row opens the label choice too. */
const NoteLabelRow = forwardRef<View, { labels: LabelResponseDto[]; expanded: boolean; style: StyleProp<ViewStyle>; onPress(): void }>(
  function NoteLabelRow({ labels, expanded, style, onPress }, ref) {
    const { t } = useTranslation('notes');
    const dense = useDesktopDensity();
    return <View style={style}>
      <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={t('labelsOf', { names: labels.map(labelName).join('、') })}
        accessibilityState={{ expanded }} aria-expanded={expanded} aria-haspopup="dialog" onPress={onPress}
        // A finger needs the full target; the chips stay small inside it.
        // A wrapping row on native packs its lines at the top unless told otherwise.
        style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', alignContent: 'center', gap: theme.spacing[1], minHeight: dense ? undefined : theme.controlSizes.touchTarget, paddingVertical: theme.spacing[1], opacity: pressed ? 0.7 : 1 })}>
        {labels.map(label => <LabelChip key={label.id} label={label} small />)}
      </Pressable>
    </View>;
  },
);

/** Choosing the note's labels, kept here until 完成, as the task form chooses them. */
function NoteLabelChoice({ householdId, initialLabels, selected: initial, busy, onCancel, onLabelsLoaded, onDone }: {
  householdId: string;
  initialLabels: readonly LabelResponseDto[] | null;
  selected: string[];
  busy: boolean;
  onCancel(): void;
  onLabelsLoaded(labels: LabelResponseDto[]): void;
  onDone(ids: string[], known: LabelResponseDto[]): void;
}) {
  const { t } = useTranslation('common');
  const [selected, setSelected] = useState(initial);
  const [known, setKnown] = useState<LabelResponseDto[] | null>(() => initialLabels ? [...initialLabels] : null);
  const handleLoaded = useCallback((labels: LabelResponseDto[]) => {
    setKnown(labels);
    onLabelsLoaded(labels);
  }, [onLabelsLoaded]);
  return <Stack gap={2}>
    <LabelPicker householdId={householdId} initialLabels={initialLabels} selectedLabelIds={selected} onChange={setSelected} onLabelsLoaded={handleLoaded} />
    <PickerActions onCancel={onCancel} onConfirm={() => { if (known !== null) onDone(selected, known); }} confirmLabel={t('done')} confirmDisabled={known === null} busy={busy} />
  </Stack>;
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
