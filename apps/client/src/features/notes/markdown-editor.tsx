import { readTextSelection } from '../../platform/text-selection/text-selection';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import BookOpen from 'lucide-react-native/icons/book-open';
import Pencil from 'lucide-react-native/icons/pencil';
import Bold from 'lucide-react-native/icons/bold';
import Heading from 'lucide-react-native/icons/heading';
import Link from 'lucide-react-native/icons/link';
import Table from 'lucide-react-native/icons/table';
import { Button, IconButton, Stack, Text, TextField } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';
import { NoteEditorChromeContext } from './note-editor-chrome';
import { MarkdownBody } from './markdown-body';
import { headingLevel, insertLink, insertTable, safeLink, setHeading, toggleBold, type MarkdownEdit, type Selection } from './markdown';

export function MarkdownEditor({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled: boolean }) {
  const theme = useTheme<Theme>();
  const input = useRef<TextInput>(null);
  const selection = useRef<Selection>({ start: 0, end: 0 });
  const [cursor, setCursor] = useState<Selection | undefined>();
  const [preview, setPreview] = useState(false);
  const [panel, setPanel] = useState<'heading' | 'link' | 'table' | null>(null);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [columns, setColumns] = useState('2');
  const [rows, setRows] = useState('2');
  const [error, setError] = useState('');
  const setChrome = useContext(NoteEditorChromeContext);
  if (!setChrome) throw new Error('MarkdownEditor requires a NoteWindow.');
  const restore = useCallback((next = selection.current) => {
    selection.current = next;
    setCursor({ ...next });
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  const apply = useCallback((edit: MarkdownEdit) => { onChange(edit.value); setPanel(null); setError(''); restore(edit.selection); }, [onChange, restore]);
  const closePanel = useCallback(() => { setPanel(null); setError(''); restore(); }, [restore]);
  const chrome = useMemo(() => ({
    step: panel ? {
      title: panel === 'heading' ? '标题格式' : panel === 'link' ? '插入链接' : '插入表格',
      onClose: closePanel,
      onReturn: restore,
      content: <Stack gap={3}>
        {panel === 'heading' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
          {Array.from({ length: 7 }, (_, level) => <Button key={level} label={level ? `H${level}` : '正文'} aria-pressed={headingLevel(value, selection.current) === level} tone={headingLevel(value, selection.current) === level ? 'primary' : 'secondary'} disabled={disabled} onPress={() => apply(setHeading(value, selection.current, level))} />)}
        </View> : panel === 'link' ? <>
          <TextField autoFocus label="显示文字" value={label} onChangeText={setLabel} disabled={disabled} />
          <TextField label="网址" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" disabled={disabled} />
          <Button label="插入链接" disabled={disabled} onPress={() => {
            const target = url.trim();
            if (!safeLink(target) || /[\s\u0000-\u001f]/.test(target)) { setError('请输入完整的 http、https 或 mailto 网址。'); return; }
            apply(insertLink(value, selection.current, label, target));
          }} />
        </> : <>
          <TextField autoFocus label="列数（1–6）" value={columns} onChangeText={setColumns} keyboardType="number-pad" disabled={disabled} />
          <TextField label="数据行数（1–20）" value={rows} onChangeText={setRows} keyboardType="number-pad" disabled={disabled} />
          <Button label="插入表格" disabled={disabled} onPress={() => {
            const cols = Number(columns), count = Number(rows);
            if (!Number.isInteger(cols) || cols < 1 || cols > 6 || !Number.isInteger(count) || count < 1 || count > 20) { setError('请填写 1–6 列、1–20 行。'); return; }
            apply(insertTable(value, selection.current, cols, count));
          }} />
        </>}
        {error ? <Text accessibilityRole="alert" color="destructive">{error}</Text> : null}
      </Stack>,
    } : null,
    footer: preview ? null : <View accessibilityRole="toolbar" accessibilityLabel="笔记格式" style={{ flexDirection: 'row', justifyContent: 'space-around', gap: theme.spacing[1] }}>
      <IconButton label="标题格式" disabled={disabled} icon={<Heading size={theme.controlSizes.icon} color={theme.colors.ink} />} onPress={() => { setError(''); setPanel('heading'); }} />
      <IconButton label="粗体" disabled={disabled} icon={<Bold size={theme.controlSizes.icon} color={theme.colors.ink} />} onPress={() => apply(toggleBold(value, selection.current))} />
      <IconButton label="链接" disabled={disabled} icon={<Link size={theme.controlSizes.icon} color={theme.colors.ink} />} onPress={() => { setLabel(value.slice(selection.current.start, selection.current.end)); setUrl(''); setError(''); setPanel('link'); }} />
      <IconButton label="表格" disabled={disabled} icon={<Table size={theme.controlSizes.icon} color={theme.colors.ink} />} onPress={() => { setError(''); setPanel('table'); }} />
    </View>,
    headerActions: <IconButton
      label={preview ? '编辑' : '预览'}
      accessibilityHint={preview ? '返回笔记编辑' : '预览 Markdown 排版'}
      disabled={disabled}
      icon={preview ? <Pencil size={theme.controlSizes.icon} color={theme.colors.ink} /> : <BookOpen size={theme.controlSizes.icon} color={theme.colors.ink} />}
      onPress={() => { setPreview(!preview); if (preview) restore(); }}
    />,
  }), [preview, panel, value, disabled, label, url, columns, rows, error, theme, apply, closePanel, restore]);
  useEffect(() => { setChrome(chrome); }, [setChrome, chrome]);
  useEffect(() => () => setChrome(null), [setChrome]);
  return <Stack gap={2}>
    {preview ? <MarkdownBody source={value} /> : <TextInput
      ref={input} value={value} editable={!disabled} multiline accessibilityLabel="笔记内容"
      placeholder="写下笔记，或使用下方按钮添加格式…" placeholderTextColor={theme.colors.inkMuted}
      selection={cursor}
      onSelectionChange={event => { selection.current = event.nativeEvent.selection; setCursor(undefined); }}
      onBlur={() => { selection.current = readTextSelection(input.current) ?? selection.current; }}
      onChangeText={onChange}
      style={{ minHeight: theme.controlSizes.field * 4, color: theme.colors.ink, backgroundColor: theme.colors.surface, borderWidth: theme.borderWidths.default, borderColor: theme.colors.border, borderRadius: theme.borderRadii.md, padding: theme.spacing[3], fontFamily: theme.fontFamilies.regular, fontSize: theme.typography.body.fontSize, lineHeight: theme.typography.body.lineHeight, textAlignVertical: 'top' }}
    />}
  </Stack>;
}
