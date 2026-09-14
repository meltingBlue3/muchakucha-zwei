import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Button, MuchakuchaThemeProvider, Text } from '../../../ui/primitives';
import { WorkspaceStateProvider } from '../../../ui/workspace-state';
import { useCreateWithLabels } from '../use-create-with-labels';

test('label retry after leaving and reopening never creates a second resource', async () => {
  const create = jest.fn(async (_data: string) => ({ id: 'created-once' }));
  const tag = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const complete = jest.fn();
  function Editor() {
    const flow = useCreateWithLabels({ key: 'draft:family:task:new:created', create, tag, onComplete: complete });
    return <>{flow.error ? <Text>{flow.error}</Text> : null}<Button label={flow.created ? '重试标签' : '创建'} onPress={() => void (flow.created ? flow.retry() : flow.submit('title', ['label-a']))} loading={flow.pending} /></>;
  }
  function Demo() {
    const [open, setOpen] = useState(true);
    return <><Button label="切换编辑器" onPress={() => setOpen((value) => !value)} />{open ? <Editor /> : null}</>;
  }
  const view = await render(<MuchakuchaThemeProvider><WorkspaceStateProvider><Demo /></WorkspaceStateProvider></MuchakuchaThemeProvider>);
  await fireEvent.press(view.getByRole('button', { name: '创建' }));
  await view.findByText('内容已创建，但标签未保存。重试只会保存标签，不会重复创建。');
  await fireEvent.press(view.getByRole('button', { name: '切换编辑器' }));
  await fireEvent.press(view.getByRole('button', { name: '切换编辑器' }));
  await fireEvent.press(view.getByRole('button', { name: '重试标签' }));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledTimes(1);
  expect(tag).toHaveBeenCalledTimes(2);
  expect(tag).toHaveBeenLastCalledWith('created-once', ['label-a']);
});
