'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { MusicIcon, MicIcon, SparkleIcon } from '@/components/icons';
import type { VideoOptions, MusicOptions } from './types';
import type { CasperCosts } from './costs';
import { getCostDisplay } from './costs';
import { CostBadge } from './CostBadge';

export function MusicWidget({
  options, onChange, onGenerateLyrics, generatingLyrics, topic, userPlan, userMusic, casperCosts,
}: {
  options: MusicOptions;
  onChange: (o: MusicOptions) => void;
  onGenerateLyrics: () => void;
  generatingLyrics: boolean;
  topic: string;
  userPlan?: string;
  userMusic?: number;
  casperCosts: CasperCosts;
}) {
  const cost = getCostDisplay('music', {} as VideoOptions, casperCosts, userPlan, undefined, userMusic, undefined);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border mb-2"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      <div className="px-4 py-2.5 flex items-center justify-end border-b" style={{ borderColor: 'var(--border)' }}>
        <CostBadge cost={cost} size={13} />
      </div>

      <div className="px-4 py-3 flex flex-col gap-2.5">
        {/* Название + Стиль — на узком экране (<640px) складываем в столбец вместо
            двух сжатых flex-1 полей в ряд, иначе плейсхолдеры визуально слипаются. */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={options.title}
            onChange={(e) => onChange({ ...options, title: e.target.value })}
            placeholder="Название трека"
            title="Введите название трека, например: «Ночной город» или «Летнее утро»"
            maxLength={100}
            className="flex-1 px-3 py-1.5 rounded-lg text-[12px] outline-none border"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', borderColor: 'var(--border)', fontSize: '16px' }}
          />
          <input
            value={options.style}
            onChange={(e) => onChange({ ...options, style: e.target.value })}
            placeholder="Стиль / жанр"
            title="Укажите жанр или настроение, например: «lo-fi, грустный» или «поп, энергичный»"
            maxLength={100}
            className="flex-1 px-3 py-1.5 rounded-lg text-[12px] outline-none border"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', borderColor: 'var(--border)', fontSize: '16px' }}
          />
        </div>

        {/* Переключатель "инструментал" */}
        <button
          type="button"
          onClick={() => onChange({ ...options, instrumental: !options.instrumental, lyrics: options.instrumental ? options.lyrics : '' })}
          className={cn(
            'self-start flex items-center gap-2 px-3 py-1 rounded-lg text-[11px] font-medium border transition-all',
            options.instrumental
              ? 'bg-[rgba(123,92,240,0.15)] text-accent border-[rgba(123,92,240,0.4)]'
              : 'border-[var(--border)] hover:border-[rgba(255,255,255,0.25)]'
          )}
          style={!options.instrumental ? { color: 'var(--text-secondary)' } : {}}
        >
          {options.instrumental ? <MusicIcon size={12} /> : <MicIcon size={12} />}
          {options.instrumental ? 'Инструментал' : 'С вокалом'}
        </button>

        {/* Область текста песни */}
        {!options.instrumental && (
          <div className="flex flex-col gap-1.5">
            {/* flex-wrap — на узком экране подпись + кнопка "Сгенерировать текст" вместе
               не помещаются в одну строку без переноса. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Текст песни (необязательно)</span>
              <Tooltip
                content="Введите название трека для генерации"
                disabled={!!topic.trim() || generatingLyrics}
                side="top"
              >
                <button
                  type="button"
                  onClick={onGenerateLyrics}
                  disabled={generatingLyrics || !topic.trim()}
                  className={cn(
                    'text-[11px] px-2.5 py-0.5 rounded-md border transition-all',
                    generatingLyrics || !topic.trim()
                      ? 'opacity-40 cursor-not-allowed border-[var(--border)]'
                      : 'border-[rgba(123,92,240,0.4)] text-accent hover:bg-[rgba(123,92,240,0.1)]'
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    <SparkleIcon size={11} />
                    {generatingLyrics ? 'Генерирую...' : 'Сгенерировать текст'}
                  </span>
                </button>
              </Tooltip>
            </div>
            <textarea
              value={options.lyrics}
              onChange={(e) => onChange({ ...options, lyrics: e.target.value })}
              placeholder={'Текст песни...\n\nИли нажмите «Сгенерировать текст» — текст сгенерируется автоматически по названию трека.'}
              rows={4}
              maxLength={10000}
              className="w-full rounded-lg px-3 py-2 text-[12px] outline-none resize-none placeholder:opacity-30 leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
