import { Stack } from 'expo-router';

import { MuchakuchaThemeProvider } from '../src/ui/primitives';

export default function RootLayout() {
  return (
    <MuchakuchaThemeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </MuchakuchaThemeProvider>
  );
}
