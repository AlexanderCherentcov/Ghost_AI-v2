// ─── Suno API provider ────────────────────────────────────────────────────────
// Docs:  https://docs.sunoapi.org/
// Auth:  Authorization: Bearer <key>
// Each generation returns 2 songs; we use the first one.

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
  /** Music style / genre (e.g. "Jazz", "Electronic"). Used in custom mode. */
  style?: string;
  /** Song title. Used in custom mode. */
  title?: string;
  /** Generate without vocals (instrumental only). */
  instrumental?: boolean;
  /**
   * Model version.
   * V4 (default) — up to 4 min.
   * V4_5 / V4_5PLUS / V4_5ALL / V5 / V5_5 — up to 8 min.
   */
  model?: 'V4' | 'V4_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V5' | 'V5_5';
  /**
   * Song lyrics. When provided, they are sent as the prompt body in custom mode
   * (Suno uses `prompt` as lyrics in custom mode).
   * The `prompt` arg passed to generateMusicSuno becomes the style description.
   */
  lyrics?: string;
}

/**
 * Generate music via Suno API.
 * @param prompt  Description (≤500 chars) or lyrics (≤5000 chars in custom mode)
 * @param options Optional style / title / instrumental / model
 * @returns       URL of the first generated MP3
 */
export async function generateMusicSuno(
  prompt: string,
  options: SunoOptions = {},
): Promise<string> {
  const {
    style,
    title,
    instrumental = true,
    model = 'V4_5',
    lyrics,
  } = options;

  // Custom mode is needed for style/title/lyrics. When lyrics are provided,
  // Suno expects them as the `prompt` body and the music description as `style`.
  const customMode = !!(style?.trim() || title?.trim() || lyrics?.trim());
  // In custom mode: use lyrics as prompt body if available; otherwise use description.
  const promptBody = lyrics?.trim()
    ? lyrics.trim().slice(0, 5000)
    : prompt.slice(0, customMode ? 5000 : 500);

  // When lyrics are provided, use the original prompt as style (if no style given).
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

  // ── Create generation task ────────────────────────────────────────────────
  const createRes = await fetch(`${SUNO_BASE}/api/v1/generate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => createRes.statusText);
    // Try to parse JSON error body
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

  // ── Poll for completion ──────────────────────────────────────────────────
  // Suno generates in ~20–60 s; poll every 5 s, give up after 10 min.
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
      // Log keys and non-param fields to understand actual structure
      const d = pollData.data ?? {};
      const keys = Object.keys(d);
      console.info(`[Suno] SUCCESS keys: ${JSON.stringify(keys)}`);
      const filtered: Record<string, unknown> = {};
      for (const k of keys) { if (k !== 'param') filtered[k] = d[k]; }
      console.info(`[Suno] SUCCESS data (no param): ${JSON.stringify(filtered).slice(0, 2000)}`);

      // Actual sunoapi.org structure: data.response.sunoData[].audioUrl
      const songs: any[] = d?.response?.sunoData ?? d?.response?.data ?? d?.response?.clips ?? [];

      const audioUrl: string | undefined =
        songs[0]?.sourceAudioUrl ??   // direct Suno CDN URL (preferred)
        songs[0]?.audioUrl ??         // proxy URL
        songs[0]?.audio_url ??        // legacy snake_case
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

    // PENDING / GENERATING — continue polling
  }

  throw new Error('Suno task timed out after 10 minutes');
}
