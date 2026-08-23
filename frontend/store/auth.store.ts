import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/lib/api';
import { setAccessToken, setRefreshToken, registerTokenRefreshHandler, api } from '@/lib/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;

  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  /** Тихо перезапросить /auth/me и обновить пользователя (например, после списания Caspers) */
  refreshUser: () => Promise<void>;
}

// createJSONStorage оборачивает localStorage в try/catch — безопасно на SSR (вернёт null).
// skipHydration: true означает, что Zustand не гидрируется автоматически на сервере;
// providers.tsx вызывает persist.rehydrate() на клиенте после монтирования.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: true,

      setAuth: (user, accessToken, refreshToken) => {
        setAccessToken(accessToken);
        setRefreshToken(refreshToken);
        set({ user, accessToken, refreshToken, isLoading: false });
      },

      setUser: (user) => set({ user }),

      clearAuth: () => {
        setAccessToken(null);
        setRefreshToken(null);
        set({ user: null, accessToken: null, refreshToken: null, isLoading: false });
      },

      setLoading: (isLoading) => set({ isLoading }),

      refreshUser: async () => {
        try {
          const me = await api.auth.me();
          set({ user: me });
        } catch {}
      },
    }),
    {
      name: 'ghostline-auth',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true, // гидратация запускается вручную в providers.tsx на клиенте
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
          // Мост в lib/api.ts — иначе тихое обновление protухшего access-токена (см.
          // request() в api.ts) не найдёт refreshToken из localStorage до первого setAuth.
          setRefreshToken(state.refreshToken);
        }
      },
    },
  ),
);

// Тихое обновление токена в api.ts меняет access/refresh в обход setAuth (это не логин,
// а фоновое продление сессии) — без этой подписки новая пара останется только в памяти
// api.ts и потеряется при следующей перезагрузке страницы, вернув протухший refreshToken.
registerTokenRefreshHandler((accessToken, refreshToken) => {
  useAuthStore.setState({ accessToken, refreshToken });
});
