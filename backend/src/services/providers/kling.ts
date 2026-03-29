const GOAPI_BASE = 'https://api.goapi.ai';

// ─── GoAPI Kling V2.5 video generation ────────────────────────────────────────
// Async: POST creates task, then poll until done (max 5 min).

export async function generateVideoKling(prompt: string): Promise<string> {
  const createRes = await fetch(`${GOAPI_BASE}/api/kling/v1/videos/text2video`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.GOAPI_API_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_name: 'kling-v2-5',
      prompt,
      duration: '5',
      mode: 'std',
      aspect_ratio: '16:9',
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
      `${GOAPI_BASE}/api/kling/v1/videos/text2video/${taskId}`,
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
