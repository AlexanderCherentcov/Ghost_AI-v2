const GOAPI_BASE = 'https://api.goapi.ai';

function apiKey() {
  return process.env.GOAPI_API_KEY ?? '';
}

function headers() {
  return {
    'x-api-key': apiKey(),
    'Content-Type': 'application/json',
  };
}

// ─── Общие вспомогательные функции ─────────────────────────────────────────────

async function createTask(model: string, taskType: string, input: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${GOAPI_BASE}/api/v1/task`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, task_type: taskType, input }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`GoAPI ${model}/${taskType} create failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  const taskId: string | undefined = data?.data?.task_id ?? data?.task_id;
  if (!taskId) throw new Error(`No task_id in GoAPI response: ${JSON.stringify(data).slice(0, 300)}`);
  return taskId;
}

async function pollTask(
  taskId: string,
  maxAttempts = 120,
  intervalMs = 5_000,
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    const res = await fetch(`${GOAPI_BASE}/api/v1/task/${taskId}`, {
      headers: { 'x-api-key': apiKey() },
    }).catch(() => null);

    if (!res?.ok) continue;

    const data = (await res.json()) as any;
    const status: string =
      data?.data?.task_status ??
      data?.data?.status ??
      data?.task_status ??
      data?.status ?? '';

    if (status === 'succeed' || status === 'completed' || status === 'success') return data;
    if (status === 'failed' || status === 'error') {
      throw new Error(`GoAPI task failed: ${JSON.stringify(data?.data?.task_result ?? data).slice(0, 300)}`);
    }
    // pending / processing — продолжаем опрос
  }
  throw new Error('GoAPI task timed out after 10 minutes');
}

function extractVideoUrl(data: any): string {
  const output = data?.data?.output ?? data?.output;
  const url: string | undefined =
    output?.video ??          // Veo3.1 возвращает { output: { video: "..." } }
    output?.video_url ??
    output?.works?.[0]?.video?.resource_without_watermark ??
    output?.works?.[0]?.video?.resource ??
    data?.data?.task_result?.videos?.[0]?.url ??
    data?.data?.task_result?.url ??
    output?.url;
  if (!url) throw new Error(`No video URL in GoAPI response: ${JSON.stringify(data).slice(0, 300)}`);
  return url;
}

// ─── Генерация видео Kling V-2.5 ───────────────────────────────────────────────

export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '21:9' | '9:21' | '4:3' | '3:4';
export type VideoResolution = '480p' | '720p' | '1080p' | '768p';

export interface KlingVideoOptions {
  duration?: 5 | 10;
  aspectRatio?: VideoAspectRatio;
  enableAudio?: boolean;
  imageUrl?: string;
  cameraPreset?: string;
  negativePrompt?: string;
  cfgScale?: number;
  /** Форсирует std/pro независимо от enableAudio — нужно для тарифных уровней
   *  (GhostLine Reality Pro), где качество, а не звук, определяет режим. */
  mode?: 'std' | 'pro';
  /** goapi.ai/docs/kling-api/create-task: enum 1.5/1.6/2.1/2.1-master/2.5/2.6,
   *  default при отсутствии поля — "2.6". Не передаём для базовой модели (тот
   *  же дефолт, что был всегда), но обязателен для 2.1-master — эта версия
   *  не появится сама по себе без явного указания. */
  version?: string;
}

function buildCameraControl(preset?: string): { type: string; config: Record<string, number> } | undefined {
  if (!preset || preset === 'static') return undefined;
  const configs: Record<string, Record<string, number>> = {
    zoom_in:   { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 6 },
    zoom_out:  { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: -6 },
    pan_left:  { horizontal: -8, vertical: 0, pan: -8, tilt: 0, roll: 0, zoom: 0 },
    pan_right: { horizontal: 8,  vertical: 0, pan: 8,  tilt: 0, roll: 0, zoom: 0 },
    tilt_up:   { horizontal: 0,  vertical: 5, pan: 0,  tilt: 5, roll: 0, zoom: 0 },
    tilt_down: { horizontal: 0,  vertical: -5, pan: 0, tilt: -5, roll: 0, zoom: 0 },
    orbit:     { horizontal: 4,  vertical: 0, pan: 4,  tilt: 0, roll: 0, zoom: 2 },
  };
  const config = configs[preset];
  return config ? { type: 'simple', config } : undefined;
}

