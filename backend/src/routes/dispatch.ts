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
- music: user wants a song, track, melody, beat, background music.
  Keywords (RU): песня, трек, музыка, мелодия, бит, гимн, саундтрек, сочини, напиши музыку, сделай песню, создай трек.
  Keywords (EN): song, track, melody, beat, music, soundtrack, compose, create song.
  autoFill = {"title":"...","style":"...","instrumental":false}

- video: user wants a video, animation, cartoon, clip, motion graphics, or asks "can you make a video/cartoon/animation".
  Keywords (RU): видео, видеоролик, ролик, мультик, мультфильм, мультипликация, анимация, анимированный, сними, запись, клип, motion, сделай видео, создай видео, сгенерируй видео, давай сделаем мультик, давай снимем.
  Keywords (EN): video, animation, cartoon, clip, motion, animated, film, make a video, create video.
  Also route to video when user ASKS if you can make a video/animation/cartoon ("ты можешь сделать видео?", "можешь снять мультик?", "can you make a video?").
  autoFill = {"quality":"motion","duration":"8s"} — use "cinema" if cinematic/кинематографичн, "reality" if realistic/реалистичн/фотореализм.

- image: user wants a picture, drawing, illustration, photo, poster, logo, wallpaper.
  Keywords (RU): картинка, изображение, нарисуй, нарисуй, арт, иллюстрация, постер, обои, аватар, фото, логотип.
  Keywords (EN): picture, image, draw, illustration, photo, poster, wallpaper, logo, art.
  autoFill = {}

- search: user wants current/live info — news, prices, weather, exchange rates, schedules, scores.
  autoFill = {}

- chat: questions, conversation, explanations, code help, writing help, or anything not matching above.
  autoFill = {}

IMPORTANT: When the user clearly expresses intent to CREATE something (video/music/image), always route to that category even if phrased as a question ("можешь сделать X?" → route to X).

Return ONLY JSON, no explanation, no markdown.

Examples:
"Сделай грустный джаз про VPN" → {"category":"music","autoFill":{"title":"VPN Jazz","style":"Sad Jazz","instrumental":false}}
"Make a cinematic video of ocean waves" → {"category":"video","autoFill":{"quality":"cinema","duration":"8s"}}
"Нарисуй дракона в стиле аниме" → {"category":"image","autoFill":{}}
"What is the current bitcoin price?" → {"category":"search","autoFill":{}}
"давай сделаем мультик про каспера" → {"category":"video","autoFill":{"quality":"motion","duration":"8s"}}
"ты можешь сделать видео?" → {"category":"video","autoFill":{"quality":"motion","duration":"8s"}}
"сними ролик про котиков" → {"category":"video","autoFill":{"quality":"motion","duration":"8s"}}
"создай анимацию заката" → {"category":"video","autoFill":{"quality":"motion","duration":"8s"}}
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
