import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { TaskForm } from '../task-form';

const members = [
  { userId: 'u1', displayName: '小林' },
  { userId: 'u2', displayName: '小周' },
];

async function renderForm() {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const view = await render(
    <MuchakuchaThemeProvider>
      <TaskForm isSubmitting={false} members={members} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel="创建" />
    </MuchakuchaThemeProvider>,
  );
  return { onSubmit, view };
}

describe('task form choice rows', () => {
  test('single choices apply immediately and summarize in their row', async () => {
    const { onSubmit, view } = await renderForm();
    await fireEvent.changeText(view.getByLabelText('任务标题'), '整理旅行用品');
    await fireEvent.press(view.getByRole('button', { name: '任务优先级，中优先级' }));
    await fireEvent.press(view.getByRole('radio', { name: '紧急' }));
    expect(view.getByRole('button', { name: '任务优先级，紧急优先级' })).toBeTruthy();
    expect(view.queryByRole('radio', { name: '紧急' })).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: '任务状态，待办' }));
    await fireEvent.press(view.getByRole('radio', { name: '进行中' }));
    await fireEvent.press(view.getByLabelText('创建'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: '整理旅行用品', priority: 'urgent', status: 'in_progress', assigneeIds: [] }));
  });

  test('assignees are confirmed with 完成, and 未分配 clears the selection', async () => {
    const { onSubmit, view } = await renderForm();
    await fireEvent.changeText(view.getByLabelText('任务标题'), '买菜');
    await fireEvent.press(view.getByRole('button', { name: '负责人，未分配' }));
    expect(view.getByRole('checkbox', { name: '未分配' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(view.getByRole('checkbox', { name: '小林' }));
    await fireEvent.press(view.getByRole('checkbox', { name: '小周' }));
    expect(view.getByRole('checkbox', { name: '未分配' }).props.accessibilityState.checked).toBe(false);
    // Nothing applies until the list is confirmed.
    expect(view.getByRole('button', { name: '负责人，未分配' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '完成' }));
    expect(view.getByRole('button', { name: '负责人，小林、小周' })).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: '负责人，小林、小周' }));
    await fireEvent.press(view.getByRole('checkbox', { name: '未分配' }));
    await fireEvent.press(view.getByRole('button', { name: '完成' }));
    await fireEvent.press(view.getByRole('button', { name: '负责人，未分配' }));
    await fireEvent.press(view.getByRole('checkbox', { name: '小周' }));
    await fireEvent.press(view.getByRole('button', { name: '完成' }));
    await fireEvent.press(view.getByLabelText('创建'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ assigneeIds: ['u2'] }));
  });

  test('a missing title is reported on the title itself until the title is filled', async () => {
    const { onSubmit, view } = await renderForm();
    await fireEvent.press(view.getByLabelText('创建'));
    expect(view.getByText('请输入任务标题。')).toBeTruthy();
    expect(view.getByLabelText('任务标题').props['aria-invalid']).toBe(true);
    // Changing another field does not hide a mistake that is still there.
    await fireEvent.press(view.getByRole('button', { name: '任务优先级，中优先级' }));
    await fireEvent.press(view.getByRole('radio', { name: '紧急' }));
    expect(view.getByText('请输入任务标题。')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('任务标题'), '买菜');
    expect(view.queryByText('请输入任务标题。')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('an empty due date shows its placeholder without a clear button', async () => {
    const { view } = await renderForm();
    expect(view.queryByRole('button', { name: '清除截止日期' })).toBeNull();
    expect(view.getByRole('button', { name: '截止日期，添加截止日期' })).toBeTruthy();
  });
});
