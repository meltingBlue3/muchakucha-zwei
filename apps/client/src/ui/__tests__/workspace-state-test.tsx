import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { NoteForm } from '../../features/notes/note-form';
import { Button, MuchakuchaThemeProvider } from '../primitives';
import { WorkspaceStateProvider, useWorkspaceStore } from '../workspace-state';

test('note drafts survive leaving the editor, stay household-scoped and clear after save', async () => {
  const save = jest.fn(async () => undefined);
  function Demo() {
    const [household, setHousehold] = useState<string | null>('a');
    const workspace = useWorkspaceStore();
    return <>
      <Button label="打开 A" onPress={() => setHousehold('a')} />
      <Button label="打开 B" onPress={() => setHousehold('b')} />
      {household ? <NoteForm key={household} draftKey={`draft:${household}:note:form`} isSubmitting={false} submitLabel="保存" onCancel={() => setHousehold(null)} onSubmit={async () => { await save(); workspace.clear(`draft:${household}:note:`); setHousehold(null); }} /> : null}
    </>;
  }
  const view = await render(<MuchakuchaThemeProvider><WorkspaceStateProvider><Demo /></WorkspaceStateProvider></MuchakuchaThemeProvider>);
  await fireEvent.changeText(view.getByLabelText('笔记标题'), '未保存的采购单');
  await fireEvent.press(view.getByLabelText('取消'));
  await fireEvent.press(view.getByRole('button', { name: '打开 B' }));
  expect(view.getByLabelText('笔记标题').props.value).toBe('');
  await fireEvent.press(view.getByRole('button', { name: '打开 A' }));
  expect(view.getByLabelText('笔记标题').props.value).toBe('未保存的采购单');
  await fireEvent.press(view.getByLabelText('保存'));
  await fireEvent.press(view.getByRole('button', { name: '打开 A' }));
  expect(view.getByLabelText('笔记标题').props.value).toBe('');
  expect(save).toHaveBeenCalledTimes(1);
});

