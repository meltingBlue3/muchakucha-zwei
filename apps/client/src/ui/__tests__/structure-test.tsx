import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet, Text as NativeText } from 'react-native';

import { LabelChip } from '../../features/labels/label-chip';
import { ContentCard } from '../content-card';
import { Heading, MuchakuchaThemeProvider } from '../primitives';
import { theme } from '../theme';

const renderOwned = (node: React.ReactElement) => render(<MuchakuchaThemeProvider>{node}</MuchakuchaThemeProvider>);

test('heading levels follow the visual size unless a screen says otherwise', async () => {
  const view = await renderOwned(<>
    <Heading>任务</Heading>
    <Heading variant="section">基本信息</Heading>
    <Heading level={2}>买菜</Heading>
  </>);
  expect(view.getByText('任务').props['aria-level']).toBe(1);
  expect(view.getByText('基本信息').props['aria-level']).toBe(2);
  expect(view.getByText('买菜').props['aria-level']).toBe(2);
});

test('a content card opens from its body and keeps its controls as siblings', async () => {
  const onPress = jest.fn();
  const onMenu = jest.fn();
  const view = await renderOwned(
    <ContentCard accessibilityLabel="笔记：清单" onPress={onPress} trailing={<NativeText accessibilityRole="button" onPress={onMenu}>更多</NativeText>}>
      <NativeText>清单</NativeText>
    </ContentCard>,
  );
  const body = view.getByRole('button', { name: '笔记：清单' });
  await fireEvent.press(body);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(within(body).queryByRole('button', { name: '更多' })).toBeNull();
  expect(view.getByRole('button', { name: '更多' })).toBeTruthy();
});

test('label names stay in ink; a picker marks selection by fill and a check, not by fading', async () => {
  const label = { id: 'l', name: '家务', color: '#E8C252' } as never;
  const view = await renderOwned(<>
    <LabelChip label={label} selected />
    <LabelChip label={{ id: 'm', name: '学习', color: '#277A72' } as never} selected={false} />
  </>);
  expect(StyleSheet.flatten(view.getByText('家务').props.style).color).toBe(theme.colors.ink);
  const unselected = view.getByLabelText('标签：学习');
  expect(StyleSheet.flatten(unselected.props.style)).toMatchObject({ backgroundColor: theme.colors.surface, borderColor: theme.colors.border });
  expect(StyleSheet.flatten(unselected.props.style).opacity).toBeUndefined();
});
