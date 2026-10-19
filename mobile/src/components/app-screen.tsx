import { View, Pressable } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { AppHeader } from './app-header';
import { Screen } from './ui/screen';
import { Text } from './ui/text';

export function AppScreen({
  children,
  onNavigate,
}: {
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <Screen>
      <AppHeader onNavigate={onNavigate} />
      <View className="flex-1">{children}</View>
      <View className="min-h-[66px] flex-row border-t border-line bg-surface">
        {(
          [
            { href: '/', label: 'committees', icon: 'grid' },
            { href: '/members', label: 'members', icon: 'users' },
          ] as const
        ).map((item) => {
          const selected =
            item.label === 'members'
              ? pathname.startsWith('/members')
              : pathname === '/' || pathname.startsWith('/committees');
          return (
            <Pressable
              key={item.href}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`tabs.${item.label}`)}
              onPress={() => {
                onNavigate?.();
                router.navigate(item.href);
              }}
              className="min-h-[66px] flex-1 items-center justify-center gap-1 py-2"
            >
              <Feather
                name={item.icon}
                size={22}
                color={selected ? theme.colors.brand : theme.colors.muted}
              />
              <Text
                variant="caption"
                className={selected ? 'text-brand' : 'text-muted'}
              >
                {t(`tabs.${item.label}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
