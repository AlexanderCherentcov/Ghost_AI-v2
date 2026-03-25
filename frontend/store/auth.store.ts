import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
      // Persist user too — shows cached data instantly on refresh
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        // After localStorage rehydration — restore accessToken in memory
        // and mark loading as false so UI shows immediately
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);
