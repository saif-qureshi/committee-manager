import { View } from 'react-native';
import { usePreferences } from '@/stores/preferences';
import { theme } from '@/theme';
import { Text } from './text';
import type { DateFieldProps } from './date-field';

export function DateField({
  label,
  value,
  onChange,
  disabled,
  error,
}: DateFieldProps) {
  const language = usePreferences((state) => state.language);
  return (
    <View className="gap-2">
      <Text variant="caption" className="text-muted">
        {label}
      </Text>
      <input
        type="date"
        aria-label={label}
        aria-invalid={Boolean(error)}
        lang={language === 'ur' ? 'ur-PK' : 'en-PK'}
        dir="ltr"
        value={value}
        min="1900-01-01"
        max="2100-12-31"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          minHeight: 56,
          padding: '12px 16px',
          borderRadius: theme.radius.control,
          border: `1px solid ${error ? theme.colors.danger : theme.colors.line}`,
          color: theme.colors.ink,
          background: theme.colors.surface,
          fontFamily: theme.fonts.en.regular,
          fontSize: 16,
          colorScheme: 'light',
        }}
      />
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
