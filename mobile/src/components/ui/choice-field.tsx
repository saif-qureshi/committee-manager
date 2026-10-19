import { Pressable, View } from 'react-native';
import { Text } from './text';

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View
      className="gap-2"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      <Text variant="caption" className="text-muted">
        {label}
      </Text>
      <View className="flex-row gap-2">
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: value === option.value, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            className={`min-h-[52px] flex-1 items-center justify-center rounded-control border px-3 py-2 ${value === option.value ? 'border-brand bg-brand' : 'border-line bg-surface'}`}
          >
            <Text
              style={{ textAlign: 'center' }}
              className={value === option.value ? 'text-white' : 'text-ink'}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
