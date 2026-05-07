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
      // localStorage persists across browser sessions (30-day rolling refresh token).
      // Access token stays in memory only — never hits storage.
      storage: typeof window !== 'undefined'
        ? createJSONStorage(() => localStorage)
        : undefined,
      // Persist user too — shows cached data instantly on refresh
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        // After localStorage rehydration — mark loading as false so UI shows immediately
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);
