export const theme = {
  colors: {
    brand: '#12324A',
    mint: '#BDE8D8',
    page: '#FFFFFF',
    surface: '#FFFFFF',
    ink: '#182C3A',
    muted: '#526773',
    line: '#DCE5EB',
    danger: '#A52C3C',
    dangerSoft: '#FFF0F2',
    success: '#236047',
    successSoft: '#E5F3EC',
  },
  spacing: { screen: 24, section: 32 },
  radius: { control: 8, card: 12 },
  fonts: {
    en: {
      regular: 'Manrope_400Regular',
      semibold: 'Manrope_600SemiBold',
      bold: 'Manrope_700Bold',
    },
    ur: {
      regular: 'NotoSansArabic_400Regular',
      semibold: 'NotoSansArabic_600SemiBold',
      bold: 'NotoSansArabic_600SemiBold',
    },
  },
} as const;
