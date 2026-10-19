import { useEffect, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import {
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import * as Network from 'expo-network';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '@/i18n';
import { usePreferences } from '@/stores/preferences';
import { queryClient } from './query-client';

export function Providers({ children }: { children: ReactNode }) {
  const language = usePreferences((state) => state.language);
  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const focus = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    );
    onlineManager.setEventListener((setOnline) => {
      const update = (state: Network.NetworkState) =>
        setOnline(
          state.isConnected === true && state.isInternetReachable !== false,
        );
      void Network.getNetworkStateAsync()
        .then(update)
        .catch(() => {});
      const listener = Network.addNetworkStateListener(update);
      return () => listener.remove();
    });
    return () => {
      focus.remove();
      onlineManager.setEventListener(() => () => {});
    };
  }, []);
  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
