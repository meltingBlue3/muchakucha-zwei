import { act, render } from '@testing-library/react-native';

import type { DraftStorage } from '../../platform/drafts/draft-storage';
import { DraftNotice } from '../draft-notice';
import { MuchakuchaThemeProvider } from '../primitives';
import { WorkspaceStateProvider } from '../workspace-state';
import { createWorkspaceState } from '../workspace-store';

async function renderNotice(write: DraftStorage['write']) {
  const store = createWorkspaceState({ read: () => null, write, remove: () => undefined });
  store.activateAccount('alice');
  const view = await render(
    <MuchakuchaThemeProvider>
      <WorkspaceStateProvider store={store}><DraftNotice /></WorkspaceStateProvider>
    </MuchakuchaThemeProvider>,
  );
  return { store, view };
}

test('stays silent while drafts save normally', async () => {
  const { store, view } = await renderNotice(() => undefined);
  await act(() => { store.set('draft:family-a:notes:new:form', { title: '采购' }); });
  expect(view.toJSON()).toBeNull();
});

test('warns only when a draft fails to save', async () => {
  const { store, view } = await renderNotice(() => { throw new Error('disk full'); });
  await act(() => { store.set('draft:family-a:notes:new:form', { title: '采购' }); });
  expect(view.getByText('草稿未能保存到此设备，请勿关闭应用；编辑后会重新尝试保存。')).toBeTruthy();
});
