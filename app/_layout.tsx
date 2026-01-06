import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { AppProvider } from '../src/context/AppContext';
import { SettingsProvider } from '../src/context/SettingsContext';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    const { hostname, path } = Linking.parse(url);
    if (path === 'paypal-success' || hostname === 'paypal-success') {
      // The event will be handled by components listening for state changes
      // or we could trigger a refresh here if needed.
    }
  };

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
