import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  // "Ознакомиться" в сайдбаре (Sidebar.tsx) должен показать витрину моделей на
  // /chat даже когда пользователь УЖЕ на /chat — router.push('/chat') на тот же
  // маршрут не ремонтирует страницу (Next.js App Router), так что sessionStorage-
  // флаг, читаемый только в mount-эффекте, там никогда не сработает бы. Счётчик
  // в общем сторе решает это без завязки на ремонт: ChatPage слушает изменение
  // значения (эффект с зависимостью, не только на маунте) и реагирует всегда,
  // независимо от того, был реальный переход по роуту или нет.
  discoveryRequestId: number;
  requestDiscovery: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebar: (open) => set({ sidebarOpen: open }),
      discoveryRequestId: 0,
      requestDiscovery: () => set((s) => ({ discoveryRequestId: s.discoveryRequestId + 1 })),
    }),
    { name: 'ghostline-ui', partialize: (s) => ({ sidebarOpen: s.sidebarOpen }) }
  )
);
