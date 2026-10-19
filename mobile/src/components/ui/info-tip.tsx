import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { Text } from './text';

export function InfoTip({ text }: { text: string }) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const tooltipWidth = Math.min(280, width - 32);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.info')}
        accessibilityState={{ expanded: Boolean(position) }}
        className="h-11 w-11 items-center justify-center"
        onPress={(event) =>
          setPosition({
            left: Math.max(
              16,
              Math.min(
                width - tooltipWidth - 16,
                event.nativeEvent.pageX - tooltipWidth,
              ),
            ),
            top: Math.max(
              16,
              Math.min(height - 280, event.nativeEvent.pageY + 16),
            ),
          })
        }
      >
        <Feather name="help-circle" size={20} color={theme.colors.muted} />
      </Pressable>
      <Modal
        visible={Boolean(position)}
        transparent
        animationType="fade"
        onRequestClose={() => setPosition(null)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.closeInfo')}
          onPress={() => setPosition(null)}
          style={{ position: 'absolute', inset: 0 }}
        />
        {position ? (
          <View
            accessibilityViewIsModal
            style={{
              position: 'absolute',
              ...position,
              width: tooltipWidth,
              maxHeight: Math.min(240, height - 48),
              borderWidth: 1,
              borderColor: theme.colors.line,
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.surface,
              padding: 16,
              elevation: 6,
              boxShadow: '0 4px 20px #182c3a22',
            }}
          >
            <ScrollView>
              <Text variant="caption">{text}</Text>
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  );
}
