/**
 * Sora 2 / Sora 2 Pro — прямая интеграция с OpenAI (НЕ через GoAPI/OpenRouter).
 * Подтверждено по developers.openai.com/api/docs/guides/video-generation:
 *   POST /v1/videos (multipart/form-data: prompt, model, size, seconds) → { id, status }
 *   GET  /v1/videos/{id} — поллинг до status === 'completed'
 *   GET  /v1/videos/{id}/content — сами байты готового видео
 *
 * Image-to-video для Sora НЕ подтверждён в этой сессии — реализован только
 * text-to-video. Прежде чем включать image-to-video для Sora, сверить
 * реальный параметр (input_reference и т.п.) по докам.
 */

const OPENAI_BASE = 'https://api.openai.com/v1';

function apiKey(): string {
  return process.env.OPENAI_API_KEY ?? '';
}

export type SoraModel = 'sora-2' | 'sora-2-pro';

export interface SoraVideoOptions {
  duration: '4s' | '8s';
  aspectRatio: '16:9' | '9:16';
}

function sizeOf(aspectRatio: '16:9' | '9:16'): string {
  return aspectRatio === '9:16' ? '720x1280' : '1280x720';
}

interface SoraVideoObject {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
}

async function createSoraTask(model: SoraModel, prompt: string, opts: SoraVideoOptions): Promise<string> {
  const form = new FormData();
  form.set('prompt', prompt);
  form.set('model', model);
  form.set('size', sizeOf(opts.aspectRatio));
  form.set('seconds', opts.duration === '4s' ? '4' : '8');

  const res = await fetch(`${OPENAI_BASE}/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Sora create failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as SoraVideoObject;
  if (!data.id) throw new Error(`No video id in Sora response: ${JSON.stringify(data).slice(0, 300)}`);
  return data.id;
}

async function pollSoraTask(videoId: string, maxAttempts = 120, intervalMs = 5_000): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    const res = await fetch(`${OPENAI_BASE}/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    }).catch(() => null);
    if (!res?.ok) continue;

    const data = (await res.json()) as SoraVideoObject;
    if (data.status === 'completed') return;
    if (data.status === 'failed') throw new Error(`Sora task ${videoId} failed`);
    // queued / in_progress — продолжаем опрос
  }
  throw new Error('Sora task timed out after 10 minutes');
}

/** Скачивает готовое видео и возвращает Buffer — вызывающий код сохраняет его сам (как остальные видео-провайдеры). */
async function downloadSoraContent(videoId: string): Promise<Buffer> {
  const res = await fetch(`${OPENAI_BASE}/videos/${videoId}/content`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) throw new Error(`Sora content download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function generateVideoSora(model: SoraModel, prompt: string, opts: SoraVideoOptions): Promise<Buffer> {
  const videoId = await createSoraTask(model, prompt, opts);
  await pollSoraTask(videoId);
  return downloadSoraContent(videoId);
}
