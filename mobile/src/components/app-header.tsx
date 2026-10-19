import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { Brand } from './brand';
import { LanguageSwitch } from './language-switch';

export function AppHeader({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="min-h-[72px] flex-row items-center justify-between gap-2 border-b border-line px-4 py-3">
      <Brand />
      <View className="flex-row items-center gap-1">
        <LanguageSwitch />
        <Link href="/account" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('tabs.account')}
            onPress={onNavigate}
            className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Feather name="user" size={21} color={theme.colors.brand} />
          </Pressable>
        </Link>
      </View>
    </View>
  );
}
