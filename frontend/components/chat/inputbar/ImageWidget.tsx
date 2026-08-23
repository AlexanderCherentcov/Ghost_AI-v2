'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ImageIcon, CasperCoin, SettingsIcon } from '@/components/icons';
import type { VideoOptions } from './types';
import type { CasperCosts } from './costs';
import { getCostDisplay } from './costs';
import { CostBadge } from './CostBadge';
import { ModelSelect, type ModelSelectOption } from './ModelSelect';
import { SettingsPanel, SettingsSection, SettingsChoiceRow } from './SettingsPanel';
import type { ImageModelOption } from '@/lib/api';

export function ImageWidget({
  userPlan, userImages, casperCosts, imageModels, imageModel, setImageModel, aspectRatio, setAspectRatio, onUpgradeRequired,
}: {
  userPlan?: string;
  userImages?: number;
  casperCosts: CasperCosts;
  imageModels: ImageModelOption[];
  imageModel: string;
  setImageModel: (id: string) => void;
  aspectRatio?: string;
  setAspectRatio: (v: string | undefined) => void;
  onUpgradeRequired?: () => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const selected = imageModels.find((m) => m.id === imageModel);
  const cost = getCostDisplay('images', {} as VideoOptions, casperCosts, userPlan, userImages, undefined, undefined, undefined, selected);
  // Единственный источник реальных параметров модели — backend/src/config/models.ts,
  // приходит через /plans (см. ImageModelOption.ui). По прямому указанию Александра:
  // одно место для сайта и бота, не отдельная копия на фронте.
  const aspectRatioOptions = selected?.ui?.aspectRatios ?? [];

  const modelOptions: ModelSelectOption[] = imageModels.map((m) => ({
    id: m.id,
    label: m.label,
    blurb: m.blurb,
    minPlan: m.minPlan,
    cost: (
      <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--accent)' }}>
        {m.cost}<CasperCoin size={9} />
      </span>
    ),
  }));

  // Соотношение сторон реально применяется только у моделей с ui.aspectRatios — при
  // переключении на модель без него сбрасываем, чтобы не отправить параметр, который
  // эта модель молча проигнорирует (провайдер сам решит формат).
  function handleModelChange(id: string) {
    setImageModel(id);
    const nextSpec = imageModels.find((m) => m.id === id);
    if (!nextSpec?.ui?.aspectRatios.length) setAspectRatio(undefined);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border mb-2 px-4 py-2.5 flex flex-col gap-2"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      {/* flex-wrap — та же защита, что в VideoWidget: на узком экране пилюля модели +
          бейдж стоимости + "Настройки" не помещаются в ряд, лишнее уходит на новую строку
          вместо наложения друг на друга. */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Модель</span>
          {/* direction="down" — тот же фикс, что в VideoWidget: этот селектор верхний
              элемент виджета внутри overflow-y-auto обёртки в InputBar.tsx, "up" обрезался. */}
          <ModelSelect
            value={imageModel}
            onChange={handleModelChange}
            options={modelOptions}
            userPlan={userPlan}
            onUpgradeRequired={onUpgradeRequired}
            triggerIcon={<ImageIcon size={13} />}
            direction="down"
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <CostBadge cost={cost} size={13} />
          {aspectRatioOptions.length > 0 && (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:border-[var(--accent-border)]"
              style={{ background: 'var(--panel-glass)', borderColor: 'var(--panel-glass-border)', color: 'var(--text-secondary)' }}
            >
              <SettingsIcon size={13} /> Настройки
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {selected?.blurb ?? 'Опишите изображение в строке ниже'}
      </p>

      <SettingsPanel open={panelOpen} onClose={() => setPanelOpen(false)} title={`Настройки — ${selected?.label ?? 'картинка'}`}>
        <SettingsSection title="Соотношение сторон">
          <SettingsChoiceRow
            value={aspectRatio ?? 'auto'}
            onChange={(v) => setAspectRatio(v === 'auto' ? undefined : v)}
            options={[{ value: 'auto', label: 'Авто' }, ...aspectRatioOptions.map((ar) => ({ value: ar, label: ar }))]}
          />
        </SettingsSection>
      </SettingsPanel>
    </motion.div>
  );
}
