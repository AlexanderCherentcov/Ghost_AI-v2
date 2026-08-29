import { Worker, type Job } from 'bullmq';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { transcribeAudio, synthesizeSpeech, callOpenRouterJSON, type ChatMessage } from '../services/providers/openrouter.js';
import { callCloudflareJSON } from '../services/providers/cloudflare.js';
import { resolveChatModel } from '../services/ai-router.js';
import { getSystemPrompt } from '../lib/prompts.js';
import { encrypt, safeDecrypt } from '../lib/crypto.js';
import { refundCaspers } from '../services/tokens.js';
import { friendlyGenerationError } from '../lib/generation-error.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'audio');

/** Сохраняет data:audio/... URI на диск, возвращает публичный URL — как saveDataUri в vision.worker.ts, но для аудио. */
function saveAudioDataUri(dataUri: string): string {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const [header, base64] = dataUri.split(',');
  const ext = header.includes('mp3') || header.includes('mpeg') ? 'mp3' : header.includes('wav') ? 'wav' : 'mp3';
  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(base64, 'base64'));
  return `${process.env.API_URL ?? 'http://localhost:4000'}/audio/${filename}`;
}

// Голосовые ответы читаются вслух — markdown/списки/код там неуместны, ответ должен
// быть коротким и звучать как реплика в разговоре, а не как текстовый документ.
const VOICE_STYLE_SUFFIX =
  '\n\nВАЖНО: этот ответ будет озвучен вслух программой синтеза речи. ' +
  'Отвечай короткими разговорными фразами, без markdown, списков, таблиц и блоков кода. ' +
  'Если вопрос требует кода или сложной разметки — объясни суть словами.';

interface VoiceJob {
  jobId: string;
  userId: string;
  chatId: string | null;
  audioUrl: string;
  // См. комментарий у одноимённого поля в vision.worker.ts — нужно для возврата
  // Caspers при падении job'а после списания.
  caspersSpent: number;
}

export function startVoiceWorker() {
  const worker = new Worker<VoiceJob>(
    'voice',
    async (job: Job<VoiceJob>) => {
      const { jobId, userId, chatId, audioUrl } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      // ── 1. Распознаём речь пользователя ────────────────────────────────────
      const transcript = await transcribeAudio(audioUrl);

      // Сохраняем транскрипт в GenerateJob.prompt — фронтенд подставляет его в
      // сообщение пользователя вместо плейсхолдера, когда джоба завершится.
      await prisma.generateJob.update({ where: { id: jobId }, data: { prompt: transcript } });

      // ── 2. "Мозг" — та же логика выбора модели, что у обычного чата (Авто) ──
      const userProfile = await prisma.user.findUnique({ where: { id: userId }, select: { responseStyle: true, plan: true } });
      const plan = userProfile?.plan ?? 'FREE';
      const { spec } = resolveChatModel('auto', {
        prompt: transcript, hasImage: false, hasDocument: false, plan,
      });

      // Контекст — последние сообщения этого чата (без текущего голосового обмена, он ещё не сохранён).
      const history: ChatMessage[] = chatId
        ? (await prisma.message.findMany({
            where: { chatId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { role: true, content: true },
          }))
            .reverse()
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: safeDecrypt(m.content) }))
        : [];

      const systemMsg: ChatMessage = {
        role: 'system',
        content: getSystemPrompt('chat', userProfile?.responseStyle ?? null, plan, spec.label) + VOICE_STYLE_SUFFIX,
      };
      const messages: ChatMessage[] = [systemMsg, ...history, { role: 'user', content: transcript }];

      const replyText = spec.provider === 'cloudflare'
        ? await callCloudflareJSON(messages, 300)
        : await callOpenRouterJSON(messages, spec.providerModel, 300);

      // ── 3. Озвучиваем ответ ──────────────────────────────────────────────────
      const speechDataUri = await synthesizeSpeech(replyText);
      const mediaUrl = saveAudioDataUri(speechDataUri);

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });

      // ── Сохраняем оба сообщения в историю чата ───────────────────────────────
      if (chatId) {
        await prisma.$transaction([
          prisma.message.create({
            data: { chatId, userId, role: 'user', content: encrypt(transcript), mode: 'voice', tokensCost: 0, mediaUrl: audioUrl },
          }),
          prisma.message.create({
            data: { chatId, userId, role: 'assistant', content: encrypt(replyText), mode: 'voice', tokensCost: 0, mediaUrl, provider: spec.id },
          }),
          prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
        ]).catch((e) => console.error('[VoiceWorker] Failed to save messages:', e.message));
      }

      return { mediaUrl, transcript, replyText };
    },
    { connection: bullmqConnection, concurrency: 3 },
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.generateJob.update({
        where: { id: job.data.jobId },
        data: { status: 'failed', error: friendlyGenerationError(err.message) },
      });
      await refundCaspers(job.data.userId, job.data.caspersSpent, 'voice_exchange').catch(() => {});
    }
    console.error(`[VoiceWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[VoiceWorker] Job ${job.id} completed`);
  });

  console.info('[VoiceWorker] Started');
  return worker;
}
