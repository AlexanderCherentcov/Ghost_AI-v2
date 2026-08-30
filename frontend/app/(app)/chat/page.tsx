'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type PlansResponse } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { useToast } from '@/components/ui/Toast';
import { InputBar, type ChatMode } from '@/components/chat/InputBar';
import { getFileCategory } from '@/components/chat/InputBar';
import { ParticleAvatar } from '@/components/ParticleAvatar';
import { modelParticleShape } from '@/lib/model-icons';
import { MODEL_DESCRIPTIONS } from '@/lib/model-descriptions';
import { ChatIcon, ImageIcon, VideoIcon, MusicIcon, MicIcon, CasperCoin } from '@/components/icons';
import { cn, capitalizeFirst } from '@/lib/utils';

// Мокап (Chat.dc.html: quickModeKeys) показывает 4 пилюли включая активный текущий
// режим (chat/video/image/music), без голоса. У нас голос — реальная рабочая фича
// (VoiceWidget), просто выкинуть её нельзя — добавляем пятой пилюлей, чат ставим
// первым и активным по умолчанию, как в мокапе.
const QUICK_MODES: { mode: ChatMode; label: string; Icon: typeof ChatIcon }[] = [
  { mode: 'chat',   label: 'Диалог',   Icon: ChatIcon },
  { mode: 'images', label: 'Картинка', Icon: ImageIcon },
  { mode: 'video',  label: 'Видео',    Icon: VideoIcon },
  { mode: 'music',  label: 'Музыка',   Icon: MusicIcon },
  { mode: 'voice',  label: 'Голос',    Icon: MicIcon },
];

interface DiscoveryItem {
  id: string;
  label: string;
  blurb?: string;
  cost: number;
  // Реальный пример вывода модели — из реестра на бэкенде (backend/src/config/models.ts,
  // поля previewImageUrl/previewVideoUrl). Пока Александр не прислал сэмплы — везде
  // undefined, карточка показывает честную цветную заглушку вместо выдуманной картинки.
  previewImageUrl?: string;
  previewVideoUrl?: string;
}

type DiscoveryDomain = 'chat' | 'image' | 'video';

// Пока нет реальных сэмплов вывода моделей (Александр пришлёт позже) — честная заглушка:
// фон окрашен по домену (чат/картинки/видео), а не выдаёт себя за настоящий output модели.
const DOMAIN_STYLE: Record<DiscoveryDomain, { gradient: string; accent: string }> = {
  chat:  { gradient: 'linear-gradient(155deg, rgba(123,92,240,.32), rgba(14,10,26,.94))', accent: '#a78bfa' },
  image: { gradient: 'linear-gradient(155deg, rgba(45,212,191,.28), rgba(9,22,23,.94))', accent: '#2dd4bf' },
  video: { gradient: 'linear-gradient(155deg, rgba(251,191,36,.28), rgba(26,19,8,.94))', accent: '#fbbf24' },
};

// Продающий лозунг под заголовком каждой секции — по прямому запросу Александра.
const DOMAIN_TAGLINE: Record<DiscoveryDomain, string> = {
  chat: 'Умный собеседник для любых вопросов и задач',
  image: 'Любая идея — за секунды в готовое изображение',
  video: 'От текста до готового ролика — без камеры и монтажа',
};

// Печатает текст по букве, пока карточка под курсором (перезапускается на каждый hover) —
// живая демонстрация чат-модели вместо статичной иконки, по прямому запросу Александра.
function TypingDemo({ text, active }: { text: string; active: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active) { setShown(0); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) clearInterval(id);
    }, 32);
    return () => clearInterval(id);
  }, [active, text]);
  return (
    <p className="text-[11px] leading-snug font-medium text-white text-center px-1">
      {text.slice(0, shown)}
      <span className="inline-block w-[2px] h-[10px] bg-white/80 align-middle ml-0.5 animate-pulse" />
    </p>
  );
}

// Единая квадратная карточка для всех трёх доменов (чат/картинки/видео) — раньше у
// каждого домена карточки были разной высоты, теперь размер строго одинаковый везде.
// Логотип — не плоский SVG в белом чипе, а наша фирменная particle-анимация (та же,
// что в MessageAvatar/typing-индикаторе) — по прямому указанию Александра. Живёт рядом
// с названием модели в подписи (маленький, крутится всегда), а в чат-карточках при
// наведении дублируется крупнее в центре — логотип НАД печатающимся текстом, оба вместе,
// не подменяют друг друга.
const CARD_SIZE = 184;

