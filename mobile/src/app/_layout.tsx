import '../../global.css';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  NotoSansArabic_400Regular,
  NotoSansArabic_600SemiBold,
} from '@expo-google-fonts/noto-sans-arabic';
import { useSession } from '@/features/auth/session-store';
import { Providers } from '@/lib/providers';
import { usePreferences } from '@/stores/preferences';
import { theme } from '@/theme';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const token = useSession((state) => state.token);
  const hydrated = useSession((state) => state.hydrated);
  const preferencesReady = usePreferences((state) => state.hydrated);
  const [fontsReady, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    NotoSansArabic_400Regular,
    NotoSansArabic_600SemiBold,
  });
  useEffect(() => {
    void useSession.getState().restore();
  }, []);
  if (fontError) throw fontError;
  if (!hydrated || !preferencesReady || !fontsReady)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.page,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator
          color={theme.colors.brand}
          accessibilityLabel="Loading"
        />
      </View>
    );
  return (
    <Providers>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.page },
        }}
      >
        <Stack.Protected guard={Boolean(token)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="committees/new" />
          <Stack.Screen name="committees/[committeeId]" />
          <Stack.Screen name="committees/[committeeId]/edit" />
        </Stack.Protected>
        <Stack.Protected guard={!token}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
      <StatusBar style="dark" />
    </Providers>
  );
}
