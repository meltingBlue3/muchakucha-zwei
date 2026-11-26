import { render, renderHook } from '@testing-library/react-native';
import { Platform, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createRef } from 'react';

import { AppDialog } from '../app-dialog';
import { MuchakuchaThemeProvider } from '../primitives';
import { useOpenWindowItem } from '../route-window';

jest.mock('expo-router', () => ({
  useGlobalSearchParams: () => ({ noteId: 'note-1' }),
}));

jest.mock('expo-blur', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BlurTargetView: React.forwardRef((props: Record<string, unknown>, ref: unknown) => React.createElement(NativeView, { ...props, ref } as never)),
    BlurView: (props: Record<string, unknown>) => React.createElement(NativeView, props),
  };
});

const originalOS = Platform.OS;

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  jest.restoreAllMocks();
});

test('pins Android Modal first-frame height to the SafeAreaProvider frame height', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  const trigger = createRef<null>();
  const view = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 805 }, insets: { top: 44, right: 0, bottom: 34, left: 0 } }}>
      <MuchakuchaThemeProvider>
        <AppDialog title="笔记" size="editor" busy={false} trigger={trigger} onClose={jest.fn()}>
          <Text>内容</Text>
        </AppDialog>
      </MuchakuchaThemeProvider>
    </SafeAreaProvider>,
  );

  // Inspect the rendered Modal container style inside the tree.
  const modal = view.toJSON() as { type?: string; props?: { style?: unknown }; children?: Array<{ props?: { style?: unknown } }> };
  const container = modal.children?.[0];
  expect(StyleSheet.flatten(container?.props?.style)).toMatchObject({ minHeight: 805 });
});

test('useOpenWindowItem only marks the open row on wide desktop screens', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  const mobile = await renderHook(() => useOpenWindowItem('noteId'));
  expect(mobile.result.current).toBeUndefined();

  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1 } as ReturnType<typeof useWindowDimensions>);
  const narrowWeb = await renderHook(() => useOpenWindowItem('noteId'));
  expect(narrowWeb.result.current).toBeUndefined();

  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 1280, height: 800, scale: 1, fontScale: 1 } as ReturnType<typeof useWindowDimensions>);
  const wideWeb = await renderHook(() => useOpenWindowItem('noteId'));
  expect(wideWeb.result.current).toBe('note-1');
});
