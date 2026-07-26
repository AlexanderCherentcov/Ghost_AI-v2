'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SendIcon, ChatIcon, ImageIcon, VideoIcon, MusicIcon, AttachIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

import { ACCEPT, getFileCategory, fileIcon, formatSize } from './inputbar/fileHelpers';
import type { VideoQuality, VideoModel, VideoOptions, MusicMode, MusicOptions, ChatMode } from './inputbar/types';
import { DEFAULT_CASPER_COSTS, calcCaspers, getCostDisplay } from './inputbar/costs';
import type { CasperCosts, CostDisplay } from './inputbar/costs';
import { CostBadge } from './inputbar/CostBadge';
import { CustomSelect } from './inputbar/CustomSelect';
import { VideoWidget } from './inputbar/VideoWidget';
import { MusicWidget } from './inputbar/MusicWidget';
import { ImageWidget } from './inputbar/ImageWidget';
import { ModelPill } from './inputbar/ModelPill';

// Реэкспорт — компонент раньше был одним файлом, снаружи на эти имена
// (ChatIdPage.tsx, app/chat/page.tsx, InputBar.test.ts) уже есть импорты
// из '@/components/chat/InputBar'; после разбивки на модули они продолжают работать.
export type { FileCategory } from './inputbar/fileHelpers';
export { getFileCategory };
export type { VideoQuality, VideoModel, VideoOptions, MusicMode, MusicOptions, ChatMode };
export type { CasperCosts, CostDisplay };
export { DEFAULT_CASPER_COSTS, calcCaspers };

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
  ) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  preferredModel?: 'haiku' | 'deepseek' | undefined;
  setPreferredModel?: (m: 'haiku' | 'deepseek' | undefined) => void;
  userPlan?: string;
  onUpgradeRequired?: () => void;
  chatMode?: ChatMode;
  setChatMode?: (m: ChatMode) => void;
  // Автозаполнение от диспетчера, приходит от родителя
  dispatchResult?: { category: string; autoFill: Record<string, unknown> } | null;
  // Уведомляет родителя об изменениях ввода (для дебаунс-диспетчера)
  onInputChange?: (text: string) => void;
  // Заполняет textarea внешним значением промта (например, кнопкой "Использовать этот промт")
  fillPrompt?: string;
  // Текущие счётчики использования пользователя (для отображения лимита FREE-тарифа)
  userImages?: number;            // images_this_week
  userMusic?: number;             // music_this_week
  userVideos?: number;            // videos_this_month
  userProFreeRemaining?: number;  // остаток бесплатных pro-запросов сегодня
}

