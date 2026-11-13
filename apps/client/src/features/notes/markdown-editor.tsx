import { useTranslation } from '../../i18n';
import { readTextSelection } from '../../platform/text-selection/text-selection';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import BookOpen from 'lucide-react-native/icons/book-open';
import Pencil from 'lucide-react-native/icons/pencil';
import Bold from 'lucide-react-native/icons/bold';
import Heading from 'lucide-react-native/icons/heading';
import Link from 'lucide-react-native/icons/link';
import Table from 'lucide-react-native/icons/table';
import { Button, IconButton, Stack, Text, TextField } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';
import { NoteEditorChromeContext, noteEditorViewport } from './note-editor-chrome';
import { MarkdownBody } from './markdown-body';
import { useDesktop } from '../../ui/use-desktop';
import { insetFocusRing } from '../../platform/focus-ring/focus-ring';
import { headingLevel, insertLink, insertTable, safeLink, setHeading, toggleBold, type MarkdownEdit, type Selection } from './markdown';

export function MarkdownEditor({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled: boolean }) {
  const { t } = useTranslation(['notes', 'common']);
  const theme = useTheme<Theme>();
  const desktop = useDesktop();
  const input = useRef<TextInput>(null);
  const selection = useRef<Selection>({ start: 0, end: 0 });
  const [cursor, setCursor] = useState<Selection | undefined>(() => Platform.OS === 'android' ? selection.current : undefined);
  const [preview, setPreview] = useState(false);
  const [panel, setPanel] = useState<'heading' | 'link' | 'table' | null>(null);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [columns, setColumns] = useState('2');
  const [rows, setRows] = useState('2');
  const [error, setError] = useState<'format.invalidUrl' | 'format.invalidSize' | null>(null);
  const setChrome = useContext(NoteEditorChromeContext);
  if (!setChrome) throw new Error('MarkdownEditor requires a NoteWindow.');
  const restore = useCallback((next = selection.current) => {
    selection.current = next;
    setCursor({ ...next });
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  const apply = useCallback((edit: MarkdownEdit) => { onChange(edit.value); setPanel(null); setError(null); restore(edit.selection); }, [onChange, restore]);
  const closePanel = useCallback(() => { setPanel(null); setError(null); restore(); }, [restore]);
  // On a wide screen the toolbar reads as a row of plain tools, like the board's editor header.
  const toolbarAppearance = desktop ? { appearance: 'plain' as const } : {};
  const chrome = useMemo(() => ({
    step: panel ? {
      title: panel === 'heading' ? t('format.heading') : panel === 'link' ? t('format.insertLink') : t('format.insertTable'),
      onClose: closePanel,
      onReturn: restore,
      content: <Stack gap={3}>
        {panel === 'heading' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
          {Array.from({ length: 7 }, (_, level) => <Button key={level} label={level ? `H${level}` : t('format.paragraph')} aria-pressed={headingLevel(value, selection.current) === level} tone={headingLevel(value, selection.current) === level ? 'primary' : 'secondary'} disabled={disabled} onPress={() => apply(setHeading(value, selection.current, level))} />)}
        </View> : panel === 'link' ? <>
          <TextField autoFocus label={t('format.linkText')} value={label} onChangeText={setLabel} disabled={disabled} />
          <TextField label={t('format.url')} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" disabled={disabled} />
          <Button label={t('format.insertLink')} disabled={disabled} onPress={() => {
            const target = url.trim();
            if (!safeLink(target) || /[\s\u0000-\u001f]/.test(target)) { setError('format.invalidUrl'); return; }
            apply(insertLink(value, selection.current, label, target));
          }} />
        </> : <>
          <TextField autoFocus label={t('format.columns')} value={columns} onChangeText={setColumns} keyboardType="number-pad" disabled={disabled} />
          <TextField label={t('format.rows')} value={rows} onChangeText={setRows} keyboardType="number-pad" disabled={disabled} />
          <Button label={t('format.insertTable')} disabled={disabled} onPress={() => {
            const cols = Number(columns), count = Number(rows);
            if (!Number.isInteger(cols) || cols < 1 || cols > 6 || !Number.isInteger(count) || count < 1 || count > 20) { setError('format.invalidSize'); return; }
            apply(insertTable(value, selection.current, cols, count));
          }} />
        </>}
        {error ? <Text accessibilityRole="alert" color="destructive">{t(error)}</Text> : null}
      </Stack>,
    } : null,
    // A phone spreads the buttons across the keyboard bar for thumbs; a wide screen keeps them together at the start of the text column.
    footer: preview ? null : <View accessibilityRole="toolbar" accessibilityLabel={t('format.toolbar')} style={{ flexDirection: 'row', justifyContent: desktop ? 'flex-start' : 'space-around', gap: theme.spacing[1] }}>
      <IconButton {...toolbarAppearance} label={t('format.heading')} disabled={disabled} icon={<Heading size={theme.controlSizes.icon} color={theme.colors.ink} />} onPress={() => { setError(null); setPanel('heading'); }} />
      <IconButton {...toolbarAppearance} label={t('format.bold')} disabled={disabled} icon={<Bold size={theme.controlSizes.icon} color={theme.colors.ink} />} onPress={() => apply(toggleBold(value, selection.current))} />
      <IconButton {...toolbarAppearance} label={t('format.link')} disabled={disabled} icon={<Link size={theme.controlSizes.icon} color={theme.colors.ink} />} onPress={() => { setLabel(value.slice(selection.current.start, selection.current.end)); setUrl(''); setError(null); setPanel('link'); }} />
      <IconButton {...toolbarAppearance} label={t('format.table')} disabled={disabled} icon={<Table size={theme.controlSizes.icon} color={theme.colors.ink} />} onPress={() => { setError(null); setPanel('table'); }} />
    </View>,
    headerActions: <IconButton
      appearance="plain"
      label={preview ? t('common:edit') : t('format.preview')}
      accessibilityHint={preview ? t('format.editHint') : t('format.previewHint')}
      disabled={disabled}
      icon={preview ? <Pencil size={theme.controlSizes.icon} color={theme.colors.ink} /> : <BookOpen size={theme.controlSizes.icon} color={theme.colors.ink} />}
      onPress={() => { setPreview(!preview); if (preview) restore(); }}
    />,
  }), [preview, panel, value, disabled, label, url, columns, rows, error, theme, desktop, apply, closePanel, restore, t]);
  useEffect(() => { setChrome(chrome); }, [setChrome, chrome]);
  useEffect(() => () => setChrome(null), [setChrome]);
  return <Stack gap={2} style={noteEditorViewport}>
    {preview ? <ScrollView {...insetFocusRing} tabIndex={0} style={noteEditorViewport}><MarkdownBody source={value} /></ScrollView> : <TextInput
      ref={input} value={value} editable={!disabled} multiline accessibilityLabel={t('format.body')}
      placeholder={t('format.placeholder')} placeholderTextColor={theme.colors.inkMuted}
      selection={cursor}
      onSelectionChange={event => { selection.current = event.nativeEvent.selection; setCursor(undefined); }}
      onBlur={() => { selection.current = readTextSelection(input.current) ?? selection.current; }}
      onChangeText={onChange}
      style={[noteEditorViewport, {
        color: theme.colors.ink,
        paddingVertical: theme.spacing[3],
        paddingHorizontal: theme.spacing[2],
        fontFamily: theme.fontFamilies.regular,
        fontSize: desktop ? theme.typography.readingBody.fontSize : theme.typography.body.fontSize,
        lineHeight: desktop ? theme.typography.readingBody.lineHeight : theme.typography.body.lineHeight,
        textAlignVertical: 'top',
      }, Platform.OS === 'web' ? {
        outlineStyle: 'solid',
        outlineWidth: 0,
      } : undefined]}
    />}
  </Stack>;
}
