import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const key = 'committee-access-token';
type Session = {
  token: string | null;
  hydrated: boolean;
  restore: () => Promise<void>;
  setToken: (token: string) => Promise<void>;
  clear: () => Promise<void>;
};

export const useSession = create<Session>((set) => ({
  token: null,
  hydrated: false,
  async restore() {
    try {
      const token =
        Platform.OS === 'web' ? null : await SecureStore.getItemAsync(key);
      set({ token, hydrated: true });
    } catch {
      set({ token: null, hydrated: true });
    }
  },
  async setToken(token) {
    // Web previews keep tokens in memory; native devices use encrypted platform storage.
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(key, token);
    set({ token });
  },
  async clear() {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key);
    set({ token: null });
  },
}));
