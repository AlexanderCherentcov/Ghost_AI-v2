'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type GenerateJob } from '@/lib/api';
import { ReelIcon, SendIcon, VideoIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

export default function ReelPage() {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<5 | 10>(5);
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
    }, 5000);
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  useEffect(() => {
    api.generate.list('reel').then(({ jobs }) => setHistory(jobs)).catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setJob(null);
    try {
      const { jobId: id } = await api.generate.reel({ prompt, duration });
      setJobId(id);
      setJob({ id, status: 'pending', mode: 'reel', prompt, mediaUrl: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-xl bg-[rgba(240,92,140,0.12)] flex items-center justify-center">
          <ReelIcon size={18} className="text-[#F05C8C]" />
        </div>
        <div>
          <h1 className="font-medium text-white">Ghost Reel</h1>
          <p className="text-xs text-[rgba(255,255,255,0.3)]">Генерация видео</p>
        </div>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-6">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 mb-6">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Опишите сцену или видеоклип..."
            rows={4}
            className="w-full bg-transparent outline-none text-sm text-[rgba(255,255,255,0.88)] placeholder:text-[rgba(255,255,255,0.2)] resize-none leading-relaxed mb-4"
          />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2">
              {([5, 10] as const).map((d) => (
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
              disabled={!prompt.trim() || loading || ['pending', 'processing'].includes(job?.status ?? '')}
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
                  <div className="w-10 h-10 rounded-full border-2 border-[#F05C8C] border-t-transparent animate-spin mb-4" />
                  <p className="text-sm text-[rgba(255,255,255,0.4)]">Рендеринг видео...</p>
                  <p className="text-xs text-[rgba(255,255,255,0.2)] mt-1">Обычно 30–120 секунд</p>
                </div>
              )}
              {job.status === 'done' && job.mediaUrl && (
                <div className="border border-[var(--border)] rounded-2xl overflow-hidden">
                  <video controls src={job.mediaUrl} className="w-full" />
                  <div className="p-4 bg-[var(--bg-surface)]">
                    <p className="text-xs text-[rgba(255,255,255,0.3)]">{job.prompt}</p>
                    <a href={job.mediaUrl} download className="mt-2 block text-xs text-accent hover:opacity-80">Скачать</a>
                  </div>
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

        {!job && !history.length && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <VideoIcon size={40} className="text-[rgba(255,255,255,0.1)] mb-4" />
            <p className="text-sm text-[rgba(255,255,255,0.25)]">Опишите сцену</p>
            <p className="text-xs text-[rgba(255,255,255,0.15)] mt-1">Powered by Runway Gen-3</p>
          </div>
        )}
      </div>
    </div>
  );
}
