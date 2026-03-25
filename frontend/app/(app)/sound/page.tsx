'use client';

import { useToast } from '@/components/ui/Toast';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type GenerateJob } from '@/lib/api';
import { SoundIcon, SendIcon, MusicIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

const DURATIONS = [15, 30] as const;

export default function SoundPage() {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<typeof DURATIONS[number]>(15);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<GenerateJob | null>(null);
  const [history, setHistory] = useState<GenerateJob[]>([]);

  useEffect(() => {
    if (!jobId || job?.status === 'done' || job?.status === 'failed') return;
    const interval = setInterval(async () => {
      const updated = await api.generate.status(jobId);
      setJob(updated);
      if (updated.status === 'done' || updated.status === 'failed') {
        clearInterval(interval);
        if (updated.status === 'done') setHistory((h) => [updated, ...h]);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  useEffect(() => {
    api.generate.list('sound').then(({ jobs }) => setHistory(jobs)).catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setJob(null);
    try {
      const { jobId: id } = await api.generate.sound({ prompt, duration });
      setJobId(id);
      setJob({ id, status: 'pending', mode: 'sound', prompt, mediaUrl: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    } catch (err: any) {
      const { show } = useToast();
      show(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-xl bg-[rgba(92,240,200,0.12)] flex items-center justify-center">
          <SoundIcon size={18} className="text-[#5CF0C8]" />
        </div>
        <div>
          <h1 className="font-medium text-white">Ghost Sound</h1>
          <p className="text-xs text-[rgba(255,255,255,0.3)]">Генерация музыки</p>
        </div>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-6">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 mb-6">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Опишите музыку: настроение, жанр, инструменты..."
            rows={4}
            className="w-full bg-transparent outline-none text-sm text-[rgba(255,255,255,0.88)] placeholder:text-[rgba(255,255,255,0.2)] resize-none leading-relaxed mb-4"
          />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs border transition-all',
                    duration === d
                      ? 'border-accent bg-[var(--accent-dim)] text-accent'
                      : 'border-[var(--border)] text-[rgba(255,255,255,0.4)] hover:border-[var(--border-hover)]'
                  )}
                >
                  {d} сек
                </button>
              ))}
            </div>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || loading || job?.status === 'pending' || job?.status === 'processing'}
              className="btn btn-primary h-10 px-5 text-sm disabled:opacity-40"
            >
              <SendIcon size={14} />
              {loading || ['pending', 'processing'].includes(job?.status ?? '') ? 'Генерация...' : 'Создать'}
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {job && (
            <motion.div key={job.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              {['pending', 'processing'].includes(job.status) && (
                <div className="flex flex-col items-center justify-center py-16 border border-[var(--border)] rounded-2xl">
                  <div className="flex items-center gap-1 mb-4">
                    {[0,1,2,3].map((i) => (
                      <div key={i} className="w-1 bg-[#5CF0C8] rounded-full animate-bounce" style={{ height: `${12 + i * 6}px`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                  <p className="text-sm text-[rgba(255,255,255,0.4)]">Сочиняем музыку...</p>
                  <p className="text-xs text-[rgba(255,255,255,0.2)] mt-1">Обычно 20–60 секунд</p>
                </div>
              )}
              {job.status === 'done' && job.mediaUrl && (
                <div className="border border-[var(--border)] rounded-2xl p-5 bg-[var(--bg-surface)]">
                  <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3">{job.prompt}</p>
                  <audio controls src={job.mediaUrl} className="w-full" />
                  <a href={job.mediaUrl} download className="mt-3 block text-xs text-accent hover:opacity-80">Скачать</a>
                </div>
              )}
              {job.status === 'failed' && (
                <div className="border border-red-500/20 rounded-2xl p-6 text-center">
                  <p className="text-sm text-red-400">Ошибка генерации</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {history.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-[rgba(255,255,255,0.4)] mb-4 uppercase tracking-wider">История</h2>
            <div className="space-y-3">
              {history.filter((j) => j.mediaUrl).map((j) => (
                <div key={j.id} className="border border-[var(--border)] rounded-xl p-4 bg-[var(--bg-surface)]">
                  <p className="text-xs text-[rgba(255,255,255,0.3)] mb-2">{j.prompt}</p>
                  <audio controls src={j.mediaUrl!} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {!job && !history.length && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MusicIcon size={40} className="text-[rgba(255,255,255,0.1)] mb-4" />
            <p className="text-sm text-[rgba(255,255,255,0.25)]">Опишите музыку</p>
          </div>
        )}
      </div>
    </div>
  );
}
