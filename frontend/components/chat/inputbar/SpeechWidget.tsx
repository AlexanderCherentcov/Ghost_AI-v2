'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SoundIcon, SettingsIcon, CheckIcon } from '@/components/icons';
import type { VideoOptions } from './types';
import type { CasperCosts } from './costs';
import { getCostDisplay } from './costs';
import { CostBadge } from './CostBadge';
import { SettingsPanel, SettingsSection } from './SettingsPanel';
import type { TtsVoiceOption } from '@/lib/api';

// Один голос в списке — div, не button: внутри своя кнопка "прослушать превью",
// вложенные <button> невалидны (тот же приём, что и в DiscoveryCard на /chat).
function VoiceRow({ voice, selected, onSelect }: { voice: TtsVoiceOption; selected: boolean; onSelect: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function togglePreview(e: React.MouseEvent) {
    e.stopPropagation();
    if (!audioRef.current) {
      audioRef.current = new Audio(voice.previewUrl);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-void)]"
      style={selected ? { background: 'var(--accent-dim)' } : {}}
    >
      <span className="flex items-center gap-2 min-w-0">
        {selected && <CheckIcon size={13} style={{ color: 'var(--accent)' }} />}
        <span className="text-[13px] font-medium truncate" style={{ color: selected ? 'var(--accent)' : 'var(--text-primary)' }}>
          {voice.label}
        </span>
        {voice.recommended && (
          <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            рекомендуем
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={togglePreview}
        aria-label={playing ? 'Остановить прослушивание' : 'Прослушать голос'}
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-elevated)]"
        style={{ color: 'var(--text-secondary)' }}
      >
        {playing ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="1" width="3" height="10" rx="0.5" fill="currentColor"/><rect x="7.5" y="1" width="3" height="10" rx="0.5" fill="currentColor"/></svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 1.5l8 4.5-8 4.5v-9z" fill="currentColor"/></svg>
        )}
      </button>
    </div>
  );
}

export function SpeechWidget({
  voices, voice, setVoice, casperCosts, userPlan,
}: {
  voices: TtsVoiceOption[];
  voice: string;
  setVoice: (id: string) => void;
  casperCosts: CasperCosts;
  userPlan?: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const cost = getCostDisplay('tts', {} as VideoOptions, casperCosts, userPlan);
  const selected = voices.find((v) => v.id === voice);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border mb-2 px-4 py-2.5 flex flex-col gap-2"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Голос</span>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-medium transition-all hover:border-[rgba(255,255,255,0.2)] w-fit"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <SoundIcon size={13} />
            {selected?.label ?? '...'}
          </button>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <CostBadge cost={cost} size={13} />
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:border-[var(--accent-border)]"
            style={{ background: 'var(--panel-glass)', borderColor: 'var(--panel-glass-border)', color: 'var(--text-secondary)' }}
          >
            <SettingsIcon size={13} /> Голоса
          </button>
        </div>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Введите текст в поле ниже — озвучим выбранным голосом
      </p>

      <SettingsPanel open={panelOpen} onClose={() => setPanelOpen(false)} title="Выбор голоса">
        <SettingsSection title="Голоса">
          <div className="flex flex-col gap-0.5">
            {voices.map((v) => (
              <VoiceRow key={v.id} voice={v} selected={v.id === voice} onSelect={() => setVoice(v.id)} />
            ))}
          </div>
        </SettingsSection>
      </SettingsPanel>
    </motion.div>
  );
}
