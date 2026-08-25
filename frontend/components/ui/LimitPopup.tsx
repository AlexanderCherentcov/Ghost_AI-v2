'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { ComponentType } from 'react';
import { ChatIcon, ThinkIcon, AttachIcon, VisionIcon, VideoIcon, MusicIcon, BoltIcon } from '@/components/icons';

export type LimitType =
  | 'LIMIT_MESSAGES'
  | 'LIMIT_PRO_MESSAGES'
  | 'LIMIT_FILES'
  | 'LIMIT_IMAGES'
  | 'LIMIT_VIDEOS'
  | 'LIMIT_VIDEOS_UNAVAILABLE'
  | 'LIMIT_MUSIC'
  | 'LIMIT_MUSIC_UNAVAILABLE'
  | 'FREE_LOCKED'
  | null;

const LIMIT_CONFIG: Record<NonNullable<LimitType>, {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: string;
  btn1: string;
  btn2: string;
}> = {
  LIMIT_MESSAGES: {
    icon: ChatIcon,
    title: 'Сообщения на сегодня закончились',
    desc: 'Лимит бесплатных сообщений на сегодня исчерпан — возвращайтесь завтра или перейдите на платный тариф.',
    btn1: 'Перейти на тариф',
    btn2: 'Закрыть',
  },
  LIMIT_PRO_MESSAGES: {
    icon: ThinkIcon,
    title: 'Недостаточно Caspers',
    desc: 'Бесплатная квота Про чата на сегодня закончилась, а на балансе не хватает Caspers.',
    btn1: 'Пополнить / перейти на тариф',
    btn2: 'Закрыть',
  },
  LIMIT_FILES: {
    icon: AttachIcon,
    title: 'Лимит файлов исчерпан',
    desc: 'Вы использовали все запросы с файлами. Обычный чат работает.',
    btn1: 'Перейти на следующий тариф',
    btn2: 'Закрыть',
  },
  LIMIT_IMAGES: {
    icon: VisionIcon,
    title: 'Недостаточно Caspers',
    desc: 'Для генерации изображений нужны Caspers. Пополните баланс или перейдите на тариф.',
    btn1: 'Перейти на тариф',
    btn2: 'Закрыть',
  },
  LIMIT_VIDEOS: {
    icon: VideoIcon,
    title: 'Недостаточно Caspers',
    desc: 'Для генерации видео нужны Caspers. Пополните баланс или перейдите на тариф.',
    btn1: 'Перейти на тариф',
    btn2: 'Закрыть',
  },
  LIMIT_VIDEOS_UNAVAILABLE: {
    icon: VideoIcon,
    title: 'Видео недоступно',
    desc: 'Генерация видео доступна на платных тарифах.',
    btn1: 'Посмотреть тарифы',
    btn2: 'Закрыть',
  },
  LIMIT_MUSIC: {
    icon: MusicIcon,
    title: 'Недостаточно Caspers',
    desc: 'Для генерации музыки нужны Caspers. Пополните баланс или перейдите на тариф.',
    btn1: 'Перейти на тариф',
    btn2: 'Закрыть',
  },
  LIMIT_MUSIC_UNAVAILABLE: {
    icon: MusicIcon,
    title: 'Музыка недоступна',
    desc: 'Генерация музыки доступна на платных тарифах.',
    btn1: 'Посмотреть тарифы',
    btn2: 'Закрыть',
  },
  FREE_LOCKED: {
    icon: BoltIcon,
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
            <cfg.icon size={28} className="mb-3 text-accent" />
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
