import type { Metadata } from 'next';
import { OnboardingLayoutClient } from './OnboardingLayoutClient';

// Онбординг доступен только сразу после регистрации, требует авторизации —
// уже закрыт в robots.txt, здесь явный noindex поверх него (см. комментарий
// в app/(app)/layout.tsx — та же причина, тот же приём).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingLayoutClient>{children}</OnboardingLayoutClient>;
}
