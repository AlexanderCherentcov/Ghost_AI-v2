'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export type LimitType = 'messages' | 'images' | null;

const LIMIT_LABELS: Record<NonNullable<LimitType>, { title: string; desc: string; addonKey: string; addonLabel: string }> = {
  messages: { title: 'Лимит сообщений исчерпан', desc: 'Вы использовали все сообщения.',       addonKey: 'MESSAGES_STD_200', addonLabel: '+ 200 сообщений за ₽199' },
  images:   { title: 'Лимит картинок исчерпан',  desc: 'Вы использовали все генерации.',        addonKey: 'IMAGES_10',        addonLabel: '+ 10 картинок за ₽299'  },
};

interface Props {
  type: LimitType;
  onClose: () => void;
}

export function LimitPopup({ type, onClose }: Props) {
  const router = useRouter();

  function handleAddon() {
    if (!type) return;
    router.push(`/billing?addon=${LIMIT_LABELS[type].addonKey}`);
    onClose();
  }

  if (!type) return null;
  const info = LIMIT_LABELS[type];

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
            <div className="text-2xl mb-3">⚡</div>
            <h3 className="text-white font-medium text-base mb-1">{info.title}</h3>
            <p className="text-[rgba(255,255,255,0.45)] text-sm mb-5">{info.desc}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleAddon}
                className="w-full py-2.5 px-4 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {info.addonLabel}
              </button>
              <button
                onClick={() => { router.push('/billing'); onClose(); }}
                className="w-full py-2.5 px-4 rounded-xl border border-[var(--border)] text-[rgba(255,255,255,0.6)] text-sm hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-all"
              >
                Сменить тариф
              </button>
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
