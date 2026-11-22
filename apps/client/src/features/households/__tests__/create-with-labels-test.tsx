import { ApiClientError } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Button, MuchakuchaThemeProvider, Text } from '../../../ui/primitives';
import { useCreateWithLabels } from '../use-create-with-labels';

type Draft = { title: string; labelIds?: string[] };

test('the chosen labels travel with the one create request', async () => {
  const create = jest.fn(async (_data: Draft) => ({ id: 'created' }));
  const complete = jest.fn();
  function Editor() {
    const flow = useCreateWithLabels<Draft>({ create, onComplete: complete });
    return <Button label="创建" onPress={() => void flow.submit({ title: '倒垃圾' }, ['label-a', 'label-b'])} loading={flow.pending} />;
  }
  const view = await render(<MuchakuchaThemeProvider><Editor /></MuchakuchaThemeProvider>);
  await fireEvent.press(view.getByRole('button', { name: '创建' }));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith({ title: '倒垃圾', labelIds: ['label-a', 'label-b'] });
});

test('a refused repeat rule goes back to the form; other failures stay a generic message', async () => {
  const refused = new ApiClientError(400, { error: { code: 'VALIDATION_FAILED', details: [{ field: 'recurrence.endsOn' }] } });
  const create = jest.fn().mockRejectedValueOnce(refused).mockRejectedValueOnce(new Error('offline'));
  const outcomes: unknown[] = [];
  function Editor() {
    const flow = useCreateWithLabels<Draft>({ create, onComplete: jest.fn() });
    return <>{flow.error ? <Text>{flow.error}</Text> : null}<Button label="创建" onPress={() => { flow.submit({ title: 'title' }, []).then(() => outcomes.push('ok'), (failure: unknown) => outcomes.push(failure)); }} /></>;
  }
  const view = await render(<MuchakuchaThemeProvider><Editor /></MuchakuchaThemeProvider>);
  await fireEvent.press(view.getByRole('button', { name: '创建' }));
  await waitFor(() => expect(outcomes).toEqual([refused]));
  expect(view.queryByText('创建失败，请检查网络后重试。')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '创建' }));
  await view.findByText('创建失败，请检查网络后重试。');
  expect(outcomes).toEqual([refused, 'ok']);
});

test.each([
  [new ApiClientError(400, { error: { code: 'VALIDATION_FAILED', details: [{ field: 'title' }] } }), '创建失败，请检查填写的内容后重试。'],
  [new ApiClientError(403, {}), '你没有权限在这个家庭创建内容。'],
  [new ApiClientError(500, {}), '创建失败，请稍后重试。'],
])('a server answer is not reported as a network problem (%#)', async (failure, message) => {
  const create = jest.fn().mockRejectedValue(failure);
  function Editor() {
    const flow = useCreateWithLabels<Draft>({ create, onComplete: jest.fn() });
    return <>{flow.error ? <Text>{flow.error}</Text> : null}<Button label="创建" onPress={() => void flow.submit({ title: 'title' }, [])} /></>;
  }
  const view = await render(<MuchakuchaThemeProvider><Editor /></MuchakuchaThemeProvider>);
  await fireEvent.press(view.getByRole('button', { name: '创建' }));
  await view.findByText(message);
});
