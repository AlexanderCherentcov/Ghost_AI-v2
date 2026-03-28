'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export type LimitType = 'messages' | 'images' | 'pro' | null;

const LIMIT_CONFIG: Record<NonNullable<LimitType>, {
  icon: string;
  title: string;
  desc: string;
  primaryLabel: string;
  primaryHref: string;
  addonKey?: string;
  addonLabel?: string;
}> = {
  messages: {
    icon: '💬',
    title: 'Лимит сообщений исчерпан',
    desc: 'Вы использовали все 10 бесплатных сообщений на сегодня. Они обновятся завтра или оформите подписку.',
    primaryLabel: 'Оформить подписку',
    primaryHref: '/billing',
    addonKey: 'MESSAGES_STD_200',
    addonLabel: '+ 200 сообщений за ₽199',
  },
  images: {
    icon: '🖼️',
    title: 'Лимит картинок исчерпан',
    desc: 'Вы использовали все 3 бесплатных генерации за этот месяц. Оформите подписку для безлимитных картинок.',
    primaryLabel: 'Оформить подписку',
    primaryHref: '/billing',
    addonKey: 'IMAGES_10',
    addonLabel: '+ 10 картинок за ₽299',
  },
  pro: {
    icon: '⚡',
    title: 'Это функция Pro',
    desc: 'Модель «Про» (DeepSeek) доступна только в платных тарифах. Улучшите план чтобы использовать продвинутые модели.',
    primaryLabel: 'Смотреть тарифы',
    primaryHref: '/billing',
  },
};

interface Props {
  type: LimitType;
  onClose: () => void;
}

export function LimitPopup({ type, onClose }: Props) {
  const router = useRouter();

  if (!type) return null;
  const cfg = LIMIT_CONFIG[type];

  return (
    <AnimatePresence>
      {type && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(360px,90vw)] bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl"
          >
            <div className="text-2xl mb-3">{cfg.icon}</div>
            <h3 className="text-white font-medium text-base mb-1">{cfg.title}</h3>
            <p className="text-[rgba(255,255,255,0.45)] text-sm mb-5">{cfg.desc}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { router.push(cfg.primaryHref); onClose(); }}
                className="w-full py-2.5 px-4 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {cfg.primaryLabel}
              </button>
              {cfg.addonLabel && cfg.addonKey && (
                <button
                  onClick={() => { router.push(`/billing?addon=${cfg.addonKey}`); onClose(); }}
                  className="w-full py-2.5 px-4 rounded-xl border border-[var(--border)] text-[rgba(255,255,255,0.6)] text-sm hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-all"
                >
                  {cfg.addonLabel}
                </button>
              )}
              <button onClick={onClose} className="text-xs text-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.5)] transition-colors mt-1">
                Закрыть
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
