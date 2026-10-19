import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/stores/preferences';
import { theme } from '@/theme';
import { Text } from './text';

export function Input({
  label,
  secret = false,
  latin = false,
  style,
  error,
  ...props
}: TextInputProps & {
  label: string;
  secret?: boolean;
  latin?: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  const language = usePreferences((state) => state.language);
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View className="gap-2">
      <Text variant="caption" className="text-muted">
        {label}
      </Text>
      <View
        className={`min-h-[56px] flex-row items-center rounded-control border bg-surface ${error ? 'border-danger' : focused ? 'border-brand' : 'border-line'}`}
      >
        <TextInput
          {...props}
          accessibilityLabel={label}
          accessibilityHint={error ?? props.accessibilityHint}
          placeholderTextColor={theme.colors.muted}
          secureTextEntry={secret && !visible}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          className="min-h-[56px] min-w-0 flex-1 px-4 py-3 text-ink"
          style={[
            {
              fontSize: 16,
              fontFamily: theme.fonts[latin ? 'en' : language].regular,
              textAlign: latin || language === 'en' ? 'left' : 'right',
              writingDirection: latin || language === 'en' ? 'ltr' : 'rtl',
            },
            style,
          ]}
        />
        {secret ? (
          <Pressable
            onPress={() => setVisible(!visible)}
            accessibilityRole="button"
            accessibilityLabel={t(
              visible ? 'auth.hidePassword' : 'auth.showPassword',
            )}
            className="min-h-[48px] min-w-[48px] items-center justify-center"
          >
            <Feather
              name={visible ? 'eye-off' : 'eye'}
              size={20}
              color={theme.colors.muted}
            />
          </Pressable>
        ) : null}
      </View>
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
