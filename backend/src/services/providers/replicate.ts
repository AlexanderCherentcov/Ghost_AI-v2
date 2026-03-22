import axios from 'axios';

const REPLICATE_API_URL = 'https://api.replicate.com/v1';
const headers = () => ({
  Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
  'Content-Type': 'application/json',
});

// ─── Stable Diffusion XL ─────────────────────────────────────────────────────

export async function generateImageSDXL(prompt: string): Promise<string> {
  const response = await axios.post(
    `${REPLICATE_API_URL}/models/stability-ai/sdxl/predictions`,
    {
      input: {
        prompt,
        width: 1024,
        height: 1024,
        num_inference_steps: 30,
        guidance_scale: 7.5,
      },
    },
    { headers: headers() }
  );

  const predictionId: string = response.data.id;

  // Poll for completion
  return pollPrediction(predictionId);
}

// ─── Music generation (Musicgen) ─────────────────────────────────────────────

export async function generateMusic(prompt: string, duration = 15): Promise<string> {
  const response = await axios.post(
    `${REPLICATE_API_URL}/models/meta/musicgen/predictions`,
    {
      input: {
        prompt,
        model_version: 'stereo-large',
        output_format: 'mp3',
        duration,
      },
    },
    { headers: headers() }
  );

  return pollPrediction(response.data.id);
}

// ─── Poll helper ─────────────────────────────────────────────────────────────

async function pollPrediction(
  predictionId: string,
  maxAttempts = 60,
  intervalMs = 2000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const { data } = await axios.get(
      `${REPLICATE_API_URL}/predictions/${predictionId}`,
      { headers: headers() }
    );

    if (data.status === 'succeeded') {
      const output = Array.isArray(data.output) ? data.output[0] : data.output;
      if (!output) throw new Error('Replicate: no output URL');
      return output as string;
    }

    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate prediction ${data.status}: ${data.error}`);
    }
  }

  throw new Error('Replicate: prediction timeout');
}
