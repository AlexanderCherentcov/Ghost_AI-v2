import { Worker, type Job } from 'bullmq';
import { createWriteStream, mkdirSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateMusicDiffRhythm, generateMusicUdio } from '../services/providers/goapi.js';
import { generateMusicSuno } from '../services/providers/suno.js';
import { routeAudio } from '../services/audio-router.js';
import { setMediaCached } from '../services/cache.js';
import { encrypt } from '../lib/crypto.js';

// ── Конвертирует FLAC → MP3 через ffmpeg ──────────────────────────────────────
// Safari/iOS не поддерживает FLAC. GoAPI отдаёт .flac — конвертируем сразу.
function tryConvertFlacToMp3(flacPath: string): string {
  const mp3Path = flacPath.replace(/\.flac$/i, '.mp3');
  try {
    execFileSync('ffmpeg', [
      '-i', flacPath,
      '-q:a', '2',  // VBR ~190 kbps
      '-y',
      mp3Path,
    ], { stdio: 'pipe', timeout: 120_000 });
    try { unlinkSync(flacPath); } catch {}
    return mp3Path;
  } catch {
    return flacPath; // ffmpeg недоступен — оставляем FLAC
  }
}

// ── Сохраняем аудио на диск СИНХРОННО (до done) ──────────────────────────────
// Внешний FLAC от GoAPI: Safari не играет + CORS блокирует скачивание.
// Сохраняем сразу и конвертируем в MP3 — пользователь получает локальный URL.
async function saveAudioToDisk(url: string): Promise<string> {
  const dir = path.join(process.cwd(), 'uploads', 'audio');
  mkdirSync(dir, { recursive: true });

  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? 'mp3';
  const safeExt = ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext) ? ext : 'mp3';

  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt}`;
  const filepath = path.join(dir, filename);

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);

  const writeStream = createWriteStream(filepath);
  try {
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), writeStream);
  } catch (err) {
    writeStream.destroy();
    try { unlinkSync(filepath); } catch {}
    throw err;
  }

  // Конвертируем FLAC → MP3 для поддержки Safari/iOS
  if (safeExt === 'flac') {
    const converted = tryConvertFlacToMp3(filepath);
    return path.basename(converted);
  }

  return filename;
}

interface SoundJob {
  jobId: string;
  userId: string;
  prompt: string;
  musicMode?: 'short' | 'long' | 'quality' | 'suno';
  musicDuration?: number;
  chatId?: string | null;
  lyrics?: string;
  sunoStyle?: string;
  sunoTitle?: string;
  sunoInstrumental?: boolean;
}

export function startSoundWorker() {
  const worker = new Worker<SoundJob>(
    'sound',
    async (job: Job<SoundJob>) => {
      const { jobId, userId, prompt, musicMode = 'short', musicDuration, chatId, lyrics, sunoStyle, sunoTitle, sunoInstrumental } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      // ── Выбор модели по режиму пользователя ────────────────────────────────
      let externalUrl: string;

      if (musicMode === 'quality') {
        // ── Quality: Udio ──────────────────────────────────────────────────────
        console.info(`[SoundWorker] quality → Udio | duration ${musicDuration ?? 30}s`);
        externalUrl = await generateMusicUdio(prompt, musicDuration ?? 30);
      } else {
        // ── Все остальные режимы (short / long / suno) → Suno V5.5 ─────────────
        // DiffRhythm не следует style_prompt — используем только как аварийный фолбэк.
        const sunoStyleArg  = musicMode === 'suno' ? sunoStyle  : undefined;
        const sunoTitleArg  = musicMode === 'suno' ? sunoTitle  : undefined;
        const sunoInstrArg  = musicMode === 'suno' ? (sunoInstrumental ?? false) : false;
        const diffMode      = musicMode === 'long' ? 'full' : 'base';

        console.info(`[SoundWorker] ${musicMode} → Suno V5.5 | style="${sunoStyleArg ?? prompt.slice(0, 60)}" instrumental=${sunoInstrArg}`);

        try {
          externalUrl = await generateMusicSuno(prompt, {
            style: sunoStyleArg,
            title: sunoTitleArg,
            instrumental: sunoInstrArg,
            lyrics,
            model: 'V5_5',
          });
        } catch (sunoErr: any) {
          // Fallback to DiffRhythm only if Suno fails and there are no lyrics
          // (DiffRhythm can't follow style but works for simple background music)
          if (lyrics?.trim()) throw sunoErr; // lyrics require Suno — propagate error
          console.warn(`[SoundWorker] Suno failed, falling back to DiffRhythm: ${sunoErr.message}`);
          externalUrl = await generateMusicDiffRhythm(prompt, diffMode);
        }
      }

      // ── Скачиваем и конвертируем СРАЗУ — пользователь получает локальный URL ─
      let finalUrl = externalUrl;
      try {
        const filename = await saveAudioToDisk(externalUrl);
        const API_BASE = process.env.API_URL ?? 'https://api.ghostlineai.ru';
        finalUrl = `${API_BASE}/audio/${filename}`;
        console.info(`[SoundWorker] Audio saved to disk: ${filename}`);
      } catch (err: any) {
        console.warn(`[SoundWorker] Disk save failed, using external URL: ${err.message}`);
      }

      // ── Помечаем done с локальным URL ──────────────────────────────────────
      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl: finalUrl },
      });

      // ── Сохраняем сообщение в историю чата ─────────────────────────────────
      if (chatId) {
        await prisma.message.create({
          data: {
            chatId, userId, role: 'assistant',
            content: encrypt(prompt), mode: 'sound',
            tokensCost: 0, mediaUrl: finalUrl,
          },
        }).catch((e) => {
          console.error('[SoundWorker] Failed to save assistant message:', e.message);
        });
      }

      setMediaCached('sound', prompt, finalUrl).catch(() => {});

      return { mediaUrl: finalUrl };
    },
    {
      connection: bullmqConnection,
      concurrency: 3,
    }
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.generateJob.update({
        where: { id: job.data.jobId },
        data: { status: 'failed', error: err.message },
      });
    }
    console.error(`[SoundWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[SoundWorker] Job ${job.id} completed`);
  });

  console.info('[SoundWorker] Started (DiffRhythm + Udio + Suno, FLAC→MP3 via ffmpeg)');
  return worker;
}
