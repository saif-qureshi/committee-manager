import { View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePreferences } from '@/stores/preferences';
import { theme } from '@/theme';

export function Screen({ children }: Pick<ViewProps, 'children'>) {
  const language = usePreferences((state) => state.language);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.page }}>
      <View
        className="w-full max-w-lg flex-1 self-center"
        style={{ direction: language === 'ur' ? 'rtl' : 'ltr' }}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}
