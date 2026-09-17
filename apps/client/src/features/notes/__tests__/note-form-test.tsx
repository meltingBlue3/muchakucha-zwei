import type { NoteResponseDto } from '@muchakucha/api-client';
import { fireEvent, render } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
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

async function renderForm(initial?: NoteResponseDto) {
  const onSubmit = jest.fn(async () => undefined);
  const view = await render(
    <MuchakuchaThemeProvider>
      <NoteForm
        {...(initial === undefined ? {} : { initial })}
        isSubmitting={false}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
        submitLabel="保存"
      />
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