export async function generateVideoKling(prompt: string, options?: KlingVideoOptions): Promise<string> {
  const {
    duration = 5,
    aspectRatio = '16:9',
    enableAudio = false,
    imageUrl,
    cameraPreset,
    negativePrompt,
    cfgScale = 0.5,
    mode: modeOverride,
    version,
  } = options ?? {};

  const mode = modeOverride ?? (enableAudio ? 'pro' : 'std');
  const cameraControl = buildCameraControl(cameraPreset);

  const input: Record<string, unknown> = {
    prompt,
    duration,
    mode,
    cfg_scale: cfgScale,
    ...(version ? { version } : {}),
    ...(imageUrl ? { image_url: imageUrl } : { aspect_ratio: aspectRatio }),
    ...(enableAudio ? { enable_audio: true } : {}),
    ...(negativePrompt?.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
    ...(cameraControl ? { camera_control: cameraControl } : {}),
  };

  const taskId = await createTask('kling', 'video_generation', input);
  const data = await pollTask(taskId);
  return extractVideoUrl(data);
}

// ─── Генерация видео Veo3.1 ────────────────────────────────────────────────────
// Standard = veo3.1-video-fast, Pro = veo3.1-video
// Поддерживает и text-to-video, и image-to-video (image_url)

export type VeoModel = 'standard' | 'pro';
export type VeoDuration = '4s' | '8s';
export type VeoResolution = '720p' | '1080p';

export interface Veo3Options {
  model?: VeoModel;
  duration?: VeoDuration;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  generateAudio?: boolean;
  negativePrompt?: string;
  /** URL изображения для генерации image-to-video */
  imageUrl?: string;
}

export async function generateVideoVeo3(prompt: string, options: Veo3Options = {}): Promise<string> {
  const {
    model = 'standard',
    duration = '8s',
    resolution = '720p',
    aspectRatio = '16:9',
    generateAudio = false,
    negativePrompt,
    imageUrl,
  } = options;

  const taskType = model === 'pro' ? 'veo3.1-video' : 'veo3.1-video-fast';

  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
    duration,
    resolution,
    generate_audio: generateAudio,
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(negativePrompt?.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
  };

  const mode = imageUrl ? 'img2video' : 'txt2video';
  console.info(`[Veo3.1] ${taskType} | ${mode} | ${duration} | ${resolution} | audio=${generateAudio}`);

  const taskId = await createTask('veo3.1', taskType, input);
  const data = await pollTask(taskId, 180, 5_000);
  return extractVideoUrl(data);
}

// ─── Универсальный вход для новых видео-моделей (Seedance/Hailuo/Wan) ─────────
// Kling и Veo3.1 выше оставлены как есть (проверенный код, не трогаем без нужды) —
// это для моделей, подключённых через реестр models.ts. Формат input подтверждён
// по докам goapi.ai/docs на момент подключения (2026); при ошибках 4xx от GoAPI —
// первое, что проверять.

export interface GenericVideoOptions {
  prompt: string;
  duration: '4s' | '8s';
  aspectRatio: VideoAspectRatio;
  enableAudio: boolean;
  resolution: VideoResolution;
  imageUrl?: string;
  negativePrompt?: string;
}

function buildGenericVideoInput(
  goapiModel: string,
  opts: GenericVideoOptions,
): { input: Record<string, unknown>; taskType: string } {
  const seconds = opts.duration === '4s' ? 4 : 8;

  switch (goapiModel) {
    case 'seedance':
      return {
        taskType: 'seedance-2',
        input: {
          prompt: opts.prompt,
          duration: seconds,
          aspect_ratio: opts.aspectRatio,
          resolution: opts.resolution,
          ...(opts.imageUrl ? { image_urls: [opts.imageUrl] } : {}),
        },
      };
    case 'hailuo':
      // Провайдер принимает числовое разрешение (768/1080), не строку с "p" — см.
      // goapi.ai/docs/hailuo-api/generate-video. "1080p+10s" провайдером не поддерживается,
      // но это уже прикладная валидация UI (video-model-params.ts), не делаем её здесь дважды.
      return {
        taskType: 'video_generation',
        input: {
          prompt: opts.prompt,
          model: 'v2.3',
          expand_prompt: true,
          duration: seconds,
          resolution: parseInt(opts.resolution, 10) || 768,
          ...(opts.imageUrl ? { image_url: opts.imageUrl } : {}),
        },
      };
    case 'Wan':
      // Отдельный task_type для image-to-video — по паттерну из доков
      // (wan26-text-to-video / wan26-image-to-video), точная строка НЕ
      // подтверждена вызовом API. Проверить при первом реальном запуске.
      return {
        taskType: opts.imageUrl ? 'wan26-img2video' : 'wan26-txt2video',
        input: {
          prompt: opts.prompt,
          ...(opts.negativePrompt?.trim() ? { negative_prompt: opts.negativePrompt.trim() } : {}),
          ...(opts.imageUrl ? { image_url: opts.imageUrl } : {}),
          resolution: opts.resolution,
          aspect_ratio: opts.aspectRatio,
          duration: seconds,
          audio: opts.enableAudio,
          watermark: false,
        },
      };
    case 'luma':
      // Контракт подтверждён по goapi.ai/docs/dream-machine/create-task. Luma отдаёт
      // ролики по 5с/9с, а не 4с/8с — маппим наш выбор на ближайшее значение провайдера.
      return {
        taskType: 'video_generation',
        input: {
          model: 'ray-v2',
          prompt: opts.prompt,
          duration: opts.duration === '4s' ? 5 : 9,
          aspect_ratio: opts.aspectRatio,
          ...(opts.imageUrl ? { start_image: opts.imageUrl } : {}),
          loop: false,
        },
      };
    case 'Qubico/skyreels':
      // Контракт подтверждён по goapi.ai/docs/skyreels-api/create-task — модель
      // ТОЛЬКО image-to-video (prompt и image оба обязательны у провайдера),
      // длительность не настраивается вообще, цена — $0.15 фиксированно за
      // генерацию. Наличие opts.imageUrl проверяется раньше, в routes/generate.ts
      // (capabilities.imageRequired), сюда долетает уже гарантированно с картинкой.
      return {
        taskType: 'img2video',
        input: {
          prompt: opts.prompt,
          image: opts.imageUrl,
          aspect_ratio: opts.aspectRatio,
        },
      };
    case 'Qubico/framepack':
      // Контракт подтверждён по goapi.ai/docs/framepack-api/create-task — тоже
      // только image-to-video, длительность провайдер принимает диапазоном
      // 10-30с (наши корзины 4s/8s маппятся на 10с/20с, как Luma маппит на 5с/9с).
      return {
        taskType: 'img2video',
        input: {
          prompt: opts.prompt,
          start_image: opts.imageUrl,
          duration: opts.duration === '4s' ? 10 : 20,
          ...(opts.negativePrompt?.trim() ? { negative_prompt: opts.negativePrompt.trim() } : {}),
        },
      };
    case 'sora2':
      // Контракт подтверждён по goapi.ai/docs/sora2-api/text-to-video (2026-08-29) —
      // модель "sora2", task_type "sora2-video", $0.08/с (720p — единственное доступное
      // разрешение). duration принимает 4/8/12с — наши корзины 4s/8s совпадают напрямую,
      // ремаппинга не нужно (в отличие от Luma/Framepack выше). image_url — первый кадр
      // (image-to-video), опционально. Дешевле и без отдельного OpenAI-ключа в отличие
      // от прежней прямой интеграции с OpenAI — Sora 2 Pro убрана из реестра
      // по прямому указанию Александра (не нужна).
      return {
        taskType: 'sora2-video',
        input: {
          prompt: opts.prompt,
          aspect_ratio: opts.aspectRatio,
          duration: seconds,
          ...(opts.imageUrl ? { image_url: opts.imageUrl } : {}),
        },
      };
    case 'Qubico/hunyuan':
      // Контракт подтверждён по goapi.ai/docs/hunyuan-video/txt2video-api. Длительность
      // не настраивается провайдером — параметр duration из наших опций не передаётся.
      return {
        taskType: opts.imageUrl ? 'img2video-replace' : 'txt2video',
        input: {
          prompt: opts.prompt,
          aspect_ratio: opts.aspectRatio,
          ...(opts.imageUrl ? { image: opts.imageUrl } : {}),
        },
      };
    default:
      throw new Error(`buildGenericVideoInput: неизвестная модель GoAPI "${goapiModel}"`);
  }
}

export async function generateVideoGeneric(goapiModel: string, opts: GenericVideoOptions): Promise<string> {
  const { input, taskType } = buildGenericVideoInput(goapiModel, opts);
  const taskId = await createTask(goapiModel, taskType, input);
  const data = await pollTask(taskId, 180, 5_000);
  return extractVideoUrl(data);
}

// ─── Генерация музыки DiffRhythm (резервный вариант) ───────────────────────────
// txt2audio-base: $0.02 — ~95 сек
// txt2audio-full: $0.02 — ~4:45

export type DiffRhythmMode = 'base' | 'full';

/**
 * Автоматически проставляет тайм-коды к обычным строкам текста песни.
 * DiffRhythm требует формат: [MM:SS.ms] строка
 * Равномерно распределяем строки, начиная с 10 секунды.
 *
 * Отфильтровывает:
 *  - Заголовки секций: [Chorus], [Verse 1] и т.д.
 *  - Инструментальные указания: (flute solo), (string swell) и т.д.
 */
function formatLyricsWithTimestamps(lyrics: string, mode: DiffRhythmMode): string {
  const totalSeconds = mode === 'full' ? 270 : 85; // оставляем запас
  const startAt = 10;

  // Если в тексте уже есть тайм-коды вида [00:10.00] — передаём как есть,
  // убирая только чисто инструментальные строки в скобках.
  const hasTimestamps = /^\[\d{2}:\d{2}\.\d{2}\]/m.test(lyrics);
  if (hasTimestamps) {
    return lyrics
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        // Убираем строки, которые целиком являются инструментальными указаниями (напр. [00:10.00] (Ney flute solo))
        const withoutTs = l.replace(/^\[\d{2}:\d{2}\.\d{2}\]\s*/, '');
        return !/^\(.*\)\s*$/.test(withoutTs);
      })
      .join('\n');
  }

  const lines = lyrics
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (l.startsWith('[')) return false; // заголовки секций вроде [Chorus]
      if (/^\(.*\)\s*$/.test(l)) return false; // чисто инструментальные указания вроде (flute solo)
      return true;
    });

  if (lines.length === 0) return '';

  const step = Math.max(3, Math.floor((totalSeconds - startAt) / lines.length));

  return lines
    .map((line, i) => {
      const t = startAt + i * step;
      const mm = String(Math.floor(t / 60)).padStart(2, '0');
      const ss = String(t % 60).padStart(2, '0');
      return `[${mm}:${ss}.00] ${line}`;
    })
    .join('\n');
}