export function InputBar({
  onSend, onStop, disabled = false, isStreaming = false,
  placeholder, preferredModel, setPreferredModel, userPlan, onUpgradeRequired,
  chatMode = 'chat', setChatMode,
  dispatchResult,
  onInputChange,
  fillPrompt,
  userImages, userMusic, userVideos, userProFreeRemaining,
}: InputBarProps) {
  const { show } = useToast();
  const [value, setValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [generatingLyrics, setGeneratingLyrics] = useState(false);

  // Стоимость операций в Caspers — с бэкенда (GET /plans), DEFAULT_CASPER_COSTS
  // используется только как запасной вариант, пока запрос не завершился.
  const [casperCosts, setCasperCosts] = useState<CasperCosts>(DEFAULT_CASPER_COSTS);
  useEffect(() => {
    api.payments.plans().then((data) => setCasperCosts(data.casper_costs)).catch(() => {});
  }, []);

  const [videoOptions, setVideoOptions] = useState<VideoOptions>({
    videoModel: 'motion',
    duration: '8s',
    aspectRatio: '16:9',
    enableAudio: false,
    resolution: '720p',
    negativePrompt: '',
  });

  const [musicOptions, setMusicOptions] = useState<MusicOptions>({
    title: '',
    style: '',
    instrumental: false,
    lyrics: '',
  });

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
        videoModel: (['motion','cinema','reality'].includes(autoFill.quality as string)
          ? autoFill.quality as VideoQuality : prev.videoModel),
        duration: (['4s','8s'].includes(autoFill.duration as string)
          ? autoFill.duration as '4s' | '8s' : prev.duration),
      }));
    } else if (category === 'image' && setChatMode) {
      setChatMode('images');
    } else if (category === 'search' && setChatMode) {
      // Остаёмся в режиме чата — поиск обрабатывается маршрутизацией на бэкенде
    }
  }, [dispatchResult]);

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
    if (file) setAttachedFile(file);
    e.target.value = '';
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
  const toolbarCost = getCostDisplay(chatMode, videoOptions, casperCosts, userPlan, userImages, userMusic, userVideos, preferredModel, userProFreeRemaining);
  const category = attachedFile ? getFileCategory(attachedFile) : null;

  const activePlaceholder = chatMode === 'images'
    ? 'Опишите изображение...'
    : chatMode === 'video'
      ? 'Опишите сцену для видео...'
      : chatMode === 'music'
        ? 'Опишите настроение или стиль...'
        : placeholder ?? 'Напишите что-нибудь...';

  return (
    <div className="flex-shrink-0 px-4 pt-2 pb-0 lg:pb-4">
      <div className="max-w-[720px] mx-auto">

        {/* Выезжающие виджеты */}
        <AnimatePresence>
          {chatMode === 'video' && (
            <VideoWidget
              key="video-widget"
              options={videoOptions}
              onChange={setVideoOptions}
              userPlan={userPlan}
              userVideos={userVideos}
              casperCosts={casperCosts}
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
            <ImageWidget key="image-widget" userPlan={userPlan} userImages={userImages} casperCosts={casperCosts} />
          )}
        </AnimatePresence>

        {/* Подсказка перейти на Про — намерение поиска или документ в стандартном режиме */}
        <AnimatePresence>
          {chatMode === 'chat' && preferredModel !== 'deepseek' && setPreferredModel && (
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
                  ? 'Для поиска в интернете точнее работает Про чат'
                  : 'Для анализа документов рекомендуем Про чат'}
              </span>
              <button
                type="button"
                onClick={() => setPreferredModel('deepseek')}
                className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                style={{ background: 'rgba(123,92,240,0.18)', color: 'var(--accent)' }}
              >
                Перейти на Про
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
              <span className="text-base leading-none flex-shrink-0">{fileIcon(attachedFile)}</span>
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

        {/* Контейнер поля ввода */}
        <div
          className={cn(
            'flex flex-col bg-[var(--bg-input)] border rounded-2xl px-4 pt-3.5 pb-2.5 transition-all',
            hasContent
              ? 'border-[var(--accent-border)] shadow-[0_0_0_3px_var(--accent-glow)]'
              : 'border-[var(--border)] focus-within:border-[var(--accent-border)] focus-within:shadow-[0_0_0_3px_var(--accent-glow)]'
          )}
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

          {/* Тулбар */}
          <div className="flex items-center gap-1.5 mt-2">

            {/* Прикрепить — скрыто в режиме музыки */}
            {chatMode !== 'music' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-elevated)] opacity-35 hover:opacity-80"
                style={{ color: 'var(--text-primary)' }}
                type="button"
                title="Прикрепить файл"
              >
                <AttachIcon size={16} />
              </button>
            )}

            {/* Селектор режима */}
            <CustomSelect<ChatMode>
              value={chatMode}
              onChange={(m) => { if (m === 'chat') setChatMode?.('chat'); else toggleMode(m); }}
              options={[
                { value: 'chat',   label: 'Чат',      icon: <ChatIcon  size={13}/> },
                { value: 'images', label: 'Картинка', icon: <ImageIcon size={13}/> },
                { value: 'video',  label: 'Видео',    icon: <VideoIcon size={13}/> },
                { value: 'music',  label: 'Музыка',   icon: <MusicIcon size={13}/> },
              ]}
            />

            {/* Пилюля модели — только в режиме чата */}
            {chatMode === 'chat' && setPreferredModel && (
              <ModelPill
                preferredModel={preferredModel}
                setPreferredModel={setPreferredModel}
                userPlan={userPlan}
                onUpgradeRequired={onUpgradeRequired}
                userProFreeRemaining={userProFreeRemaining}
              />
            )}

            {/* Прижимаем кнопку отправки вправо */}
            <div className="flex-1" />

            {/* Стоимость + Отправка */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {toolbarCost && <CostBadge cost={toolbarCost} size={13} />}

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
        </div>

        <p className="text-center text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
          GhostLine может ошибаться. Проверяйте важную информацию.
        </p>
      </div>
    </div>
  );
}
