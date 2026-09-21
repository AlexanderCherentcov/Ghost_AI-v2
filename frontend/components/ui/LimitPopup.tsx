'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { ComponentType } from 'react';
import { lockedModelText } from '@/lib/plan-lock-text';
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
  | 'MODEL_LOCKED'
  | null;

/** Что именно закрыто тарифом — подставляется в текст попапа MODEL_LOCKED. */
export interface UpgradeInfo {
  modelLabel?: string;
  minPlan?: string;
}

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
    title: 'Недоступно на бесплатном тарифе',
    desc: 'На бесплатном тарифе доступен только чат. Картинки, видео, музыка и файлы открываются на платных тарифах.',
    btn1: 'Посмотреть тарифы',
    btn2: 'Закрыть',
  },
  MODEL_LOCKED: {
    icon: BoltIcon,
    title: 'Модель недоступна на вашем тарифе',
    desc: 'Эта модель открывается на более высоком тарифе.',
    btn1: 'Посмотреть тарифы',
    btn2: 'Закрыть',
  },
};

interface Props {
  type: LimitType;
  onClose: () => void;
  /** Что закрыто тарифом — для типа MODEL_LOCKED. */
  upgrade?: UpgradeInfo | null;
  userPlan?: string;
}

export function LimitPopup({ type, onClose, upgrade, userPlan }: Props) {
  const router = useRouter();

  if (!type) return null;
  const cfg = LIMIT_CONFIG[type];
  const desc = type === 'MODEL_LOCKED' ? lockedModelText(upgrade?.modelLabel, upgrade?.minPlan, userPlan) : cfg.desc;

  return (
    <AnimatePresence>
      {type && (
        // Центрирование — flex-контейнером, а не translate(-50%, -50%): framer-motion пишет свой inline
        // transform (scale/y) и затирал Tailwind-translate, из-за чего на телефоне карточка уезжала
        // за правый/нижний край экрана. Контейнер ещё и не даёт карточке выйти за экран по высоте.
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative w-full max-w-[360px] max-h-[calc(100dvh-2rem)] overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl"
          >
            <cfg.icon size={28} className="mb-3 text-accent" />
            <h3 className="text-white font-medium text-base mb-1">{cfg.title}</h3>
            <p className="text-[rgba(255,255,255,0.6)] text-sm mb-5">{desc}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { router.push('/billing'); onClose(); }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {cfg.btn1}
              </button>
              <button onClick={onClose} className="min-h-[44px] text-xs text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">
                {cfg.btn2}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