export async function generateMusicDiffRhythm(
  prompt: string,
  mode: DiffRhythmMode = 'base',
  lyrics?: string,
): Promise<string> {
  const taskType = mode === 'full' ? 'txt2audio-full' : 'txt2audio-base';

  // Форматируем текст песни с тайм-кодами, если он передан
  const formattedLyrics = lyrics?.trim()
    ? formatLyricsWithTimestamps(lyrics.trim(), mode)
    : '';

  console.info(`[DiffRhythm] style_prompt="${prompt.slice(0, 120)}" lyrics=${!!formattedLyrics} mode=${taskType}`);

  const taskId = await createTask('Qubico/diffrhythm', taskType, {
    lyrics: formattedLyrics,
    style_prompt: prompt,
  });
  const data = await pollTask(taskId, 180, 5_000);
  const output = data?.data?.output ?? data?.output;
  const url: string | undefined =
    output?.audio_url ??
    output?.url ??
    data?.data?.task_result?.audio_url ??
    data?.data?.task_result?.url;
  if (!url) throw new Error(`No audio URL in DiffRhythm response: ${JSON.stringify(data).slice(0, 300)}`);
  return url;
}

// ─── Генерация музыки Udio (альтернатива Suno) ─────────────────────────────────
// Контракт подтверждён по goapi.ai/docs/music-api/create-task. $0.05/генерация —
// заметно дешевле Suno, но лицензионные условия Udio на момент подключения
// (2026) сами по себе спорные (идут судебные иски по обучающим данным) — решение
// предлагать ли Udio пользователям как равноправную альтернативу Suno, а не
// просто держать функцию наготове, требует отдельного решения по продукту:
// сейчас эта функция НЕ подключена ни к одному воркеру/пикеру в интерфейсе.

