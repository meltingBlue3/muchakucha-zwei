import { ThemeProvider } from '@shopify/restyle';
import { render } from '@testing-library/react-native';

import { AppStatusBar } from '../app-status-bar';
import { theme, type Theme } from '../theme';

jest.mock('react-native/Libraries/Components/StatusBar/StatusBar', () => {
  const React = require('react') as typeof import('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => React.createElement('View', { ...props, testID: 'app-status-bar' }),
  };
});

const renderFor = (colorScheme: Theme['colorScheme']) => render(
  <ThemeProvider theme={{ ...theme, colorScheme }}>
    <AppStatusBar />
  </ThemeProvider>,
);

describe('AppStatusBar', () => {
  test.each([
    ['light', 'dark-content'],
    ['dark', 'light-content'],
  ] as const)('uses readable icons for the %s app theme', async (colorScheme, expectedStyle) => {
    const view = await renderFor(colorScheme);

    expect(view.getByTestId('app-status-bar').props.barStyle).toBe(expectedStyle);
  });

  test('is mounted once at the app root', () => {
    const fs = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('node:fs');
    const rootLayout = fs.readFileSync('app/_layout.tsx', 'utf8');

    expect(rootLayout.match(/<AppStatusBar\s*\/>/g)).toHaveLength(1);
  });
});
