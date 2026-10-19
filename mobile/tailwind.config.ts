import type { Config } from 'tailwindcss';
import { theme } from './src/theme';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: theme.colors,
      spacing: Object.fromEntries(
        Object.entries(theme.spacing).map(([key, value]) => [
          key,
          `${value}px`,
        ]),
      ),
      borderRadius: Object.fromEntries(
        Object.entries(theme.radius).map(([key, value]) => [key, `${value}px`]),
      ),
    },
  },
} satisfies Config;
