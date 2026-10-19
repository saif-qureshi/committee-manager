import { Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePreferences } from '@/stores/preferences';
import { theme } from '@/theme';

export function LanguageSwitch() {
  const language = usePreferences((state) => state.language);
  const setLanguage = usePreferences((state) => state.setLanguage);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        language === 'en' ? 'اردو میں تبدیل کریں' : 'Switch to English'
      }
      onPress={() => setLanguage(language === 'en' ? 'ur' : 'en')}
      className="h-11 w-11 items-center justify-center rounded-full"
    >
      <MaterialIcons name="translate" size={23} color={theme.colors.brand} />
    </Pressable>
  );
}
