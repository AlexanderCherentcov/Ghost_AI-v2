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

// ─── Generic helpers ───────────────────────────────────────────────────────────

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
    // pending / processing — continue
  }
  throw new Error('GoAPI task timed out after 10 minutes');
}

function extractVideoUrl(data: any): string {
  const output = data?.data?.output ?? data?.output;
  const url: string | undefined =
    output?.video_url ??
    output?.works?.[0]?.video?.resource_without_watermark ??
    output?.works?.[0]?.video?.resource ??
    data?.data?.task_result?.videos?.[0]?.url ??
    data?.data?.task_result?.url ??
    output?.url;
  if (!url) throw new Error(`No video URL in GoAPI response: ${JSON.stringify(data).slice(0, 300)}`);
  return url;
}

// ─── Kling V-2.5 video generation ─────────────────────────────────────────────

export interface KlingVideoOptions {
  duration?: 5 | 10;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  enableAudio?: boolean;
  imageUrl?: string;
  cameraPreset?: string;
  negativePrompt?: string;
  cfgScale?: number;
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
  } = options ?? {};

  const mode = enableAudio ? 'pro' : 'std';
  const cameraControl = buildCameraControl(cameraPreset);

  const input: Record<string, unknown> = {
    prompt,
    duration,
    mode,
    cfg_scale: cfgScale,
    ...(imageUrl ? { image_url: imageUrl } : { aspect_ratio: aspectRatio }),
    ...(enableAudio ? { enable_audio: true } : {}),
    ...(negativePrompt?.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
    ...(cameraControl ? { camera_control: cameraControl } : {}),
  };

  const taskId = await createTask('kling', 'video_generation', input);
  const data = await pollTask(taskId);
  return extractVideoUrl(data);
}

// ─── Hunyuan video generation ──────────────────────────────────────────────────
//
// Модели (GoAPI docs):
//   fast-txt2video      $0.03  480x848 / 640x640  6 steps  — быстрый превью
//   txt2video           $0.09  480x848 / 640x640  20 steps — качественный текст→видео
//   img2video-concat    $0.09  544x960 / 720x720  20 steps — видео из картинки (лучше движение)
//   img2video-replace   $0.09  544x960 / 720x720  20 steps — видео из картинки (точнее следует источнику)

export type HunyuanMode = 'fast' | 'standard' | 'img2video-concat' | 'img2video-replace';

export async function generateVideoHunyuan(
  prompt: string,
  mode: HunyuanMode = 'fast',
  imageUrl?: string,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
): Promise<string> {
  let taskType: string;
  const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio };

  switch (mode) {
    case 'fast':
      taskType = 'fast-txt2video';
      break;
    case 'standard':
      taskType = 'txt2video';
      break;
    case 'img2video-concat':
      taskType = 'img2video-concat';
      if (!imageUrl) throw new Error('Hunyuan img2video-concat requires imageUrl');
      input.image = imageUrl;
      break;
    case 'img2video-replace':
      taskType = 'img2video-replace';
      if (!imageUrl) throw new Error('Hunyuan img2video-replace requires imageUrl');
      input.image = imageUrl;
      break;
  }

  const taskId = await createTask('Qubico/hunyuan', taskType, input);
  const data = await pollTask(taskId);
  return extractVideoUrl(data);
}

// ─── DiffRhythm music generation ──────────────────────────────────────────────
// base:  $0.02  — быстрая генерация, 95 сек
// full:  $0.02  — полный трек, 4 мин 45 сек

export type DiffRhythmMode = 'base' | 'full';

export async function generateMusicDiffRhythm(
  prompt: string,
  mode: DiffRhythmMode = 'base',
): Promise<string> {
  const taskType = mode === 'full' ? 'full-version' : 'base-generation';
  const taskId = await createTask('diffrhythm', taskType, {
    lyrics: prompt,
    style: prompt,
  });
  const data = await pollTask(taskId, 120, 5_000);
  const output = data?.data?.output ?? data?.output;
  const url: string | undefined =
    output?.audio_url ??
    output?.url ??
    data?.data?.task_result?.audio_url ??
    data?.data?.task_result?.url;
  if (!url) throw new Error(`No audio URL in DiffRhythm response: ${JSON.stringify(data).slice(0, 300)}`);
  return url;
}

// ─── Udio music generation ─────────────────────────────────────────────────────
// $0.05 за трек (~32 сек), высокое качество

export async function generateMusicUdio(prompt: string, duration = 30): Promise<string> {
  const taskId = await createTask('udio', 'generate', {
    prompt,
    duration,
  });
  const data = await pollTask(taskId, 120, 5_000);
  const output = data?.data?.output ?? data?.output;
  const url: string | undefined =
    output?.audio_url ??
    output?.songs?.[0]?.song_path ??
    output?.url ??
    data?.data?.task_result?.audio_url ??
    data?.data?.task_result?.url;
  if (!url) throw new Error(`No audio URL in Udio response: ${JSON.stringify(data).slice(0, 300)}`);
  return url;
}

// ─── MMAudio — add ambient sound to video ─────────────────────────────────────
// $0.0005/сек — очень дёшево, добавляет атмосферный звук к немому видео

export async function generateMMAudio(videoUrl: string, duration = 8): Promise<string> {
  const taskId = await createTask('mmaudio', 'generate', {
    video_url: videoUrl,
    duration,
  });
  const data = await pollTask(taskId, 60, 3_000);
  const output = data?.data?.output ?? data?.output;
  const url: string | undefined =
    output?.video_url ??
    output?.url ??
    data?.data?.task_result?.video_url ??
    data?.data?.task_result?.url;
  if (!url) throw new Error(`No video URL in MMAudio response: ${JSON.stringify(data).slice(0, 300)}`);
  return url;
}

// ─── Kling Lip Sync ────────────────────────────────────────────────────────────
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
