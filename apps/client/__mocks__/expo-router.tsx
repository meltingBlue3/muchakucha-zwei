import { createElement } from 'react';
import { Text } from 'react-native';

/**
 * Manual mock for `expo-router`, auto-applied by Jest to every test file
 * (no `jest.mock('expo-router')` call needed — see the Jest docs on manual
 * mocks for node_modules packages).
 *
 * The real package pulls in Expo's Metro dev-server / Fast Refresh devtools
 * client as an import-time side effect (`expo/src/async-require/messageSocket`),
 * which unconditionally throws outside a running Metro bundler. Router
 * behavior itself belongs to Playwright E2E, not Jest unit tests, so this
 * mock only needs to satisfy the hooks/components our feature and UI modules
 * actually call.
 */

export function useRouter() {
  return {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => false),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
    dismissTo: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
  };
}

export function useLocalSearchParams<T extends object = Record<string, string>>(): Partial<T> {
  return {};
}

export function useGlobalSearchParams<T extends object = Record<string, string>>(): Partial<T> {
  return {};
}

export function useSegments(): string[] {
  return [];
}

export function usePathname(): string {
  return '/';
}

export function useFocusEffect(): void {
  // No-op: navigation focus lifecycle is exercised by Playwright E2E, not Jest.
}

export function useNavigation() {
  return {
    addListener: jest.fn(() => jest.fn()),
    setOptions: jest.fn(),
  };
}

export function Link({ href, children, ...rest }: { href: unknown; children?: React.ReactNode; [key: string]: unknown }) {
  return createElement(Text, { accessibilityRole: 'link', ...rest }, children);
}

export function Redirect() {
  return null;
}

export const router = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  dismiss: jest.fn(),
  navigate: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn(),
};

export const Stack = { Screen: () => null };
export const Tabs = { Screen: () => null };
