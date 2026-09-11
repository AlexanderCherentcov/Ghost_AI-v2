// Общий layout группы (auth) — метаданные у /login и /register свои
// (см. login/layout.tsx, register/layout.tsx), здесь не задаём ничего,
// чтобы не дублировать title/description на двух разных страницах.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
