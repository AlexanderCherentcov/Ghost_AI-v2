// ─── Провайдер Suno API ─────────────────────────────────────────────────────────
// Документация: https://docs.sunoapi.org/
// Авторизация:  Authorization: Bearer <key>
// Каждая генерация возвращает 2 песни; используем первую.

const SUNO_BASE = 'https://api.sunoapi.org';

function apiKey() {
  return process.env.SUNO_API_KEY ?? '';
}

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
  };
}

export interface SunoOptions {
  /** Стиль / жанр музыки (например, "Jazz", "Electronic"). Используется в custom mode. */
  style?: string;
  /** Название песни. Используется в custom mode. */
  title?: string;
  /** Генерировать без вокала (только инструментал). */
  instrumental?: boolean;
  /**
   * Версия модели.
   * V4 (по умолчанию) — до 4 мин.
   * V4_5 / V4_5PLUS / V4_5ALL / V5 / V5_5 — до 8 мин.
   */
  model?: 'V4' | 'V4_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V5' | 'V5_5';
  /**
   * Текст песни. Если передан, отправляется как тело `prompt` в custom mode
   * (Suno использует `prompt` как текст песни в custom mode).
   * Аргумент `prompt`, переданный в generateMusicSuno, становится описанием стиля.
   */
  lyrics?: string;
}

/**
 * Генерирует музыку через Suno API.
 * @param prompt  Описание (≤500 симв.) или текст песни (≤5000 симв. в custom mode)
 * @param options Опционально: style / title / instrumental / model
 * @returns       URL первого сгенерированного MP3
 */
export async function generateMusicSuno(
  prompt: string,
  options: SunoOptions = {},
  // Вызывается сразу после создания задачи, ДО начала опроса — воркер сохраняет
  // taskId в БД немедленно (не дожидаясь результата), на случай сбоя провайдера
  // (см. Audio Recovery API — комментарий у GenerateJob.providerTaskId в schema.prisma).
  onTaskCreated?: (taskId: string) => void,
): Promise<string> {
  const {
    style,
    title,
    instrumental = true,
    model = 'V4_5',
    lyrics,
  } = options;

  // Custom mode нужен для style/title/lyrics. Если передан текст песни,
  // Suno ожидает его в теле `prompt`, а описание музыки — в `style`.
  const customMode = !!(style?.trim() || title?.trim() || lyrics?.trim());
  // В custom mode: используем текст песни как тело prompt, если он есть; иначе — описание.
  const promptBody = lyrics?.trim()
    ? lyrics.trim().slice(0, 5000)
    : prompt.slice(0, customMode ? 5000 : 500);

  // Если передан текст песни, используем исходный prompt как style (если style не задан).
  const effectiveStyle = (lyrics?.trim() && !style?.trim())
    ? prompt.slice(0, 200)
    : style?.trim();

  const apiBase = process.env.API_URL ?? 'https://api.ghostlineai.ru';

  const body: Record<string, unknown> = {
    prompt: promptBody,
    model,
    customMode,
    instrumental,
    callBackUrl: `${apiBase}/api/suno/callback`,
    ...(customMode && effectiveStyle ? { style: effectiveStyle } : {}),
    ...(customMode && title?.trim() ? { title: title.trim() } : {}),
  };

  // ── Создаём задачу генерации ──────────────────────────────────────────────
  const createRes = await fetch(`${SUNO_BASE}/api/v1/generate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => createRes.statusText);
    // Пробуем распарсить тело ошибки как JSON
    let parsedErr: any = null;
    try { parsedErr = JSON.parse(errText); } catch {}
    const errMsg: string = parsedErr?.msg ?? errText;
    if (errMsg.toLowerCase().includes('artist name')) {
      const match = errMsg.match(/artist name\s+(\S+)/i);
      const word = match?.[1] ? ` («${match[1]}»)` : '';
      throw new Error(`Suno заблокировал слово в тексте${word} — оно похоже на имя артиста. Замените это слово в lyrics и попробуйте снова.`);
    }
    throw new Error(`Suno create failed (${createRes.status}): ${errMsg}`);
  }

  const createData = (await createRes.json()) as any;
  if (createData.code !== 200) {
    const msg: string = createData.msg ?? JSON.stringify(createData).slice(0, 200);
    if (msg.toLowerCase().includes('artist name')) {
      const match = msg.match(/artist name\s+(\S+)/i);
      const word = match?.[1] ? ` («${match[1]}»)` : '';
      throw new Error(`Suno заблокировал слово в тексте${word} — оно похоже на имя артиста. Замените это слово в lyrics и попробуйте снова.`);
    }
    throw new Error(`Suno API error: ${msg}`);
  }

  const taskId: string | undefined = createData.data?.taskId;
  if (!taskId) {
    throw new Error(`No taskId in Suno response: ${JSON.stringify(createData).slice(0, 300)}`);
  }

  console.info(`[Suno] Task created: ${taskId} (model=${model}, customMode=${customMode}, instrumental=${instrumental})`);
  onTaskCreated?.(taskId);

  // ── Опрашиваем до завершения ──────────────────────────────────────────────
  // Suno генерирует за ~20–60 с; опрашиваем каждые 5 с, сдаёмся через 10 мин.
  const maxAttempts = 120;
  const intervalMs = 5_000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    const pollRes = await fetch(
      `${SUNO_BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey()}` } },
    ).catch(() => null);

    if (!pollRes?.ok) continue;

    const pollData = (await pollRes.json()) as any;
    if (pollData.code !== 200) continue;

    const status: string = (pollData.data?.status ?? '').toUpperCase();

    if (status === 'SUCCESS') {
      // Логируем ключи и не-param поля, чтобы понять реальную структуру ответа
      const d = pollData.data ?? {};
      const keys = Object.keys(d);
      console.info(`[Suno] SUCCESS keys: ${JSON.stringify(keys)}`);
      const filtered: Record<string, unknown> = {};
      for (const k of keys) { if (k !== 'param') filtered[k] = d[k]; }
      console.info(`[Suno] SUCCESS data (no param): ${JSON.stringify(filtered).slice(0, 2000)}`);

      // Реальная структура sunoapi.org: data.response.sunoData[].audioUrl
      const songs: any[] = d?.response?.sunoData ?? d?.response?.data ?? d?.response?.clips ?? [];

      const audioUrl: string | undefined =
        songs[0]?.sourceAudioUrl ??   // прямой URL с CDN Suno (предпочтительно)
        songs[0]?.audioUrl ??         // прокси-URL
        songs[0]?.audio_url ??        // устаревший snake_case
        d?.audio_url;

      if (!audioUrl) {
        throw new Error(`Suno SUCCESS but no audio_url: ${JSON.stringify(d).slice(0, 500)}`);
      }
      console.info(`[Suno] Done: ${audioUrl}`);
      return audioUrl;
    }

    if (status === 'FAILED') {
      throw new Error(`Suno task failed: ${JSON.stringify(pollData.data).slice(0, 300)}`);
    }

    // PENDING / GENERATING — продолжаем опрос
  }

  throw new Error('Suno task timed out after 10 minutes');
}
