// File: app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../src/context/AppContext';
import { SettingsProvider } from '../src/context/SettingsContext';

/**
 * Root layout: global providers (settings + app data) around all screens.
 */
export default function RootLayout() {
  return (
    <SettingsProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#e8f4fc' },
            animation: 'fade',
          }}
        />
      </AppProvider>
    </SettingsProvider>
  );
}
