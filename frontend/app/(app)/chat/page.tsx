'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type PlansResponse } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/Toast';
import { InputBar, type ChatMode } from '@/components/chat/InputBar';
import { getFileCategory } from '@/components/chat/InputBar';
import { ParticleAvatar } from '@/components/ParticleAvatar';
import { modelParticleShape } from '@/lib/model-icons';
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

function DiscoveryCard({ item, domain, onPick }: { item: DiscoveryItem; domain: DiscoveryDomain; onPick: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const style = DOMAIN_STYLE[domain];
  const shape = modelParticleShape(item.id);
  return (
    <button
      type="button"
      onClick={() => onPick(item.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex-shrink-0 snap-start rounded-2xl overflow-hidden text-left transition-transform duration-200 hover:-translate-y-0.5"
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
    </button>
  );
}

// Стрелка слайдера — то же кольцо, что у остальных вторичных кнопок в composer'е.
function SliderArrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'left' ? 'Прокрутить назад' : 'Прокрутить вперёд'}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-colors',
        dir === 'left' ? '-left-3' : '-right-3'
      )}
      style={{ background: 'var(--panel-glass-sidebar)', border: '1px solid var(--panel-glass-border)', color: 'var(--text-primary)', WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
        <path d={dir === 'left' ? 'M12.5 4.5L6 10l6.5 5.5' : 'M7.5 4.5L14 10l-6.5 5.5'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Карточки крупнее — если ряд не помещается по ширине, докручиваем стрелками/свайпом
// вместо переноса на новую строку (по прямому указанию Александра — «слайдер»).
function ModelDiscoveryRow({ title, items, domain, onPick }: { title: string; items: DiscoveryItem[]; domain: DiscoveryDomain; onPick: (id: string) => void }) {
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
      <div className="text-[11.5px] font-bold tracking-wide mb-3 text-center" style={{ color: 'var(--text-muted)' }}>
        {title.toUpperCase()}
      </div>
      <div ref={scrollerRef} className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-proximity pb-5">
        {items.map((item) => (
          <DiscoveryCard key={item.id} item={item} domain={domain} onPick={onPick} />
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
      {/* Заголовок, режимные пилюли и поле ввода — единый блок, который framer-motion
          плавно переставляет по layout при исчезновении витрины ниже. Пока витрина
          видна — блок держится сверху (структура GPTunneL: composer сразу под шапкой).
          Как только витрина пропала (отправили/выбрали модель) — блоку некуда больше
          прижиматься сверху, отдаём ему flex-1 justify-end, и он плавно уезжает к низу
          экрана, как обычный чат — по прямому указанию Александра. */}
      <motion.div layout transition={{ type: 'spring', stiffness: 300, damping: 32 }} className={showDiscovery && chatMode === 'chat' ? 'flex-shrink-0 px-6 pt-8 [@media(max-height:560px)]:pt-3' : 'flex-1 min-h-0 flex flex-col justify-end px-6 pb-6'}>
        <div className="w-full max-w-[480px] mx-auto text-center">
          {/* На низких экранах (телефон в альбомной ориентации) приветствие скрываем —
              оно чисто декоративное, а место критично нужно под витрину карточек ниже,
              которая иначе сжимается в непроходимую щель. */}
          <div className="[@media(max-height:560px)]:hidden">
            <h1 className="font-display text-[clamp(22px,5vw,36px)] font-semibold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
              Здравствуйте, {firstName}!
            </h1>
            <p className="text-lg mb-6" style={{ color: 'var(--text-secondary)' }}>
              С чего начнём?
            </p>
          </div>

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

      {/* Витрина возможностей под инпутом — реальные модели с бэкенда, видны сразу,
          не спрятаны за пилюлями (структура GPTunneL). Только для режима «Чат» — это
          стартовое меню для того, кто ещё не решил, что делать. Как только выбрана
          Картинка/Видео — цель уже понятна, и модель выбирается прямо в поле ввода
          (виджет с пикером модели + панель настроек), витрина снизу там просто дублирует
          то же самое и только мешает. Раньше показывался ряд по активному режиму (менялся
          при переключении пилюль), но для картинок/видео это выглядело как «карточки не
          пропадают» — по прямому указанию Александра теперь для них витрины нет вовсе. */}
      <AnimatePresence>
        {models && showDiscovery && chatMode === 'chat' && (
          <motion.div
            key="discovery"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.3 }}
            className="flex-1 min-h-0 overflow-y-auto px-6 pt-5 pb-6 [@media(max-height:560px)]:pt-2 [@media(max-height:560px)]:pb-3 [@media(max-height:560px)]:[--discovery-card-size:128px]"
          >
            {/* Без max-w — секция растягивается на весь доступный контейнер (по прямому
                указанию Александра), а не зажата в узкую колонку под заголовком. */}
            <div className="w-full space-y-10 [@media(max-height:560px)]:space-y-4">
              <ModelDiscoveryRow
                title="Чат"
                domain="chat"
                items={models.chat.filter((m) => m.id !== 'llama-3.1-fast')}
                onPick={(id) => { setModel(id); setShowDiscovery(false); }}
              />
              <ModelDiscoveryRow
                title="Картинки"
                domain="image"
                items={models.image}
                onPick={(id) => { setPresetImageModel(id); setShowDiscovery(false); }}
              />
              <ModelDiscoveryRow
                title="Видео"
                domain="video"
                // VideoModelOption.cost зависит от длительности ({'4s','8s'}), а витрина
                // (DiscoveryItem) показывает один бейдж — берём цену за короткий ролик
                // (4с) как отправную «от», как и в других местах UI.
                items={models.video.map((m) => ({ ...m, cost: m.cost['4s'] }))}
                onPick={(id) => { setPresetVideoModel(id); setShowDiscovery(false); }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
