import { useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { NoteEditorChromeContext, type NoteEditorChrome } from '../note-editor-chrome';
import type { NoteResponseDto } from '@muchakucha/api-client';
import { fireEvent, render } from '@testing-library/react-native';

import { Button, MuchakuchaThemeProvider } from '../../../ui/primitives';
import { NoteForm } from '../note-form';

const existingNote: NoteResponseDto = {
  id: 'note-1',
  householdId: 'household-1',
  title: '暑假计划',
  body: '游泳课',
  createdBy: 'user-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// Unit host exposes the same editor slots; browser tests exercise AppDialog.
function EditorHost({ children }: PropsWithChildren) {
  const [chrome, setChrome] = useState<NoteEditorChrome | null>(null);
  return <NoteEditorChromeContext.Provider value={setChrome}>
    {!chrome?.step ? chrome?.headerActions : null}
    <View style={chrome?.step ? { display: 'none' } : undefined}>{children}</View>
    {chrome?.step ? <><Button label={`关闭${chrome.step.title}`} onPress={chrome.step.onClose} />{chrome.step.content}</> : chrome?.footer}
  </NoteEditorChromeContext.Provider>;
}

async function renderForm(initial?: NoteResponseDto) {
  const onSubmit = jest.fn(async () => undefined);
  const view = await render(
    <MuchakuchaThemeProvider>
      <EditorHost><NoteForm
        {...(initial === undefined ? {} : { initial })}
        isSubmitting={false}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
        submitLabel="保存"
      /></EditorHost>
    </MuchakuchaThemeProvider>,
  );
  return { onSubmit, view };
}

describe('note form payload', () => {
  test('requires a title before submitting', async () => {
    const { onSubmit, view } = await renderForm();

    await fireEvent.changeText(view.getByLabelText('笔记标题'), '   ');
    await fireEvent.press(view.getByLabelText('保存'));

    expect(view.getByText('请输入笔记标题。')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('omits a blank body when creating', async () => {
    const { onSubmit, view } = await renderForm();

    await fireEvent.changeText(view.getByLabelText('笔记标题'), ' 购物清单 ');
    await fireEvent.changeText(view.getByLabelText('笔记内容'), '   ');
    await fireEvent.press(view.getByLabelText('保存'));

    expect(onSubmit).toHaveBeenCalledWith({ title: '购物清单' });
  });

  test('sends an empty body when an edit clears it', async () => {
    const { onSubmit, view } = await renderForm(existingNote);

    await fireEvent.changeText(view.getByLabelText('笔记内容'), '');
    await fireEvent.press(view.getByLabelText('保存'));

    expect(onSubmit).toHaveBeenCalledWith({ title: '暑假计划', body: '' });
  });
});

test('format actions and preview preserve draft content and submit original whitespace', async () => {
  const { onSubmit, view } = await renderForm(existingNote);
  const source = '    开头\n\n日语  \n';
  await fireEvent.changeText(view.getByLabelText('笔记内容'), source);
  await fireEvent(view.getByLabelText('笔记内容'), 'selectionChange', { nativeEvent: { selection: { start: 8, end: 10 } } });
  await fireEvent.press(view.getByLabelText('粗体'));
  const formatted = view.getByLabelText('笔记内容').props.value;
  expect(formatted).toContain('**');
  await fireEvent.press(view.getByLabelText('预览'));
  expect(view.getByTestId('markdown-body')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('编辑', { exact: true }));
  expect(view.getByLabelText('笔记内容').props.value).toBe(formatted);
  await fireEvent.press(view.getByLabelText('保存'));
  expect(onSubmit).toHaveBeenCalledWith({ title: existingNote.title, body: formatted });
});

test('canceling a link keeps the source and inserting it replaces the captured selection', async () => {
  const { view } = await renderForm(existingNote);
  const input = view.getByLabelText('笔记内容');
  await fireEvent(input, 'selectionChange', { nativeEvent: { selection: { start: 0, end: 3 } } });
  await fireEvent.press(view.getByLabelText('链接', { exact: true }));
  expect(view.getByLabelText('显示文字').props.value).toBe('游泳课');
  await fireEvent.press(view.getByLabelText('关闭插入链接'));
  expect(view.getByLabelText('笔记内容').props.value).toBe('游泳课');
  await fireEvent.press(view.getByLabelText('链接', { exact: true }));
  await fireEvent.changeText(view.getByLabelText('网址'), 'javascript:alert(1)');
  await fireEvent.press(view.getByLabelText('插入链接'));
  expect(view.getByRole('alert')).toBeTruthy();
  expect(view.getByLabelText('笔记内容', { includeHiddenElements: true }).props.value).toBe('游泳课');
  await fireEvent.changeText(view.getByLabelText('网址'), 'https://example.com');
  await fireEvent.press(view.getByLabelText('插入链接'));
  expect(view.getByLabelText('笔记内容').props.value).toBe('[游泳课](<https://example.com>)');
});

test('table dimensions reject invalid values and create the requested grid', async () => {
  const { view } = await renderForm(existingNote);
  await fireEvent.press(view.getByLabelText('表格', { exact: true }));
  await fireEvent.changeText(view.getByLabelText('列数（1–6）'), '0');
  await fireEvent.press(view.getByLabelText('插入表格'));
  expect(view.getByLabelText('笔记内容', { includeHiddenElements: true }).props.value).toBe(existingNote.body);
  await fireEvent.changeText(view.getByLabelText('列数（1–6）'), '3');
  await fireEvent.changeText(view.getByLabelText('数据行数（1–20）'), '4');
  await fireEvent.press(view.getByLabelText('插入表格'));
  await fireEvent.press(view.getByLabelText('预览'));
  expect(view.getAllByRole('columnheader')).toHaveLength(3);
  expect(view.getAllByRole('cell')).toHaveLength(12);
});
