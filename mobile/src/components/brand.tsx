import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './ui/text';
import { theme } from '@/theme';

export function Brand() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="h-9 w-9 items-center justify-center rounded-control bg-brand"
      >
        <Text
          direction="ltr"
          style={{
            color: theme.colors.surface,
            fontSize: 19,
            fontFamily: theme.fonts.en.bold,
            textAlign: 'center',
          }}
        >
          C
        </Text>
      </View>
      <Text style={{ fontSize: 15, flexShrink: 1 }}>{t('appName')}</Text>
    </View>
  );
}
