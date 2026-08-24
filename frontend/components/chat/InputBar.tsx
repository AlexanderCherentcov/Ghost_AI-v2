'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SendIcon, ChatIcon, ImageIcon, VideoIcon, MusicIcon, MicIcon, AttachIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { api, type ChatModelOption, type ImageModelOption, type VideoModelOption } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

import { ACCEPT, getFileCategory, fileIconFor, formatSize } from './inputbar/fileHelpers';
import type { VideoOptions, MusicMode, MusicOptions, ChatMode } from './inputbar/types';
import { DEFAULT_CASPER_COSTS, calcCaspers, getCostDisplay } from './inputbar/costs';
import type { CasperCosts, CostDisplay } from './inputbar/costs';
import { CostBadge } from './inputbar/CostBadge';
import { CustomSelect } from './inputbar/CustomSelect';
import { VideoWidget } from './inputbar/VideoWidget';
import { MusicWidget } from './inputbar/MusicWidget';
import { ImageWidget } from './inputbar/ImageWidget';
import { VoiceWidget } from './inputbar/VoiceWidget';
import { ModelPill } from './inputbar/ModelPill';

// Реэкспорт — компонент раньше был одним файлом, снаружи на эти имена
// (ChatIdPage.tsx, app/chat/page.tsx, InputBar.test.ts) уже есть импорты
// из '@/components/chat/InputBar'; после разбивки на модули они продолжают работать.
export type { FileCategory } from './inputbar/fileHelpers';
export { getFileCategory };
export type { VideoOptions, MusicMode, MusicOptions, ChatMode };
export type { CasperCosts, CostDisplay };
export { DEFAULT_CASPER_COSTS, calcCaspers };

// Дефолты — совпадают с DEFAULT_VIDEO_MODEL_ID / DEFAULT_IMAGE_MODEL_ID в backend/src/config/models.ts
// (единственное место, где эти id реально определены). Используются только пока
// /plans не загрузился — как только пришёл реальный список моделей, ими не рулим.
const FALLBACK_VIDEO_MODEL_ID = 'kling-v2.5';
const FALLBACK_IMAGE_MODEL_ID = 'gemini-flash-image';

// Последний выбор модели картинки/видео — переживает перезагрузку страницы.
// Раньше imageModel/videoOptions.videoModel были чистым useState без персиста:
// любой рефреш откатывал выбор пользователя (например GPT Image) обратно на
// дефолт молча, без обратной связи — выглядело как "модель сама поменялась".
const IMAGE_MODEL_STORAGE_KEY = 'ghostline_last_image_model';
const VIDEO_MODEL_STORAGE_KEY = 'ghostline_last_video_model';

// Диспетчер (/dispatch) предлагает видео в упрощённом трёхуровневом словаре
// motion/cinema/reality — это его собственная классификация "на глаз", не список
// моделей. Переводим её в реальный id реестра, только когда пользователь принимает подсказку.
function dispatchQualityToModelId(quality: unknown): string {
  if (quality === 'cinema') return 'veo-3.1-pro';
  if (quality === 'reality') return 'kling-v2.5';
  return 'veo-3.1-standard'; // motion / не задано
}

// ─── Основной компонент ───────────────────────────────────────────────────────

interface InputBarProps {
  onSend: (
    prompt: string,
    file?: File,
    videoOptions?: VideoOptions,
    musicMode?: MusicMode,
    musicDuration?: number,
    sunoStyle?: string,
    sunoTitle?: string,
    sunoInstrumental?: boolean,
    lyrics?: string,
    imageModel?: string,
    imageAspectRatio?: string,
  ) => void;
  /** Голосовой чат: получает записанный файл, сам занимается загрузкой/распознаванием/ответом/озвучкой. */
  onVoiceRecording?: (file: File) => Promise<void>;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  model?: string;
  setModel?: (id: string) => void;
  userPlan?: string;
  onUpgradeRequired?: () => void;
  chatMode?: ChatMode;
  setChatMode?: (m: ChatMode) => void;
  // Автозаполнение от диспетчера, приходит от родителя
  dispatchResult?: { category: string; autoFill: Record<string, unknown> } | null;
  // Явный выбор модели картинки/видео извне (например, клик по карточке в витрине
  // на главной чата) — imageModel/videoOptions.videoModel живут внутри InputBar,
  // родитель не может обратиться к ним напрямую, поэтому прокидываем через пропс
  // + useEffect, тем же способом, что и dispatchResult выше.
  presetImageModel?: string;
  presetVideoModel?: string;
  // Уведомляет родителя об изменениях ввода (для дебаунс-диспетчера)
  onInputChange?: (text: string) => void;
  // Заполняет textarea внешним значением промта (например, кнопкой "Использовать этот промт")
  fillPrompt?: string;
  // Текущие счётчики использования пользователя (для отображения лимита FREE-тарифа)
  userImages?: number;            // images_this_week
  userMusic?: number;             // music_this_week
  userVideos?: number;            // videos_this_month
}

