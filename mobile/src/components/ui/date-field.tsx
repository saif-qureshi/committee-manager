import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@expo/vector-icons/Feather';
import { localDate } from '@/lib/date';
import { usePreferences } from '@/stores/preferences';
import { theme } from '@/theme';
import { Text } from './text';

export type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
};

export function DateField({
  label,
  value,
  onChange,
  disabled,
  error,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const language = usePreferences((state) => state.language);
  return (
    <View className="gap-2">
      <Text variant="caption" className="text-muted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint={error}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        className={`min-h-[56px] flex-row items-center justify-between rounded-control border px-4 ${error ? 'border-danger' : 'border-line'}`}
      >
        <Text direction="ltr">{value}</Text>
        <Feather name="calendar" size={20} color={theme.colors.muted} />
      </Pressable>
      {open && !disabled ? (
        <DateTimePicker
          value={new Date(`${value}T12:00:00`)}
          minimumDate={new Date(1900, 0, 1)}
          maximumDate={new Date(2100, 11, 31)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          locale={language === 'ur' ? 'ur-PK' : 'en-PK'}
          themeVariant="light"
          onDismiss={() => setOpen(false)}
          onValueChange={(_, date) => {
            onChange(localDate(date));
            setOpen(false);
          }}
        />
      ) : null}
      {error ? (
        <Text
          variant="caption"
          className="text-danger"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
