'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export type LimitType =
  | 'LIMIT_MESSAGES_DAILY'
  | 'LIMIT_MESSAGES'
  | 'LIMIT_FILES'
  | 'LIMIT_IMAGES'
  | 'LIMIT_VIDEOS'
  | 'LIMIT_VIDEOS_UNAVAILABLE'
  | 'LIMIT_MUSIC'
  | 'LIMIT_MUSIC_UNAVAILABLE'
  | 'FREE_LOCKED'
  | null;

const LIMIT_CONFIG: Record<NonNullable<LimitType>, {
  icon: string;
  title: string;
  desc: string;
  btn1: string;
  btn2: string;
}> = {
  LIMIT_MESSAGES_DAILY: {
    icon: '💬',
    title: 'Дневной лимит исчерпан',
    desc: 'Вы использовали все сообщения сегодня. Лимит обновится завтра.',
    btn1: 'Перейти на платный тариф',
    btn2: 'Закрыть',
  },
  LIMIT_MESSAGES: {
    icon: '💬',
    title: 'Сообщения закончились',
    desc: 'Лимит сообщений на этот месяц исчерпан.',
    btn1: 'Перейти на следующий тариф',
    btn2: 'Закрыть',
  },
  LIMIT_FILES: {
    icon: '📎',
    title: 'Лимит файлов исчерпан',
    desc: 'Вы использовали все запросы с файлами. Обычный чат работает.',
    btn1: 'Перейти на следующий тариф',
    btn2: 'Закрыть',
  },
  LIMIT_IMAGES: {
    icon: '🖼️',
    title: 'Лимит картинок исчерпан',
    desc: 'Лимит картинок на этот месяц исчерпан. Чат работает.',
    btn1: 'Перейти на следующий тариф',
    btn2: 'Закрыть',
  },
  LIMIT_VIDEOS: {
    icon: '🎬',
    title: 'Лимит видео исчерпан',
    desc: 'Лимит генераций видео на этот месяц исчерпан. Чат и картинки работают.',
    btn1: 'Перейти на следующий тариф',
    btn2: 'Закрыть',
  },
  LIMIT_VIDEOS_UNAVAILABLE: {
    icon: '🎬',
    title: 'Видео недоступно',
    desc: 'Генерация видео доступна начиная со тарифа Стандарт.',
    btn1: 'Посмотреть тарифы',
    btn2: 'Закрыть',
  },
  LIMIT_MUSIC: {
    icon: '🎵',
    title: 'Лимит треков исчерпан',
    desc: 'Вы использовали все треки на сегодня. Лимит обновится завтра.',
    btn1: 'Перейти на следующий тариф',
    btn2: 'Закрыть',
  },
  LIMIT_MUSIC_UNAVAILABLE: {
    icon: '🎵',
    title: 'Музыка недоступна',
    desc: 'Генерация музыки доступна начиная с тарифа Пробный.',
    btn1: 'Посмотреть тарифы',
    btn2: 'Закрыть',
  },
  FREE_LOCKED: {
    icon: '⚡',
    title: 'Функция недоступна',
    desc: 'Картинки, файлы и видео доступны с платного тарифа.',
    btn1: 'Посмотреть тарифы',
    btn2: 'Закрыть',
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
                onClick={() => { router.push('/billing'); onClose(); }}
                className="w-full py-2.5 px-4 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {cfg.btn1}
              </button>
              <button onClick={onClose} className="text-xs text-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.5)] transition-colors mt-1">
                {cfg.btn2}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