export function InputBar({
  onSend, onVoiceRecording, onStop, disabled = false, isStreaming = false,
  placeholder, model, setModel, userPlan, onUpgradeRequired,
  chatMode = 'chat', setChatMode,
  dispatchResult,
  presetImageModel, presetVideoModel,
  onInputChange,
  fillPrompt,
  userImages, userMusic, userVideos,
}: InputBarProps) {
  const { show } = useToast();
  const [value, setValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [generatingLyrics, setGeneratingLyrics] = useState(false);

  // Стоимость операций в Caspers — с бэкенда (GET /plans), DEFAULT_CASPER_COSTS
  // используется только как запасной вариант, пока запрос не завершился.
  const [casperCosts, setCasperCosts] = useState<CasperCosts>(DEFAULT_CASPER_COSTS);
  const [chatModels, setChatModels] = useState<ChatModelOption[]>([]);
  const [videoModels, setVideoModels] = useState<VideoModelOption[]>([]);
  const [imageModels, setImageModels] = useState<ImageModelOption[]>([]);
  useEffect(() => {
    api.payments.plans().then((data) => {
      setCasperCosts(data.casper_costs);
      setChatModels(data.models.chat);
      setVideoModels(data.models.video);
      setImageModels(data.models.image);
    }).catch(() => {});
  }, []);
  const [videoOptions, setVideoOptions] = useState<VideoOptions>({
    videoModel: FALLBACK_VIDEO_MODEL_ID,
    duration: '8s',
    aspectRatio: '16:9',
    enableAudio: false,
    resolution: '720p',
    negativePrompt: '',
  });

  const [imageModel, setImageModel] = useState(FALLBACK_IMAGE_MODEL_ID);
  // Реально применяется только у Gemini-семейства (см. lib/image-model-params.ts) —
  // undefined для остальных моделей, провайдер сам выбирает соотношение.
  const [imageAspectRatio, setImageAspectRatio] = useState<string | undefined>(undefined);

  // Восстанавливаем последний выбор модели ПОСЛЕ монтирования (не в initial-state
  // лениво) — иначе серверный рендер (дефолт) разойдётся с клиентским (значение
  // из localStorage) и React пожалуется на hydration mismatch. Тот же приём, что
  // и у persist в chat.store.ts (skipHydration + ручная гидратация в providers.tsx).
  useEffect(() => {
    const storedImageModel = localStorage.getItem(IMAGE_MODEL_STORAGE_KEY);
    if (storedImageModel) setImageModel(storedImageModel);
    const storedVideoModel = localStorage.getItem(VIDEO_MODEL_STORAGE_KEY);
    if (storedVideoModel) setVideoOptions((prev) => ({ ...prev, videoModel: storedVideoModel }));
  }, []);
  useEffect(() => {
    localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, imageModel);
  }, [imageModel]);
  useEffect(() => {
    localStorage.setItem(VIDEO_MODEL_STORAGE_KEY, videoOptions.videoModel);
  }, [videoOptions.videoModel]);

  const [musicOptions, setMusicOptions] = useState<MusicOptions>({
    title: '',
    style: '',
    instrumental: false,
    lyrics: '',
  });

  // Возможности выбранной модели в каждом домене — нужны, чтобы не давать
  // прикрепить картинку/фото к модели, которая физически не умеет её обработать
  // (бэкенд эту же проверку уже делает — VisionNotSupportedError в ai-router.ts,
  // MODEL_NO_EDIT/MODEL_NO_IMG2VIDEO в routes/generate.ts — здесь дублируем для
  // UX, чтобы пользователь не получал ошибку постфактум, а не как единственную защиту).
  // 'auto' — не модель из CHAT_MODELS, а диспетчер (ai-router.ts), который сам
  // подбирает vision-модель при картинке, поэтому для него вложения всегда разрешены.
  const selectedChatModel = chatModels.find((m) => m.id === model);
  const chatSupportsVision = model === 'auto' || !!selectedChatModel?.capabilities.vision;
  const selectedImageModel = imageModels.find((m) => m.id === imageModel);
  const selectedVideoSpec = videoModels.find((m) => m.id === videoOptions.videoModel);
  const imageAttachBlockedReason = selectedImageModel && !selectedImageModel.capabilities.edit
    ? `«${selectedImageModel.label}» не поддерживает редактирование по фото — выберите другую модель`
    : null;
  const videoAttachBlockedReason = selectedVideoSpec && !selectedVideoSpec.capabilities.imageToVideo
    ? `«${selectedVideoSpec.label}» не поддерживает добавление фото`
    : null;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  // Применяем автозаполнение от диспетчера
  useEffect(() => {
    if (!dispatchResult) return;
    const { category, autoFill } = dispatchResult;

    if (category === 'music' && setChatMode) {
      setChatMode('music');
      setMusicOptions((prev) => ({
        ...prev,
        title: (autoFill.title as string) || prev.title,
        style: (autoFill.style as string) || prev.style,
        instrumental: typeof autoFill.instrumental === 'boolean' ? autoFill.instrumental : prev.instrumental,
      }));
    } else if (category === 'video' && setChatMode) {
      setChatMode('video');
      setVideoOptions((prev) => ({
        ...prev,
        videoModel: autoFill.quality ? dispatchQualityToModelId(autoFill.quality) : prev.videoModel,
        duration: (['4s','8s'].includes(autoFill.duration as string)
          ? autoFill.duration as '4s' | '8s' : prev.duration),
      }));
    } else if (category === 'image' && setChatMode) {
      setChatMode('images');
    } else if (category === 'search' && setChatMode) {
      // Остаёмся в режиме чата — поиск обрабатывается маршрутизацией на бэкенде
    }
  }, [dispatchResult]);

  // Клик по карточке модели в витрине на главной чата — переключает режим и
  // сразу выставляет выбранную модель (аналог выбора модели чата, setModel(id)).
  useEffect(() => {
    if (!presetImageModel) return;
    setChatMode?.('images');
    setImageModel(presetImageModel);
  }, [presetImageModel, setChatMode]);

  useEffect(() => {
    if (!presetVideoModel) return;
    setChatMode?.('video');
    setVideoOptions((prev) => ({ ...prev, videoModel: presetVideoModel }));
  }, [presetVideoModel, setChatMode]);

  // Если пользователь уже прикрепил файл, а затем сменил модель/режим на не умеющую
  // его обработать (например, переключился со Стандартной Gemini на Llama без vision,
  // или с Kling 2.5 на Sora) — снимаем вложение сразу, а не оставляем его
  // висеть до отправки, где оно всё равно будет отклонено бэкендом.
  useEffect(() => {
    if (!attachedFile) return;
    if (chatMode === 'chat' && getFileCategory(attachedFile) === 'image' && !chatSupportsVision) {
      setAttachedFile(null);
      show('Вложение снято — выбранная модель не распознаёт изображения', 'warning');
    } else if (chatMode === 'images' && imageAttachBlockedReason) {
      setAttachedFile(null);
      show('Вложение снято — выбранная модель не поддерживает редактирование по фото', 'warning');
    } else if (chatMode === 'video' && videoAttachBlockedReason) {
      setAttachedFile(null);
      show('Вложение снято — выбранная модель не поддерживает добавление фото', 'warning');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, imageModel, videoOptions.videoModel, chatMode]);

  // Заполняем textarea, когда родитель передаёт промт через кнопку "Использовать этот промт"
  const prevFillRef = useRef<string | undefined>();
  useEffect(() => {
    if (!fillPrompt || fillPrompt === prevFillRef.current) return;
    prevFillRef.current = fillPrompt;
    setValue(fillPrompt);
    // Пересчитываем размер после обновления состояния
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
        ta.focus();
      }
    });
  }, [fillPrompt]);

  function adjustHeight() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }

  function handleSend() {
    const trimmed = value.trim();
    if ((!trimmed && !attachedFile) || disabled || sendingRef.current) return;
    sendingRef.current = true;

    if (chatMode === 'video') {
      // Прикреплённая картинка → источник для image-to-video
      onSend(trimmed, attachedFile ?? undefined, videoOptions);
    } else if (chatMode === 'music') {
      // Приводим к старой сигнатуре: prompt=описание стиля, sunoTitle, sunoStyle, sunoInstrumental, lyrics
      onSend(
        trimmed || musicOptions.style || musicOptions.title || 'создай трек',
        undefined, undefined,
        'suno', undefined,
        musicOptions.style || undefined,
        musicOptions.title || undefined,
        musicOptions.instrumental,
        musicOptions.lyrics || undefined,
      );
    } else if (chatMode === 'images') {
      onSend(trimmed, attachedFile ?? undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, imageModel, imageAspectRatio);
    } else {
      onSend(trimmed, attachedFile ?? undefined);
    }

    setValue('');
    setAttachedFile(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTimeout(() => { sendingRef.current = false; }, 500);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // Документы в чате не требуют vision — блокируем только КАРТИНКИ для модели без него.
    if (chatMode === 'chat' && getFileCategory(file) === 'image' && !chatSupportsVision) {
      show(`Модель «${selectedChatModel?.label ?? ''}» не распознаёт изображения — выберите «Авто» или модель с поддержкой картинок`, 'error');
      return;
    }
    if (chatMode === 'images' && imageAttachBlockedReason) {
      show(imageAttachBlockedReason, 'error');
      return;
    }
    if (chatMode === 'video' && videoAttachBlockedReason) {
      show(videoAttachBlockedReason, 'error');
      return;
    }
    setAttachedFile(file);
  }

  async function handleGenerateLyrics() {
    if (generatingLyrics) return;
    const topic = value.trim() || musicOptions.title || musicOptions.style;
    if (!topic) return;
    setGeneratingLyrics(true);
    try {
      const { lyrics } = await api.generate.lyrics({
        topic,
        style: musicOptions.style || undefined,
        instrumental: musicOptions.instrumental,
      });
      setMusicOptions((prev) => ({ ...prev, lyrics }));
    } catch (err: any) {
      show(err.message ?? 'Не удалось сгенерировать текст песни', 'error');
    } finally {
      setGeneratingLyrics(false);
    }
  }

  function toggleMode(mode: ChatMode) {
    if (!setChatMode) return;
    setChatMode(chatMode === mode ? 'chat' : mode);
  }

  const hasContent = value.trim() || attachedFile;
  const toolbarCost = getCostDisplay(chatMode, videoOptions, casperCosts, userPlan, userImages, userMusic, userVideos, selectedChatModel, selectedImageModel, videoModels);
  const category = attachedFile ? getFileCategory(attachedFile) : null;

  const activePlaceholder = chatMode === 'images'
    ? 'Опишите изображение...'
    : chatMode === 'video'
      ? 'Опишите сцену для видео...'
      : chatMode === 'music'
        ? 'Опишите настроение или стиль...'
        : placeholder ?? 'Напишите что-нибудь...';

  const modeSelector = (
    <CustomSelect<ChatMode>
      value={chatMode}
      onChange={(m) => { if (m === 'chat') setChatMode?.('chat'); else toggleMode(m); }}
      options={[
        { value: 'chat',   label: 'Чат',      icon: <ChatIcon  size={13}/> },
        { value: 'images', label: 'Картинка', icon: <ImageIcon size={13}/> },
        { value: 'video',  label: 'Видео',    icon: <VideoIcon size={13}/> },
        { value: 'music',  label: 'Музыка',   icon: <MusicIcon size={13}/> },
        { value: 'voice',  label: 'Голос',    icon: <MicIcon   size={13}/> },
      ]}
    />
  );

  return (
    <div className="flex-shrink-0 px-4 pt-2 pb-0 lg:pb-4">
      <div className="max-w-[720px] mx-auto">

        {/* Выезжающие виджеты — свой скролл, чтобы на короткой высоте окна не выталкивать
            текстовое поле и кнопку отправки за пределы экрана. */}
        <div className="max-h-[45vh] overflow-y-auto">
        <AnimatePresence>
          {chatMode === 'video' && (
            <VideoWidget
              key="video-widget"
              options={videoOptions}
              onChange={setVideoOptions}
              userPlan={userPlan}
              userVideos={userVideos}
              casperCosts={casperCosts}
              videoModels={videoModels}
              onUpgradeRequired={onUpgradeRequired}
            />
          )}
          {chatMode === 'music' && (
            <MusicWidget
              key="music-widget"
              options={musicOptions}
              onChange={setMusicOptions}
              onGenerateLyrics={handleGenerateLyrics}
              generatingLyrics={generatingLyrics}
              topic={value.trim() || musicOptions.title || musicOptions.style}
              userPlan={userPlan}
              userMusic={userMusic}
              casperCosts={casperCosts}
            />
          )}
          {chatMode === 'images' && (
            <ImageWidget
              key="image-widget"
              userPlan={userPlan}
              userImages={userImages}
              casperCosts={casperCosts}
              imageModels={imageModels}
              imageModel={imageModel}
              setImageModel={setImageModel}
              aspectRatio={imageAspectRatio}
              setAspectRatio={setImageAspectRatio}
              onUpgradeRequired={onUpgradeRequired}
            />
          )}
          {chatMode === 'voice' && (
            <VoiceWidget
              key="voice-widget"
              casperCosts={casperCosts}
              disabled={disabled}
              onRecordingComplete={onVoiceRecording ?? (async () => {})}
            />
          )}
        </AnimatePresence>
        </div>

        {/* Подсказка сменить модель — намерение поиска или документ на бесплатной модели.
            Это предложение, не подмена: клик ставит конкретную видимую модель в пилюле,
            ничего не списывается и не переключается втихую. */}
        <AnimatePresence>
          {chatMode === 'chat' && model !== 'sonar' && model !== 'deepseek-v3.2' && setModel && (
            (dispatchResult?.category === 'search') ||
            (attachedFile && category !== 'image')
          ) && (
            <motion.div
              key="pro-hint"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-between gap-3 mb-2 px-3 py-2 rounded-xl border"
              style={{ background: 'rgba(123,92,240,0.07)', borderColor: 'rgba(123,92,240,0.25)' }}
            >
              <span className="text-[12px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {dispatchResult?.category === 'search'
                  ? 'Для поиска в интернете точнее работает Sonar'
                  : 'Для анализа документов рекомендуем DeepSeek V3.2'}
              </span>
              <button
                type="button"
                onClick={() => setModel(dispatchResult?.category === 'search' ? 'sonar' : 'deepseek-v3.2')}
                className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                style={{ background: 'rgba(123,92,240,0.18)', color: 'var(--accent)' }}
              >
                Сменить модель
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Превью прикреплённого файла */}
        {attachedFile && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-2 px-1"
          >
            <div className="flex items-center gap-2 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 max-w-[340px] min-w-0">
              {(() => { const Icon = fileIconFor(attachedFile); return <Icon size={16} className="flex-shrink-0" />; })()}
              <div className="flex flex-col min-w-0">
                <span className="text-xs truncate font-medium" style={{ color: 'var(--text-primary)' }}>{attachedFile.name}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {formatSize(attachedFile.size)}
                  {category === 'binary' && ' · будет извлечён текст'}
                  {category === 'image' && ' · изображение'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setAttachedFile(null)}
              className="text-sm focus:outline-none flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
              type="button"
            >✕</button>
          </motion.div>
        )}

        {/* В режиме голоса вместо текстового поля — только переключатель режима под орбом:
            печатать тут нечего, ввод — голосом, через VoiceWidget выше. */}
        {chatMode === 'voice' ? (
          <div className="flex items-center gap-1.5">
            {modeSelector}
          </div>
        ) : (
        <div
          className={cn(
            'flex flex-col border rounded-2xl px-4 pt-3.5 pb-2.5 transition-all backdrop-blur-[10px] shadow-[0_10px_34px_rgba(0,0,0,.25)]',
            hasContent
              ? 'border-[var(--accent-border)] shadow-[0_10px_34px_rgba(0,0,0,.25),0_0_0_3px_var(--accent-glow)]'
              : 'border-[var(--panel-glass-border)] focus-within:border-[var(--accent-border)] focus-within:shadow-[0_10px_34px_rgba(0,0,0,.25),0_0_0_3px_var(--accent-glow)]'
          )}
          style={{ background: 'var(--panel-glass)' }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={chatMode === 'video' ? 'image/*' : chatMode === 'music' ? '' : ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); adjustHeight(); onInputChange?.(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder={activePlaceholder}
            disabled={disabled}
            rows={1}
            spellCheck={true}
            style={{ fontSize: '16px', minHeight: '36px', color: 'var(--text-primary)' }}
            className={cn(
              'w-full bg-transparent resize-none outline-none leading-[1.75] max-h-[200px] placeholder:opacity-30',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />

          {/* Тулбар — на мобильном разбит на 2 строки (иначе не помещается: прикрепить +
              режим + модель + отправка физически не влезают в один ряд на узком экране,
              кнопка отправки вылезала за границы). Обе группы ниже — sm:contents:
              на sm+ они "растворяются" и их дети снова встают в один общий ряд по
              обычному flex-порядку (см. sm:order-* ниже), на мобильном — каждая группа
              остаётся отдельной строкой flex-col контейнера. */}
          <div className="flex flex-col gap-1.5 mt-2 sm:flex-row sm:items-center">

            {/* Строка 1 (моб.): прикрепить … отправка */}
            <div className="flex items-center gap-1.5 sm:contents">
              {/* Прикрепить — скрыто в режиме музыки. В режимах "Картинка"/"Видео" вложение —
                  это единственный смысл кнопки (источник для редактирования/image-to-video),
                  поэтому там при несовместимой модели блокируем клик целиком, а не ждём
                  отдельного тоста после выбора файла. В чате документы разрешены всегда
                  (не требуют vision) — там блокировка точечная, только для картинок,
                  см. handleFileChange. */}
              {chatMode !== 'music' && (() => {
                const blockedReason = chatMode === 'images' ? imageAttachBlockedReason
                  : chatMode === 'video' ? videoAttachBlockedReason
                  : null;
                return (
                  <button
                    onClick={() => {
                      if (blockedReason) { show(blockedReason, 'error'); return; }
                      fileInputRef.current?.click();
                    }}
                    className={cn(
                      'w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-elevated)]',
                      blockedReason ? 'opacity-20 cursor-not-allowed' : 'opacity-35 hover:opacity-80'
                    )}
                    style={{ color: 'var(--text-primary)' }}
                    type="button"
                    title={blockedReason ?? 'Прикрепить файл'}
                  >
                    <AttachIcon size={16} />
                  </button>
                );
              })()}

              {/* Прижимает кнопку отправки к правому краю — только на мобильном, где
                  строка 1 живёт как самостоятельный flex-ряд. На sm+ роль спейсера
                  играет отдельный div с sm:order-4 ниже. */}
              <div className="flex-1 sm:hidden" />

              {/* Стоимость + Отправка */}
              <div className="flex items-center gap-1.5 flex-shrink-0 sm:order-5">
                {/* На узком экране бейдж стоимости здесь дублирует пилюлю модели (она уже
                    показывает «в квоте»/цену) — прячем на мобильном. В остальных режимах
                    (картинка/видео/музыка) это единственный индикатор цены — оставляем всегда. */}
                {toolbarCost && (
                  chatMode === 'chat'
                    ? <span className="hidden sm:inline-flex"><CostBadge cost={toolbarCost} size={13} /></span>
                    : <CostBadge cost={toolbarCost} size={13} />
                )}

                {isStreaming ? (
                  <motion.button
                    onClick={onStop}
                    whileTap={{ scale: 0.92 }}
                    type="button"
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] transition-all"
                  >
                    <span className="w-3 h-3 rounded-sm bg-white block" />
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={handleSend}
                    disabled={!hasContent || disabled}
                    whileTap={{ scale: 0.92 }}
                    type="button"
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all focus:outline-none',
                      hasContent && !disabled
                        ? 'bg-accent text-white hover:opacity-90'
                        : 'bg-[var(--bg-elevated)] cursor-not-allowed opacity-40'
                    )}
                    style={!(hasContent && !disabled) ? { color: 'var(--text-secondary)' } : {}}
                  >
                    <SendIcon size={15} />
                  </motion.button>
                )}
              </div>
            </div>

            {/* Строки 2-3 (моб.): режим, под ним модель — каждая своей строкой, в один ряд
                они всё равно не помещались (даже сузив обе пилюли до предела). */}
            <div className="flex flex-col items-stretch gap-1.5 sm:contents">
              {modeSelector}

              {/* Пилюля модели — только в режиме чата */}
              {chatMode === 'chat' && setModel && (
                <ModelPill
                  model={model ?? 'auto'}
                  setModel={setModel}
                  userPlan={userPlan}
                  onUpgradeRequired={onUpgradeRequired}
                />
              )}
            </div>

            {/* Спейсер для десктопа — прижимает "стоимость + отправка" вправо в едином
                ряду. На мобильном роль спейсера уже сыграна внутри строки 1. */}
            <div className="hidden sm:block sm:flex-1 sm:order-4" />
          </div>
        </div>
        )}

        <p className="text-center text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
          GhostLine может ошибаться. Проверяйте важную информацию.
        </p>
      </div>
    </div>
  );
}
