'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { VideoIcon, CasperCoin, SoundIcon, MuteIcon, SettingsIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { VideoOptions, VideoAspectRatio, VideoResolution, CameraPreset } from './types';
import type { CasperCosts } from './costs';
import { getCostDisplay } from './costs';
import { CostBadge } from './CostBadge';
import { ModelSelect, type ModelSelectOption } from './ModelSelect';
import { SettingsPanel, SettingsSection, SettingsChoiceRow } from './SettingsPanel';
import type { VideoModelOption, VideoModelUiParams } from '@/lib/api';

const CAMERA_LABELS: Record<string, string> = {
  static: 'Статично', zoom_in: 'Зум внутрь', zoom_out: 'Зум наружу',
  pan_left: 'Панорама влево', pan_right: 'Панорама вправо',
  tilt_up: 'Наклон вверх', tilt_down: 'Наклон вниз', orbit: 'Облёт',
};

const EMPTY_PARAMS: VideoModelUiParams = {
  durationLabels: { '4s': '4с', '8s': '8с' },
  aspectRatios: ['16:9', '9:16'],
  resolutions: [],
  supportsNegativePrompt: false,
  cameraPresets: [],
};

export function VideoWidget({
  options, onChange, userPlan, userVideos, casperCosts, videoModels, onUpgradeRequired,
}: {
  options: VideoOptions;
  onChange: (o: VideoOptions) => void;
  userPlan?: string;
  userVideos?: number;
  casperCosts: CasperCosts;
  videoModels: VideoModelOption[];
  onUpgradeRequired?: () => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const cost = getCostDisplay('video', options, casperCosts, userPlan, undefined, undefined, userVideos, undefined, undefined, videoModels);
  const selectedSpec = videoModels.find((m) => m.id === options.videoModel);
  // Единственный источник реальных параметров модели — backend/src/config/models.ts,
  // приходит через /plans (см. VideoModelOption.ui). Раньше это была отдельная копия
  // в lib/video-model-params.ts — по прямому указанию Александра свели к одному файлу,
  // который читают и сайт, и бот.
  const params = selectedSpec?.ui ?? EMPTY_PARAMS;
  const supportsAudio = !!selectedSpec?.capabilities.audio;

  const modelOptions: ModelSelectOption[] = videoModels.map((m) => ({
    id: m.id,
    label: m.label,
    blurb: m.blurb,
    minPlan: m.minPlan,
    cost: (
      <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--accent)' }}>
        {m.cost[options.duration]}<CasperCoin size={9} />
      </span>
    ),
  }));

  // При смене модели сбрасываем параметры, которых у новой модели нет — иначе
  // «залипший» negativePrompt/аудио/пресет камеры от предыдущей модели молча
  // уедет в реальный запрос к провайдеру, который его не ждёт (или, для Kling,
  // enableAudio незаметно переключает mode на 'pro' по другой цене).
  function handleModelChange(id: string) {
    const spec = videoModels.find((m) => m.id === id);
    const p = spec?.ui ?? EMPTY_PARAMS;
    onChange({
      ...options,
      videoModel: id,
      aspectRatio: (p.aspectRatios.includes(options.aspectRatio) ? options.aspectRatio : p.aspectRatios[0]) as VideoAspectRatio ?? options.aspectRatio,
      resolution: (p.resolutions.includes(options.resolution) ? options.resolution : p.resolutions[0]) as VideoResolution ?? options.resolution,
      enableAudio: spec?.capabilities.audio ? options.enableAudio : false,
      negativePrompt: p.supportsNegativePrompt ? options.negativePrompt : '',
      cameraPreset: p.cameraPresets.length ? options.cameraPreset : undefined,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border mb-2"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      {/* flex-wrap — на узком экране пилюля модели + бейдж стоимости + кнопка "Настройки"
          физически не помещаются в один ряд; раньше это либо обрезалось, либо наезжало
          друг на друга. С переносом лишнее уходит на вторую строку, ничего не перекрывается. */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-y-2 gap-x-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Модель</span>
          {/* direction="down" — этот селектор теперь верхний элемент виджета (после переноса
              длительности/формата в SettingsPanel). Виджет живёт внутри overflow-y-auto
              обёртки в InputBar.tsx; "up" рисовал список ВЫШЕ верхней границы этой обёртки —
              обрезался и был не виден. Вниз список остаётся внутри скролл-зоны. */}
          <ModelSelect
            value={options.videoModel}
            onChange={handleModelChange}
            options={modelOptions}
            userPlan={userPlan}
            onUpgradeRequired={onUpgradeRequired}
            triggerIcon={<VideoIcon size={13} />}
            direction="down"
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <CostBadge cost={cost} size={13} />
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:border-[var(--accent-border)]"
            style={{ background: 'var(--panel-glass)', borderColor: 'var(--panel-glass-border)', color: 'var(--text-secondary)' }}
          >
            <SettingsIcon size={13} /> Настройки
          </button>
        </div>
      </div>

      {selectedSpec?.blurb && (
        <p className="px-4 py-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>{selectedSpec.blurb}</p>
      )}
      {selectedSpec?.capabilities.imageRequired && (
        <p className="px-4 pb-2.5 -mt-1 text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
          📎 Эта модель работает только по фото — прикрепите изображение кнопкой ниже
        </p>
      )}
      {selectedSpec?.capabilities.slowGeneration && (
        <p className="px-4 pb-2.5 -mt-1 text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
          ⏳ Генерация у этой модели заметно дольше обычной — наберитесь терпения
        </p>
      )}

      <SettingsPanel open={panelOpen} onClose={() => setPanelOpen(false)} title={`Настройки — ${selectedSpec?.label ?? 'видео'}`}>
        {params.durationLabels && (
          <SettingsSection title="Длительность">
            <SettingsChoiceRow
              value={options.duration}
              onChange={(d) => onChange({ ...options, duration: d })}
              options={[
                { value: '4s' as const, label: params.durationLabels['4s'] },
                { value: '8s' as const, label: params.durationLabels['8s'] },
              ]}
            />
          </SettingsSection>
        )}

        {params.aspectRatios.length > 0 && (
          <SettingsSection title="Соотношение сторон">
            <SettingsChoiceRow
              value={options.aspectRatio}
              onChange={(ar: VideoAspectRatio) => onChange({ ...options, aspectRatio: ar })}
              options={params.aspectRatios.map((ar) => ({ value: ar as VideoAspectRatio, label: ar }))}
            />
          </SettingsSection>
        )}

        {params.resolutions.length > 0 && (
          <SettingsSection title="Разрешение">
            <SettingsChoiceRow
              value={options.resolution}
              onChange={(r: VideoResolution) => onChange({ ...options, resolution: r })}
              options={params.resolutions.map((r) => ({ value: r as VideoResolution, label: r }))}
            />
          </SettingsSection>
        )}

        {params.cameraPresets.length > 0 && (
          <SettingsSection title="Движение камеры">
            <SettingsChoiceRow
              value={options.cameraPreset ?? 'static'}
              onChange={(c: CameraPreset) => onChange({ ...options, cameraPreset: c })}
              options={params.cameraPresets.map((c) => ({ value: c as CameraPreset, label: CAMERA_LABELS[c] ?? c }))}
            />
          </SettingsSection>
        )}

        {supportsAudio && (
          <SettingsSection title="Звук">
            <button
              type="button"
              onClick={() => onChange({ ...options, enableAudio: !options.enableAudio })}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all',
                options.enableAudio
                  ? 'bg-[rgba(123,92,240,0.15)] text-accent border-[rgba(123,92,240,0.4)]'
                  : 'border-[var(--border)] hover:border-[rgba(255,255,255,0.25)]'
              )}
              style={!options.enableAudio ? { color: 'var(--text-secondary)' } : {}}
            >
              {options.enableAudio ? <SoundIcon size={13} /> : <MuteIcon size={13} />}
              {options.enableAudio ? 'Со звуком' : 'Без звука'}
            </button>
          </SettingsSection>
        )}

        {params.supportsNegativePrompt && (
          <SettingsSection title="Чего избегать (негативный промпт)">
            <textarea
              value={options.negativePrompt}
              onChange={(e) => onChange({ ...options, negativePrompt: e.target.value })}
              placeholder="Например: смазанность, лишние объекты, текст в кадре"
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-[12px] outline-none border resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', borderColor: 'var(--border)', fontSize: '16px' }}
            />
          </SettingsSection>
        )}

        {!params.durationLabels && !params.aspectRatios.length && !params.resolutions.length && !supportsAudio && !params.supportsNegativePrompt && (
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            У этой модели нет настраиваемых параметров — провайдер сам решает формат.
          </p>
        )}
      </SettingsPanel>
    </motion.div>
  );
}
