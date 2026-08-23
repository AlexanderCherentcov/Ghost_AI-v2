'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MicIcon } from '@/components/icons';
import { ParticleAvatar } from '@/components/ParticleAvatar';
import type { VideoOptions } from './types';
import type { CasperCosts } from './costs';
import { getCostDisplay } from './costs';
import { CostBadge } from './CostBadge';

type VoicePhase = 'idle' | 'recording' | 'processing' | 'error';

// Во время "думаю" перебираем облако точек по нескольким формам — тот же язык,
// что и у индикатора набора в чате (см. ChatIdPage), голосовой режим сейчас
// всегда идёт через 'auto', поэтому конкретная итоговая модель заранее не известна.
const THINKING_SHAPES = ['ghostlogo', 'brainicon', 'gemini', 'claude', 'deepseek'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c));
}

// Оранка-визуализатор в духе Gemini Live: кольца реагируют на громкость микрофона
// в реальном времени во время записи, а во время обработки просто "дышат".
// Реализовано через Web Audio AnalyserNode, без сторонних библиотек визуализации.
export function VoiceWidget({
  onRecordingComplete, disabled, casperCosts,
}: {
  /** Вызывается с записанным файлом; должен дождаться конца обработки (загрузка → распознавание → ответ → озвучка). */
  onRecordingComplete: (file: File) => Promise<void>;
  disabled?: boolean;
  casperCosts: CasperCosts;
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [level, setLevel] = useState(0); // громкость микрофона 0..1
  const [errorMsg, setErrorMsg] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>();

  const cost = getCostDisplay('voice', {} as VideoOptions, casperCosts);

  const stopVisualizer = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const startVisualizer = useCallback((stream: MediaStream) => {
    const AudioCtxCtor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtxCtor) return;
    const ctx: AudioContext = new AudioCtxCtor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioCtxRef.current = ctx;

    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      setLevel(Math.min(1, sum / data.length / 90));
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  async function startRecording() {
    if (disabled) return;
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopVisualizer();
        cleanupStream();

        const blob = new Blob(chunksRef.current, { type: mimeType ?? 'audio/webm' });
        if (blob.size < 800) {
          // Слишком коротко (тишина/случайный тап) — не отправляем впустую
          setPhase('idle');
          return;
        }

        const ext = mimeType?.includes('mp4') ? 'm4a' : mimeType?.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });

        setPhase('processing');
        try {
          await onRecordingComplete(file);
          setPhase('idle');
        } catch (err: any) {
          setErrorMsg(err?.message ?? 'Не удалось обработать голосовое сообщение');
          setPhase('error');
          setTimeout(() => setPhase('idle'), 3500);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      startVisualizer(stream);
      setPhase('recording');
    } catch {
      setErrorMsg('Нет доступа к микрофону — разрешите доступ в браузере');
      setPhase('error');
      setTimeout(() => setPhase('idle'), 3500);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  // Если виджет размонтировали посреди записи (сменили вкладку) — не оставляем микрофон включённым.
  useEffect(() => () => {
    recorderRef.current?.stop();
    cleanupStream();
    stopVisualizer();
  }, [cleanupStream, stopVisualizer]);

  const label =
    phase === 'idle' ? 'Нажмите и говорите' :
    phase === 'recording' ? 'Слушаю… нажмите ещё раз, чтобы остановить' :
    phase === 'processing' ? 'Думаю…' :
    errorMsg;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border mb-2 flex flex-col items-center justify-center gap-3 py-7"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      <div className="w-full flex justify-end px-4 -mt-1 mb-1">
        <CostBadge cost={cost} size={13} />
      </div>

      <div className="relative w-[140px] h-[140px] flex items-center justify-center">
        <div className="absolute inset-0 pointer-events-none" style={{ filter: 'drop-shadow(0 0 18px rgba(123,92,240,.35))' }}>
          <ParticleAvatar
            size={140}
            shape="ghostlogo"
            cycleShapes={phase === 'processing' ? THINKING_SHAPES : undefined}
            reactiveLevel={phase === 'recording' ? level : 0}
          />
        </div>

        <motion.button
          type="button"
          onClick={phase === 'idle' ? startRecording : phase === 'recording' ? stopRecording : undefined}
          disabled={disabled || phase === 'processing'}
          whileTap={{ scale: 0.94 }}
          animate={phase === 'recording' ? { scale: 1 + level * 0.18 } : { scale: 1 }}
          transition={{ duration: 0.08 }}
          className="relative w-[68px] h-[68px] rounded-full flex items-center justify-center shadow-lg disabled:cursor-not-allowed z-10"
          style={{
            background: phase === 'error'
              ? '#ef4444'
              : 'linear-gradient(135deg, var(--accent), var(--accent-secondary, var(--accent)))',
            color: 'white',
          }}
          aria-label={phase === 'recording' ? 'Остановить запись' : 'Начать запись'}
        >
          {phase === 'recording' ? (
            <span className="w-4 h-4 rounded-[3px] bg-white block" />
          ) : (
            <MicIcon size={26} />
          )}
        </motion.button>
      </div>

      <p
        className="text-[12px] text-center px-6 min-h-[16px]"
        style={{ color: phase === 'error' ? '#f87171' : 'var(--text-secondary)' }}
      >
        {label}
      </p>
    </motion.div>
  );
}
