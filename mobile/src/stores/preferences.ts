import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Language = 'en' | 'ur';
type Preferences = {
  language: Language;
  hydrated: boolean;
  setLanguage: (language: Language) => void;
};

export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      language: getLocales()[0]?.languageCode === 'ur' ? 'ur' : 'en',
      hydrated: false,
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'committee-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language }) => ({ language }),
      onRehydrateStorage: () => () =>
        usePreferences.setState({ hydrated: true }),
    },
  ),
);
