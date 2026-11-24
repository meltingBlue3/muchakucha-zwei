import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Button, MuchakuchaThemeProvider, TextField } from '../primitives';
import { WorkspaceStateProvider, useWorkspaceState, useWorkspaceStore } from '../workspace-state';

/** The smallest editor that keeps its fields as a draft, as every household form does. */
function DraftForm({ draftKey, onCancel, onSave }: { draftKey: string; onCancel(): void; onSave(): void }) {
  const [form, setForm] = useWorkspaceState(draftKey, { title: '' });
  return <>
    <TextField label="标题" value={form.title} onChangeText={title => setForm({ title })} />
    <Button label="取消" onPress={onCancel} />
    <Button label="保存" onPress={onSave} />
  </>;
}

test('drafts survive leaving the editor, stay household-scoped and clear after save', async () => {
  const save = jest.fn(async () => undefined);
  function Demo() {
    const [household, setHousehold] = useState<string | null>('a');
    const workspace = useWorkspaceStore();
    return <>
      <Button label="打开 A" onPress={() => setHousehold('a')} />
      <Button label="打开 B" onPress={() => setHousehold('b')} />
      {household ? <DraftForm key={household} draftKey={`draft:${household}:note:new:form`} onCancel={() => setHousehold(null)} onSave={() => { void save(); workspace.clear(`draft:${household}:note:new:`); setHousehold(null); }} /> : null}
    </>;
  }
  const view = await render(<MuchakuchaThemeProvider><WorkspaceStateProvider><Demo /></WorkspaceStateProvider></MuchakuchaThemeProvider>);
  await fireEvent.changeText(view.getByLabelText('标题'), '未保存的采购单');
  await fireEvent.press(view.getByRole('button', { name: '取消' }));
  await fireEvent.press(view.getByRole('button', { name: '打开 B' }));
  expect(view.getByLabelText('标题').props.value).toBe('');
  await fireEvent.press(view.getByRole('button', { name: '打开 A' }));
  expect(view.getByLabelText('标题').props.value).toBe('未保存的采购单');
  await fireEvent.press(view.getByRole('button', { name: '保存' }));
  await fireEvent.press(view.getByRole('button', { name: '打开 A' }));
  expect(view.getByLabelText('标题').props.value).toBe('');
  expect(save).toHaveBeenCalledTimes(1);
});
