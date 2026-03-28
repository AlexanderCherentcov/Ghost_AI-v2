'use client';

import { useToast } from '@/components/ui/Toast';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type GenerateJob } from '@/lib/api';
import { VisionIcon, SendIcon, ImageIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

const SIZES = ['1024x1024', '1792x1024', '1024x1792'] as const;

export default function VisionPage() {
  const { show } = useToast();
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<typeof SIZES[number]>('1024x1024');
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<GenerateJob | null>(null);
  const [history, setHistory] = useState<GenerateJob[]>([]);

  useEffect(() => {
    if (!jobId || job?.status === 'done' || job?.status === 'failed') return;
    const interval = setInterval(async () => {
      try {
        const updated = await api.generate.status(jobId);
        setJob(updated);
        if (updated.status === 'done' || updated.status === 'failed') {
          clearInterval(interval);
          if (updated.status === 'done') setHistory((h) => [updated, ...h]);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  useEffect(() => {
    api.generate.list('vision').then(({ jobs }) => setHistory(jobs)).catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setJob(null);
    try {
      const { jobId: id } = await api.generate.vision({ prompt, size });
      setJobId(id);
      setJob({ id, status: 'pending', mode: 'vision', prompt, mediaUrl: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    } catch (err: any) {
      if (err.code === 'TASK_IN_PROGRESS') {
        show('Изображение уже генерируется — дождитесь результата', 'warning');
      } else if (err.code === 'RATE_LIMITED') {
        show('Слишком много запросов. Подождите минуту.', 'warning');
      } else {
        show(err.message ?? 'Ошибка генерации', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  const isGenerating = loading || job?.status === 'pending' || job?.status === 'processing';

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-xl bg-[rgba(92,140,240,0.15)] flex items-center justify-center">
          <VisionIcon size={18} className="text-[#5C8CF0]" />
        </div>
        <div>
          <h1 className="font-medium text-white">Ghost Vision</h1>
          <p className="text-xs text-[rgba(255,255,255,0.3)]">Генерация изображений</p>
        </div>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-6">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 mb-6">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Опишите изображение, которое хотите создать..."
            rows={4}
            className="w-full bg-transparent outline-none text-sm text-[rgba(255,255,255,0.88)] placeholder:text-[rgba(255,255,255,0.2)] resize-none leading-relaxed mb-4"
          />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs border transition-all',
                    size === s ? 'border-accent bg-[var(--accent-dim)] text-accent' : 'border-[var(--border)] text-[rgba(255,255,255,0.4)] hover:border-[var(--border-hover)]'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || !!isGenerating}
              className="btn btn-primary h-10 px-5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SendIcon size={14} />
              {isGenerating ? 'Генерация...' : 'Создать'}
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {job && (
            <motion.div key={job.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              {(job.status === 'pending' || job.status === 'processing') && (
                <div className="flex flex-col items-center justify-center py-16 border border-[var(--border)] rounded-2xl">
                  <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin mb-4" />
                  <p className="text-sm text-[rgba(255,255,255,0.4)]">{job.status === 'pending' ? 'Ожидание...' : 'Рисуем...'}</p>
                  <p className="text-xs text-[rgba(255,255,255,0.2)] mt-1">Обычно 10–30 секунд</p>
                </div>
              )}
              {job.status === 'done' && job.mediaUrl && (
                <div className="border border-[var(--border)] rounded-2xl overflow-hidden">
                  <img src={job.mediaUrl} alt={job.prompt} className="w-full h-auto" />
                  <div className="p-4 bg-[var(--bg-surface)]">
                    <p className="text-xs text-[rgba(255,255,255,0.3)]">{job.prompt}</p>
                    <a href={job.mediaUrl} download className="mt-2 block text-xs text-accent hover:opacity-80">Скачать</a>
                  </div>
                </div>
              )}
              {job.status === 'failed' && (
                <div className="border border-red-500/20 bg-red-500/5 rounded-2xl p-6 text-center">
                  <p className="text-sm text-red-400">Ошибка генерации</p>
                  <p className="text-xs text-[rgba(255,255,255,0.3)] mt-1">{job.error}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {history.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-[rgba(255,255,255,0.4)] mb-4 uppercase tracking-wider">История</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {history.filter((j) => j.mediaUrl).map((j) => (
                <div key={j.id} className="relative rounded-xl overflow-hidden border border-[var(--border)] group cursor-pointer" onClick={() => setJob(j)}>
                  <img src={j.mediaUrl!} alt={j.prompt} className="w-full h-40 object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                    <p className="text-xs text-white line-clamp-2">{j.prompt}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!job && !history.length && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ImageIcon size={40} className="text-[rgba(255,255,255,0.1)] mb-4" />
            <p className="text-sm text-[rgba(255,255,255,0.25)]">Опишите что создать</p>
          </div>
        )}
      </div>
    </div>
  );
}
