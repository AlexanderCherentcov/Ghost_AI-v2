const GOAPI_BASE = 'https://api.goapi.ai';

export interface KlingVideoOptions {
  duration?: 5 | 10;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  enableAudio?: boolean;
  imageUrl?: string;
  cameraPreset?: string;
  negativePrompt?: string;
  cfgScale?: number;
}

// Maps UI camera preset name to GoAPI camera_control object
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

// ─── GoAPI Kling V2.5 video generation ────────────────────────────────────────
// Async: POST creates task, then poll until done (max 5 min).

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

  const cameraControl = buildCameraControl(cameraPreset);

  const input: Record<string, unknown> = {
    prompt,
    duration,
    mode: 'std',
    cfg_scale: cfgScale,
    ...(imageUrl ? { image_url: imageUrl } : { aspect_ratio: aspectRatio }),
    ...(enableAudio ? { enable_audio: true } : {}),
    ...(negativePrompt?.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
    ...(cameraControl ? { camera_control: cameraControl } : {}),
  };

  const createRes = await fetch(`${GOAPI_BASE}/api/v1/task`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.GOAPI_API_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'kling',
      task_type: 'video_generation',
      input,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text().catch(() => createRes.statusText);
    throw new Error(`GoAPI Kling create failed (${createRes.status}): ${err}`);
  }

  const createData = (await createRes.json()) as any;
  const taskId: string | undefined =
    createData?.data?.task_id ?? createData?.task_id;
  if (!taskId) {
    throw new Error(`No task_id in GoAPI response: ${JSON.stringify(createData).slice(0, 300)}`);
  }

  // Poll every 5s, up to 5 minutes
  const POLL_INTERVAL = 5_000;
  const MAX_ATTEMPTS  = 60;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL));

    const statusRes = await fetch(
      `${GOAPI_BASE}/api/v1/task/${taskId}`,
      { headers: { 'x-api-key': process.env.GOAPI_API_KEY ?? '' } }
    ).catch(() => null);

    if (!statusRes?.ok) continue;

    const statusData = (await statusRes.json()) as any;
    const status: string =
      statusData?.data?.task_status ??
      statusData?.task_status ??
      statusData?.status ?? '';

    if (status === 'succeed' || status === 'completed' || status === 'success') {
      const videoUrl: string | undefined =
        statusData?.data?.task_result?.videos?.[0]?.url ??
        statusData?.data?.output?.url ??
        statusData?.output?.url ??
        statusData?.data?.task_result?.url;
      if (videoUrl) return videoUrl;
      throw new Error(`No video URL in completed task: ${JSON.stringify(statusData).slice(0, 300)}`);
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(`GoAPI Kling failed: ${JSON.stringify(statusData?.data?.task_result ?? statusData).slice(0, 300)}`);
    }
    // processing / waiting — continue polling
  }

  throw new Error('GoAPI Kling timed out after 5 minutes');
}
