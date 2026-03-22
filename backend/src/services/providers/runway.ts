import axios from 'axios';

const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1';

const headers = () => ({
  Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
  'Content-Type': 'application/json',
  'X-Runway-Version': '2024-09-13',
});

// ─── Video generation (Gen-3 Alpha) ──────────────────────────────────────────

export async function generateVideo(
  prompt: string,
  duration: 5 | 10 = 5
): Promise<string> {
  const response = await axios.post(
    `${RUNWAY_API_URL}/image_to_video`,
    {
      model: 'gen3a_turbo',
      promptText: prompt,
      duration,
      ratio: '1280:768',
    },
    { headers: headers() }
  );

  const taskId: string = response.data.id;
  return pollRunwayTask(taskId);
}

// ─── Poll helper ─────────────────────────────────────────────────────────────

async function pollRunwayTask(
  taskId: string,
  maxAttempts = 120,
  intervalMs = 5000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const { data } = await axios.get(
      `${RUNWAY_API_URL}/tasks/${taskId}`,
      { headers: headers() }
    );

    if (data.status === 'SUCCEEDED') {
      const url = data.output?.[0];
      if (!url) throw new Error('Runway: no output URL');
      return url as string;
    }

    if (data.status === 'FAILED') {
      throw new Error(`Runway task failed: ${data.failure ?? 'unknown error'}`);
    }
  }

  throw new Error('Runway: task timeout');
}