export async function generateMusicUdio(
  prompt: string,
  options?: { lyricsType?: 'instrumental' | 'user' | 'generate'; negativeTags?: string },
): Promise<string> {
  const { lyricsType = 'instrumental', negativeTags = '' } = options ?? {};

  const taskId = await createTask('music-u', 'generate_music', {
    gpt_description_prompt: prompt,
    lyrics_type: lyricsType,
    negative_tags: negativeTags,
  });
  const data = await pollTask(taskId, 180, 5_000);
  const output = data?.data?.output ?? data?.output;
  const url: string | undefined =
    output?.audio_url ??
    output?.url ??
    output?.clips?.[0]?.audio_url ??
    data?.data?.task_result?.audio_url ??
    data?.data?.task_result?.url;
  if (!url) throw new Error(`No audio URL in Udio response: ${JSON.stringify(data).slice(0, 300)}`);
  return url;
}

// ─── Kling: синхронизация губ (Lip Sync) ───────────────────────────────────────
// videoUrl — URL видео-файла
// audioUrl — URL аудио-файла (mp3/wav)

export async function generateLipSync(videoUrl: string, audioUrl: string): Promise<string> {
  const taskId = await createTask('kling', 'lip_sync', {
    video_url: videoUrl,
    audio_url: audioUrl,
  });
  const data = await pollTask(taskId);
  return extractVideoUrl(data);
}
