import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { callCloudflareJSON } from '../services/providers/cloudflare.js';

const bodySchema = z.object({
  prompt: z.string().min(1).max(1000),
});

export type DispatchCategory = 'chat' | 'music' | 'video' | 'image' | 'search';

export interface DispatchResult {
  category: DispatchCategory;
  autoFill: {
    // Music
    title?: string;
    style?: string;
    instrumental?: boolean;
    // Video
    quality?: 'motion' | 'cinema' | 'reality';
    duration?: '4s' | '8s';
  };
}

const SYSTEM_PROMPT = `You are a routing classifier for GhostLine AI. Analyze the user message and return ONLY a valid JSON object with these fields:
- "category": one of "chat", "music", "video", "image", "search"
- "autoFill": object with pre-filled params based on category

Rules:
- music: user wants a song, track, melody, beat, or uses words like "сделай песню", "напиши музыку", "трек", "create song", "make music". autoFill = {"title":"...","style":"...","instrumental":false}
- video: user wants a video clip, animation, motion. autoFill = {"quality":"motion","duration":"8s"} — use "cinema" if they mention "cinematic/кинематографичн", "reality" if they mention "realistic/реалистичн/фотореализм"
- image: user wants a picture, drawing, illustration, photo. autoFill = {}
- search: user wants current/live info — news, prices, weather, schedules. autoFill = {}
- chat: everything else. autoFill = {}

Return ONLY JSON, no explanation, no markdown.

Examples:
"Сделай грустный джаз про VPN" → {"category":"music","autoFill":{"title":"VPN Jazz","style":"Sad Jazz","instrumental":false}}
"Make a cinematic video of ocean waves" → {"category":"video","autoFill":{"quality":"cinema","duration":"8s"}}
"Нарисуй дракона в стиле аниме" → {"category":"image","autoFill":{}}
"What is the current bitcoin price?" → {"category":"search","autoFill":{}}
"Как дела?" → {"category":"chat","autoFill":{}}`;

const dispatchRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/dispatch — lightweight intent classifier (no auth required)
  fastify.post('/dispatch', async (request, reply) => {
    const { prompt } = bodySchema.parse(request.body);

    let result: DispatchResult = { category: 'chat', autoFill: {} };

    try {
      const raw = await callCloudflareJSON(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        256,
      );

      // Extract JSON from response (strip any wrapping markdown)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const category = ['chat', 'music', 'video', 'image', 'search'].includes(parsed.category)
          ? parsed.category as DispatchCategory
          : 'chat';
        result = { category, autoFill: parsed.autoFill ?? {} };
      }
    } catch {
      // On any error → default to chat (never break the UI)
    }

    return reply.send(result);
  });
};

export default dispatchRoutes;
