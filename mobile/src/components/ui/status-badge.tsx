import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './text';

export function StatusBadge({ status }: { status: 'active' | 'draft' }) {
  const { t } = useTranslation();
  return (
    <View
      className={`self-start rounded-full px-3 py-1 ${status === 'active' ? 'bg-successSoft' : 'bg-page'}`}
    >
      <Text
        variant="caption"
        className={status === 'active' ? 'text-success' : 'text-muted'}
      >
        {t(`committees.${status}`)}
      </Text>
    </View>
  );
}
