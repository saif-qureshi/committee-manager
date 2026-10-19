import { Text as NativeText, type TextProps } from 'react-native';
import { usePreferences } from '@/stores/preferences';
import { theme } from '@/theme';

const variants = {
  body: { fontSize: 16, weight: 'regular' },
  caption: { fontSize: 13, weight: 'regular' },
  title: { fontSize: 21, weight: 'semibold' },
  heading: { fontSize: 34, weight: 'bold' },
  amount: { fontSize: 24, weight: 'bold' },
} as const;

export function Text({
  variant = 'body',
  direction,
  style,
  className = '',
  ...props
}: TextProps & {
  variant?: keyof typeof variants;
  direction?: 'ltr' | 'rtl';
}) {
  const language = usePreferences((state) => state.language);
  const { fontSize, weight } = variants[variant];
  return (
    <NativeText
      {...props}
      className={`text-ink ${className}`}
      style={[
        {
          fontSize,
          fontFamily:
            theme.fonts[direction === 'ltr' ? 'en' : language][weight],
          lineHeight: Math.ceil(
            fontSize * (language === 'ur' && direction !== 'ltr' ? 1.9 : 1.45),
          ),
          textAlign: language === 'ur' ? 'right' : 'left',
          writingDirection: direction ?? (language === 'ur' ? 'rtl' : 'ltr'),
        },
        style,
      ]}
    />
  );
}
