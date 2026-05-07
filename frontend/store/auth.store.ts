import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/lib/api';
import { setAccessToken } from '@/lib/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;

  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

// createJSONStorage wraps localStorage in try/catch — safe on SSR (returns null).
// skipHydration: true means Zustand won't auto-hydrate on the server;
// providers.tsx calls persist.rehydrate() on the client after mount.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: true,

      setAuth: (user, accessToken, refreshToken) => {
        setAccessToken(accessToken);
        set({ user, accessToken, refreshToken, isLoading: false });
      },

      setUser: (user) => set({ user }),

      clearAuth: () => {
        setAccessToken(null);
        set({ user: null, accessToken: null, refreshToken: null, isLoading: false });
      },

      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'ghostline-auth',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true, // hydration triggered manually in providers.tsx on client
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    },
  ),
);