function DiscoveryCard({ item, domain, onPick, onDetails }: { item: DiscoveryItem; domain: DiscoveryDomain; onPick: (id: string) => void; onDetails: (item: DiscoveryItem) => void }) {
  const [hover, setHover] = useState(false);
  const style = DOMAIN_STYLE[domain];
  const shape = modelParticleShape(item.id);
  const hasDetails = !!MODEL_DESCRIPTIONS[item.id];
  return (
    // div, не button — внутри своя кнопка "Подробнее", вложенные <button> невалидны.
    // role/tabIndex/onKeyDown возвращают ту же клавиатурную доступность, что была у button.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPick(item.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(item.id); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex-shrink-0 snap-start rounded-2xl overflow-hidden text-left transition-transform duration-200 hover:-translate-y-0.5 cursor-pointer"
      style={{ width: 'var(--discovery-card-size, 184px)', height: 'var(--discovery-card-size, 184px)', background: style.gradient, border: '1px solid var(--panel-glass-border)' }}
    >
      {/* Реальный пример вывода модели, когда он есть в реестре — заменяет цветную заглушку
          картинкой/видео. Видео тут же и зациклено, звук выключен (это превью, не плеер). */}
      {domain === 'image' && item.previewImageUrl && (
        <img src={item.previewImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {domain === 'video' && item.previewVideoUrl && (
        <video src={item.previewVideoUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />
      )}

      {item.cost > 0 && (
        <span
          className="absolute top-2.5 right-2.5 z-10 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
          style={{ background: 'rgba(5,3,17,.55)', color: 'var(--accent)' }}
        >
          {item.cost}<CasperCoin size={9} />
        </span>
      )}

      {/* Подробнее — только если для модели реально есть описание (model-descriptions.ts),
          честная деградация вместо пустого попапа. stopPropagation — иначе клик по кнопке
          ещё и выбрал бы модель через onPick на родителе. */}
      {hasDetails && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDetails(item); }}
          className="absolute top-2.5 left-2.5 z-10 text-[10px] font-semibold px-2 py-1 rounded-md transition-colors hover:brightness-125"
          style={{ background: 'rgba(5,3,17,.55)', color: 'rgba(255,255,255,.85)' }}
        >
          Подробнее
        </button>
      )}

      {/* Центр карточки. bottom: 58 — высота подписи снизу, чтобы typing-текст при
          переносе на 2-3 строки не наезжал на неё.
          Чат-домен: логотип виден ВСЕГДА (не только по наведению) — иначе карточка
          выглядит пустой, пока на неё не навести (по прямому указанию Александра).
          По наведению под ним ещё и печатается приветствие. */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center justify-center gap-1.5 px-2.5" style={{ bottom: 58 }}>
        {domain === 'chat' && (
          <>
            <ParticleAvatar shape={shape} size={38} spinSpeed={0.014} />
            {hover && <TypingDemo text={`Привет, я ${item.label}!`} active={hover} />}
          </>
        )}
        {domain !== 'chat' && hover && (
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-out scale-110"
            style={{ background: `radial-gradient(circle at 50% 50%, ${style.accent}4d, transparent 70%)` }}
          >
            {domain === 'video' && (
              <svg width="30" height="30" viewBox="0 0 20 20" style={{ color: style.accent }}>
                <path d="M6 4l10 6-10 6V4z" fill="currentColor" />
              </svg>
            )}
          </div>
        )}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2.5 py-2.5"
        style={{ background: 'linear-gradient(0deg, rgba(5,3,17,.88), transparent)' }}
      >
        <ParticleAvatar shape={shape} size={18} spinSpeed={0.01} className="flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white truncate">{item.label}</div>
          {item.blurb && <div className="text-[10.5px] truncate" style={{ color: 'rgba(255,255,255,.62)' }}>{item.blurb}</div>}
        </div>
      </div>
    </div>
  );
}

// Попап "Подробнее" — превью крупнее, человеческое описание + сильные стороны,
// кнопка "Попробовать" делает то же самое, что клик по самой карточке (onPick),
// только сначала закрывает попап. По образцу ImageViewer.tsx (тот же паттерн
// затемнённого фона на весь экран + AnimatePresence), но с карточкой контента
// по центру вместо самого медиа на весь экран.
function ModelDetailsModal({
  item, domain, onClose, onTry,
}: {
  item: DiscoveryItem | null;
  domain: DiscoveryDomain;
  onClose: () => void;
  onTry: (id: string) => void;
}) {
  useEffect(() => {
    if (!item) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  const info = item ? MODEL_DESCRIPTIONS[item.id] : undefined;
  const style = DOMAIN_STYLE[domain];

  return (
    <AnimatePresence>
      {item && info && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
          style={{ background: 'rgba(0,0,0,0.72)', WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] max-h-[88vh] overflow-y-auto rounded-2xl"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--panel-glass-border)' }}
          >
            {/* Превью крупнее — та же картинка/видео, что на карточке */}
            <div className="relative w-full aspect-[16/10]" style={{ background: style.gradient }}>
              {domain === 'image' && item.previewImageUrl && (
                <img src={item.previewImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {domain === 'video' && item.previewVideoUrl && (
                <video src={item.previewVideoUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />
              )}
              {domain === 'chat' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <ParticleAvatar shape={modelParticleShape(item.id)} size={64} spinSpeed={0.014} />
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(5,3,17,.6)', color: 'white' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              {item.cost > 0 && (
                <span
                  className="absolute bottom-3 right-3 flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-md"
                  style={{ background: 'rgba(5,3,17,.65)', color: 'var(--accent)' }}
                >
                  {item.cost}<CasperCoin size={11} />
                </span>
              )}
            </div>

            <div className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <ParticleAvatar shape={modelParticleShape(item.id)} size={20} spinSpeed={0.01} />
                <h3 className="text-[17px] font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</h3>
              </div>
              {item.blurb && <p className="text-[12px] mb-3" style={{ color: 'var(--text-muted)' }}>{item.blurb}</p>}

              <p className="text-[13.5px] leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                {info.description}
              </p>

              <ul className="space-y-1.5 mb-5">
                {info.strengths.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                    <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: style.accent }} />
                    {s}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => { onTry(item.id); onClose(); }}
                className="w-full h-11 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Попробовать →
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Стрелка слайдера — крупнее и контрастнее стандартных вторичных кнопок, чтобы
// сразу читаться как управление каруселью, а не теряться на фоне карточек
// (по прямому запросу Александра: "карточки должны быть слайдером, и
// переключаться кнопками и свайпом" — свайп уже работал нативно через
// overflow-x-auto+snap, кнопки были, но недостаточно заметны).
function SliderArrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'left' ? 'Прокрутить назад' : 'Прокрутить вперёд'}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95',
        dir === 'left' ? '-left-1 sm:-left-4' : '-right-1 sm:-right-4'
      )}
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--panel-glass-border)', color: 'var(--text-primary)', boxShadow: '0 4px 14px -4px rgba(0,0,0,.5)', WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <path d={dir === 'left' ? 'M12.5 4.5L6 10l6.5 5.5' : 'M7.5 4.5L14 10l-6.5 5.5'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Карточки крупнее — если ряд не помещается по ширине, докручиваем стрелками/свайпом
// вместо переноса на новую строку (по прямому указанию Александра — «слайдер»).
function ModelDiscoveryRow({ title, items, domain, onPick, onDetails }: { title: string; items: DiscoveryItem[]; domain: DiscoveryDomain; onPick: (id: string) => void; onDetails: (item: DiscoveryItem) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      ro.disconnect();
    };
  }, [items.length]);

  function scrollByPage(dir: -1 | 1) {
    scrollerRef.current?.scrollBy({ left: dir * (CARD_SIZE + 24) * 2, behavior: 'smooth' });
  }

  if (!items.length) return null;
  return (
    <div className="relative">
      <div className="text-center mb-4">
        <h2 className="font-display text-[22px] sm:text-[26px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        <p className="text-[13px] sm:text-[14px] mt-1" style={{ color: 'var(--text-secondary)' }}>
          {DOMAIN_TAGLINE[domain]}
        </p>
      </div>
      <div ref={scrollerRef} className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-proximity pb-5">
        {items.map((item) => (
          <DiscoveryCard key={item.id} item={item} domain={domain} onPick={onPick} onDetails={onDetails} />
        ))}
      </div>
      {canLeft && <SliderArrow dir="left" onClick={() => scrollByPage(-1)} />}
      {canRight && <SliderArrow dir="right" onClick={() => scrollByPage(1)} />}
    </div>
  );
}

async function resizeImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ChatPage() {
  const router = useRouter();
  const { show } = useToast();
  const { addChat, model, setModel } = useChatStore();
  const { user } = useAuthStore();
  const [chatMode, setChatMode] = useState<ChatMode>('chat');
  // Восстанавливаем последний режим после монтирования (не лениво в initial-state,
  // чтобы не разойтись с серверным рендером — hydration mismatch). См. тот же
  // приём и подробный комментарий в ChatIdPage.tsx.
  useEffect(() => {
    const stored = localStorage.getItem('ghostline_last_chat_mode') as ChatMode | null;
    if (stored) setChatMode(stored);
  }, []);
  useEffect(() => {
    localStorage.setItem('ghostline_last_chat_mode', chatMode);
  }, [chatMode]);
  // Витрина моделей под инпутом — исчезает, как только человек реально начал
  // действовать: отправил первое сообщение или выбрал модель карточкой. По прямому
  // запросу Александра: не должна висеть под уже занятым диалогом.
  const [showDiscovery, setShowDiscovery] = useState(true);
  // "Ознакомиться" в сайдбаре вызывает requestDiscovery() (ui.store.ts) — счётчик,
  // не булев флаг в sessionStorage, потому что router.push('/chat') на ТОТ ЖЕ
  // маршрут не ремонтирует страницу (Next.js App Router): раньше флаг читался
  // только в mount-эффекте и для пользователя, уже находящегося на /chat, кнопка
  // молча ничего не делала. Эффект с зависимостью на значение счётчика реагирует
  // на каждый клик независимо от того, был ли реальный переход по роуту.
  const discoveryRequestId = useUIStore((s) => s.discoveryRequestId);
  const seenDiscoveryRequestRef = useRef(discoveryRequestId);
  useEffect(() => {
    if (discoveryRequestId === seenDiscoveryRequestRef.current) return;
    seenDiscoveryRequestRef.current = discoveryRequestId;
    setShowDiscovery(true);
    setChatMode('chat');
  }, [discoveryRequestId]);
  // Реестр моделей с бэкенда — для витрины возможностей на пустом экране (см. ниже).
  // Конкуренты (GPTunneL) держат весь список моделей видимым на главном экране, а не
  // только внутри выпадающих пилюль — по прямому указанию Александра, витрина
  // возможностей должна быть видна сразу, не спрятана.
  const [models, setModels] = useState<PlansResponse['models'] | null>(null);
  useEffect(() => {
    api.payments.plans().then((data) => setModels(data.models)).catch(() => {});
  }, []);

  // Клик по карточке в витрине картинок/видео — imageModel/videoOptions.videoModel
  // живут внутри InputBar (не подняты в этот компонент), поэтому пробрасываем выбор
  // через пропс presetImageModel/presetVideoModel (см. InputBar.tsx).
  const [presetImageModel, setPresetImageModel] = useState<string | undefined>();
  const [presetVideoModel, setPresetVideoModel] = useState<string | undefined>();

  // Попап "Подробнее" — модель + домен, к которому она относится (нужен для
  // правильного onPick при клике "Попробовать" внутри попапа).
  const [detailsItem, setDetailsItem] = useState<{ item: DiscoveryItem; domain: DiscoveryDomain } | null>(null);
  function pickModel(domain: DiscoveryDomain, id: string) {
    // chatMode тоже переставляем, не только сам id модели — иначе если он остался
    // с прошлого визита (localStorage:ghostline_last_chat_mode) не тем доменом,
    // композер откроется в чужом режиме, молча игнорируя только что выбранную
    // карточку (например выбрали чат-модель, а InputBar остался в видео-режиме).
    if (domain === 'chat') { setModel(id); setChatMode('chat'); }
    else if (domain === 'image') { setPresetImageModel(id); setChatMode('images'); }
    else { setPresetVideoModel(id); setChatMode('video'); }
    setShowDiscovery(false);
  }

  const name = user?.name?.split(' ')[0] ?? 'Ghost';
  const firstName = capitalizeFirst(name);

  // Сбрасываем активный чат, чтобы сайдбар не подсвечивал устаревший чат
  useEffect(() => {
    sessionStorage.removeItem('newChat');
    useChatStore.getState().setActiveChat(null);
    useChatStore.getState().setMessages([]);
  }, []);

  async function handleSend(prompt: string, file?: File, videoOptions?: import('@/components/chat/InputBar').VideoOptions, musicMode?: import('@/components/chat/InputBar').MusicMode, musicDuration?: number, sunoStyle?: string, sunoTitle?: string, sunoInstrumental?: boolean, lyrics?: string, imageModel?: string, imageAspectRatio?: string) {
    setShowDiscovery(false);
    let chat: Awaited<ReturnType<typeof api.chats.create>>;
    try {
      chat = await api.chats.create({ mode: 'chat' });
    } catch (err: any) {
      show(err.message ?? 'Не удалось создать чат, попробуйте ещё раз', 'error');
      return;
    }
    addChat(chat);

    // Режим видео — сохраняем промпт и переходим
    if (chatMode === 'video') {
      sessionStorage.setItem('initialVideoPrompt', prompt);
      if (videoOptions) sessionStorage.setItem('initialVideoOptions', JSON.stringify(videoOptions));
      router.push(`/chat/${chat.id}`);
      return;
    }

    // Режим музыки — сохраняем промпт и переходим
    if (chatMode === 'music') {
      sessionStorage.setItem('initialMusicPrompt', prompt);
      if (musicMode) sessionStorage.setItem('initialMusicMode', musicMode);
      if (musicDuration) sessionStorage.setItem('initialMusicDuration', String(musicDuration));
      if (lyrics) sessionStorage.setItem('initialLyrics', lyrics);
      if (sunoStyle) sessionStorage.setItem('initialSunoStyle', sunoStyle);
      if (sunoTitle) sessionStorage.setItem('initialSunoTitle', sunoTitle);
      if (sunoInstrumental !== undefined) sessionStorage.setItem('initialSunoInstrumental', String(sunoInstrumental));
      router.push(`/chat/${chat.id}`);
      return;
    }

    // Режим изображений — всегда генерируем картинку
    if (chatMode === 'images' && !file) {
      sessionStorage.setItem('initialImagePrompt', prompt || 'beautiful landscape');
      if (imageModel) sessionStorage.setItem('initialImageModel', imageModel);
      if (imageAspectRatio) sessionStorage.setItem('initialImageAspectRatio', imageAspectRatio);
      router.push(`/chat/${chat.id}`);
      return;
    }

    sessionStorage.setItem('initialPrompt', prompt);

    if (file) {
      const category = getFileCategory(file);
      sessionStorage.setItem('initialFileName', file.name);
      if (category === 'image') {
        try {
          sessionStorage.setItem('initialImageUrl', await resizeImageToBase64(file));
        } catch {}
      } else if (category === 'text') {
        try {
          const text = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onerror = rej;
            r.onload = (e) => res(e.target!.result as string);
            r.readAsText(file, 'utf-8');
          });
          sessionStorage.setItem('initialFileContent', text.slice(0, 60_000));
          sessionStorage.setItem('initialFileLang', file.name.split('.').pop()?.toLowerCase() ?? 'text');
        } catch {}
      } else {
        sessionStorage.setItem('initialBinaryFileUrl', URL.createObjectURL(file));
        sessionStorage.setItem('initialFileMime', file.type);
      }
    }
    router.push(`/chat/${chat.id}`);
  }

  // Голос записывается ДО того, как чат создан — реле через sessionStorage, как у
  // остальных медиа-режимов (initialImageUrl/initialBinaryFileUrl используют тот же
  // приём: blob-URL переживает клиентскую SPA-навигацию на /chat/[id]).
  async function handleVoiceRecording(file: File) {
    let chat: Awaited<ReturnType<typeof api.chats.create>>;
    try {
      chat = await api.chats.create({ mode: 'chat' });
    } catch (err: any) {
      show(err.message ?? 'Не удалось создать чат, попробуйте ещё раз', 'error');
      throw err;
    }
    addChat(chat);
    sessionStorage.setItem('initialVoiceAudioUrl', URL.createObjectURL(file));
    sessionStorage.setItem('initialVoiceAudioType', file.type);
    router.push(`/chat/${chat.id}`);
  }

  const placeholder = chatMode === 'images'
    ? 'Опишите изображение...'
    : chatMode === 'video'
      ? 'Опишите видео...'
      : chatMode === 'music'
        ? 'Опишите стиль или настроение музыки...'
        : 'Спросите что-нибудь у GhostLine...';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Два раздельных экрана, не наложение композера и витрины — по прямому
          уточнению Александра: пока не решил, что делать, виден ТОЛЬКО грид моделей
          с кнопкой "Начать творить" наверху (поле ввода спрятано); как только
          нажал "Начать творить", выбрал карточку или "Попробовать" в попапе —
          витрина исчезает и её место навсегда (до следующего явного "Ознакомиться"
          в сайдбаре) занимает обычный композер, независимо от выбранного режима. */}
      <AnimatePresence mode="wait">
        {showDiscovery ? (
          <motion.div
            key="discovery"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 }}
            className="flex-1 min-h-0 flex flex-col"
          >
            <div className="w-full max-w-[480px] mx-auto text-center flex-shrink-0 px-6 pt-8 [@media(max-height:560px)]:pt-3">
              <div className="[@media(max-height:560px)]:hidden">
                <h1 className="font-display text-[clamp(22px,5vw,36px)] font-semibold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
                  Здравствуйте, {firstName}!
                </h1>
                <p className="text-lg mb-5" style={{ color: 'var(--text-secondary)' }}>
                  С чего начнём?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDiscovery(false)}
                className="inline-flex items-center gap-2.5 px-9 h-14 rounded-2xl text-base sm:text-lg font-bold transition-transform hover:scale-[1.03] active:scale-[0.98]"
                style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 8px 24px -6px var(--accent-border)' }}
              >
                Начать творить →
              </button>
            </div>

            {/* Витрина возможностей — реальные модели с бэкенда, все домены сразу
                (структура GPTunneL), не спрятаны за пилюлями. */}
            {models && (
              <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-6 pb-6 [@media(max-height:560px)]:pt-2 [@media(max-height:560px)]:pb-3 [@media(max-height:560px)]:[--discovery-card-size:128px]">
                <div className="w-full space-y-10 [@media(max-height:560px)]:space-y-4">
                  <ModelDiscoveryRow
                    title="Чат"
                    domain="chat"
                    items={models.chat.filter((m) => m.id !== 'llama-3.1-fast')}
                    onPick={(id) => pickModel('chat', id)}
                    onDetails={(item) => setDetailsItem({ item, domain: 'chat' })}
                  />
                  <ModelDiscoveryRow
                    title="Картинки"
                    domain="image"
                    items={models.image}
                    onPick={(id) => pickModel('image', id)}
                    onDetails={(item) => setDetailsItem({ item, domain: 'image' })}
                  />
                  <ModelDiscoveryRow
                    title="Видео"
                    domain="video"
                    // VideoModelOption.cost зависит от длительности ({'4s','8s'}), а витрина
                    // (DiscoveryItem) показывает один бейдж — берём цену за короткий ролик
                    // (4с) как отправную «от», как и в других местах UI.
                    items={models.video.map((m) => ({ ...m, cost: m.cost['4s'] }))}
                    onPick={(id) => pickModel('video', id)}
                    onDetails={(item) => setDetailsItem({ item, domain: 'video' })}
                  />
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="composer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="flex-1 min-h-0 flex flex-col justify-end px-6 pb-6"
          >
            <div className="w-full max-w-[480px] mx-auto text-center mb-2">
              <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                {QUICK_MODES.map(({ mode, label, Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChatMode((m) => (m === mode ? 'chat' : mode))}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all"
                    style={
                      chatMode === mode
                        ? { background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: '#e3ddfa' }
                        : { background: 'var(--panel-glass)', border: '1px solid var(--panel-glass-border)', color: 'var(--text-secondary)' }
                    }
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <InputBar
              onSend={handleSend}
              onVoiceRecording={handleVoiceRecording}
              placeholder={placeholder}
              model={model}
              setModel={setModel}
              userPlan={user?.plan}
              onUpgradeRequired={() => router.push('/billing')}
              chatMode={chatMode}
              setChatMode={setChatMode}
              presetImageModel={presetImageModel}
              presetVideoModel={presetVideoModel}
              userImages={user?.images_this_week}
              userMusic={user?.music_this_week}
              userVideos={user?.videos_this_month}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ModelDetailsModal
        item={detailsItem?.item ?? null}
        domain={detailsItem?.domain ?? 'chat'}
        onClose={() => setDetailsItem(null)}
        onTry={(id) => pickModel(detailsItem!.domain, id)}
      />
    </div>
  );
}
