'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { VideoIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { VideoOptions, VideoQuality } from './types';
import type { CasperCosts } from './costs';
import { getCostDisplay } from './costs';
import { CostBadge } from './CostBadge';
import { CustomSelect } from './CustomSelect';

const VIDEO_QUALITIES: { key: VideoQuality; label: string; icon: React.ReactNode }[] = [
  { key: 'motion',  label: 'Standard', icon: <VideoIcon size={13} /> },
  { key: 'cinema',  label: 'Pro',      icon: <VideoIcon size={13} /> },
  { key: 'reality', label: 'Reality',  icon: <VideoIcon size={13} /> },
];

export function VideoWidget({
  options, onChange, userPlan, userVideos, casperCosts,
}: {
  options: VideoOptions;
  onChange: (o: VideoOptions) => void;
  userPlan?: string;
  userVideos?: number;
  casperCosts: CasperCosts;
}) {
  const cost = getCostDisplay('video', options, casperCosts, userPlan, undefined, undefined, userVideos);
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

      <div className="px-4 py-3 flex flex-col gap-3">
        {/* Строка Модель + Разрешение */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Модель</span>
            <CustomSelect<VideoQuality>
              value={options.videoModel}
              onChange={(v) => onChange({ ...options, videoModel: v })}
              options={VIDEO_QUALITIES.map((q) => ({ value: q.key, label: q.label, icon: q.icon }))}
              direction="up"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Разрешение</span>
            <CustomSelect<'720p' | '1080p'>
              value={options.resolution}
              onChange={(v) => onChange({ ...options, resolution: v })}
              options={[
                { value: '720p',  label: '720p' },
                { value: '1080p', label: '1080p' },
              ]}
              direction="up"
            />
          </div>
        </div>

        {/* Длительность + Соотношение сторон + Звук */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {(['4s', '8s'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange({ ...options, duration: d })}
                className={cn(
                  'px-3 py-1 rounded-lg text-[11px] font-medium border transition-all',
                  options.duration === d
                    ? 'bg-[rgba(123,92,240,0.15)] text-accent border-[rgba(123,92,240,0.4)]'
                    : 'border-[var(--border)] hover:border-[rgba(255,255,255,0.25)]'
                )}
                style={options.duration !== d ? { color: 'var(--text-secondary)' } : {}}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {(['16:9', '9:16'] as const).map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => onChange({ ...options, aspectRatio: ar })}
                className={cn(
                  'px-3 py-1 rounded-lg text-[11px] font-medium border transition-all',
                  options.aspectRatio === ar
                    ? 'bg-[rgba(123,92,240,0.15)] text-accent border-[rgba(123,92,240,0.4)]'
                    : 'border-[var(--border)] hover:border-[rgba(255,255,255,0.25)]'
                )}
                style={options.aspectRatio !== ar ? { color: 'var(--text-secondary)' } : {}}
              >
                {ar}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onChange({ ...options, enableAudio: !options.enableAudio })}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium border transition-all',
              options.enableAudio
                ? 'bg-[rgba(123,92,240,0.15)] text-accent border-[rgba(123,92,240,0.4)]'
                : 'border-[var(--border)] hover:border-[rgba(255,255,255,0.25)]'
            )}
            style={!options.enableAudio ? { color: 'var(--text-secondary)' } : {}}
          >
            {options.enableAudio ? '🔊' : '🔇'} Звук
          </button>
        </div>
      </div>
    </motion.div>
  );
}
