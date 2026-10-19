import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/stores/preferences';
import { theme } from '@/theme';
import { Text } from './ui/text';

export function PageHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const language = usePreferences((state) => state.language);
  return (
    <View className="min-h-[56px] flex-row items-center gap-2 border-b border-line px-4 py-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        className="h-11 w-11 items-center justify-center"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/');
        }}
      >
        <Feather
          name={language === 'ur' ? 'chevron-right' : 'chevron-left'}
          size={24}
          color={theme.colors.brand}
        />
      </Pressable>
      <Text numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}
