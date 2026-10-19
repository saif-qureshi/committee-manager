import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
} from 'react-native';
import { Text } from './text';
import { theme } from '@/theme';

export function Button({
  label,
  loading = false,
  variant = 'primary',
  disabled,
  className = '',
  ...props
}: Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      className={`min-h-[52px] flex-row items-center justify-center gap-3 rounded-control px-5 py-3 ${disabled ? 'bg-line' : variant === 'primary' ? 'bg-brand' : 'border border-line bg-surface'} ${className}`}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' ? theme.colors.surface : theme.colors.brand
          }
        />
      ) : null}
      <Text
        className={
          disabled
            ? 'text-muted'
            : variant === 'primary'
              ? 'text-white'
              : 'text-brand'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
