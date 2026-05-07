import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { callCloudflareJSON } from '../services/providers/cloudflare.js';
import { callOpenRouterJSON, OR_MODELS } from '../services/providers/openrouter.js';

const bodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  // Last 1-3 messages for context
  context: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(400),
  })).max(4).optional(),
});

export type DispatchCategory = 'chat' | 'music' | 'video' | 'image' | 'search';

export interface DispatchResult {
  category: DispatchCategory;
  autoFill: {
    title?: string;
    style?: string;
    instrumental?: boolean;
    quality?: 'motion' | 'cinema' | 'reality';
    duration?: '4s' | '8s';
  };
}

// ─── Level 1: instant regex (free, 0ms) ──────────────────────────────────────
//
// Only patterns so obvious they have 0% false positives.
// Covers ~80% of all creative requests without any API call.

const VIDEO_RE = /\b(мультик|мультфильм|мультипликац|видеоролик|ролик|анимац|сними|снять\s+видео|сделай\s+видео|создай\s+видео|сгенерируй\s+видео|make\s+a?\s*video|create\s+a?\s*video|animate|cartoon)\b/iu;
const MUSIC_RE = /\b(напиши\s+(песн|музык|трек)|сделай\s+(песн|трек|музык|бит)|создай\s+(трек|песн|музык)|сочини\s+(песн|трек|музык)|гимн|саундтрек|make\s+a?\s*(song|track|music|beat)|compose\s+a?\s*(song|melody))\b/iu;
const IMAGE_RE = /\b(нарисуй|нарисуйте|сгенерируй\s+(изображ|картинк|арт|фото|постер|обои|аватар)|создай\s+(изображ|картинк|арт|рисун)|draw\s+(me\s+)?a|generate\s+(an?\s+)?(image|picture|photo|illustration))\b/iu;

function regexPreFilter(prompt: string): DispatchResult | null {
  const p = prompt.trim();
  if (VIDEO_RE.test(p)) return { category: 'video', autoFill: { quality: 'motion', duration: '8s' } };
  if (MUSIC_RE.test(p)) return { category: 'music', autoFill: { title: '', style: '', instrumental: false } };
  if (IMAGE_RE.test(p)) return { category: 'image', autoFill: {} };
  return null;
}

// ─── Level 2: Llama with context (free on Cloudflare) ────────────────────────

const SYSTEM_PROMPT = `You are an intent classifier for GhostLine AI. Given a user message (and optional recent context), return ONLY a JSON object — no explanation, no markdown.

Output format:
{"category":"chat"|"music"|"video"|"image"|"search","autoFill":{...}}

Categories:
- "video": wants to create video, animation, cartoon, clip, motion, short film. Also when asking "can you make a video/cartoon?" — treat as intent to create.
- "music": wants to create song, track, beat, melody, soundtrack.
- "image": wants to generate image, picture, photo, illustration, drawing, poster, logo.
- "search": wants live/current info — news, prices, weather, exchange rates, scores.
- "chat": everything else — conversation, questions, explanations, code, writing.

VIDEO autoFill: {"quality":"motion","duration":"8s"} (use "cinema" if cinematic/кино/epic, "reality" if realistic/реалистичн/photo-real, "4s" if short/короткий)
MUSIC autoFill: {"title":"<extracted title>","style":"<genre/mood>","instrumental":false}
OTHER autoFill: {}

IMPORTANT: If the message is short ("давай","да","хочу","сделай") — use the conversation context to understand intent.

Examples:
"давай сделаем мультик про каспера" → {"category":"video","autoFill":{"quality":"motion","duration":"8s"}}
"ты можешь сделать видео?" → {"category":"video","autoFill":{"quality":"motion","duration":"8s"}}
"можешь снять мультик?" → {"category":"video","autoFill":{"quality":"motion","duration":"8s"}}
"сделай грустный джаз про осень" → {"category":"music","autoFill":{"title":"Осенний джаз","style":"Sad Jazz","instrumental":false}}
"нарисуй дракона в аниме стиле" → {"category":"image","autoFill":{}}
"какой курс доллара?" → {"category":"search","autoFill":{}}
"как дела?" → {"category":"chat","autoFill":{}}`;

// ─── Route ────────────────────────────────────────────────────────────────────

const dispatchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/dispatch', async (request, reply) => {
    const { prompt, context } = bodySchema.parse(request.body);

    // Level 1: instant regex — no API call
    const fast = regexPreFilter(prompt);
    if (fast) return reply.send(fast);

    // Level 2: Llama with conversation context
    try {
      // Build a single user message that includes context + current prompt
      let userContent = prompt;
      if (context && context.length > 0) {
        const contextText = context
          .map((m) => `[${m.role === 'user' ? 'User' : 'AI'}]: ${m.content.slice(0, 300)}`)
          .join('\n');
        userContent = `Context:\n${contextText}\n\nNew message to classify: ${prompt}`;
      }

      const msgs = [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        { role: 'user' as const, content: userContent },
      ];
      let raw: string;
      try {
        raw = await callCloudflareJSON(msgs, 200);
      } catch {
        raw = await callOpenRouterJSON(msgs, OR_MODELS.llama, 200);
      }

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const category = (['chat', 'music', 'video', 'image', 'search'] as const).includes(parsed.category)
          ? parsed.category as DispatchCategory
          : 'chat';
        return reply.send({ category, autoFill: parsed.autoFill ?? {} });
      }
    } catch {
      // Never break the UI
    }

    return reply.send({ category: 'chat', autoFill: {} });
  });
};

// ─── Chat title generation ────────────────────────────────────────────────────
// Called from chat.ts on first user message to produce a smart 3-6 word title.

const TITLE_SYSTEM = `You are a chat title generator. Given the user's first message, return a SHORT title (3–6 words max) that captures the main topic.
Rules:
- Same language as the message (Russian if Russian, English if English)
- No quotes, no punctuation at the end
- No generic titles like "Новый чат", "Chat", "Help me"
- Be specific and descriptive
- If it's a creative task (image/video/music), reflect that

Examples:
"напиши функцию сортировки на python" → Сортировка на Python
"как похудеть за месяц?" → Как похудеть за месяц
"сгенерируй аниме девушку с мечом" → Аниме девушка с мечом
"write me a cover letter for a developer job" → Developer cover letter
"что такое квантовая запутанность" → Квантовая запутанность
"сделай грустный джаз про осень" → Грустный джаз про осень`;

export async function generateChatTitle(prompt: string): Promise<string> {
  // Fallback: trim prompt to 50 chars
  const fallback = prompt.slice(0, 50) + (prompt.length > 50 ? '...' : '');
  try {
    const msgs = [
      { role: 'system' as const, content: TITLE_SYSTEM },
      { role: 'user' as const, content: prompt.slice(0, 500) },
    ];
    let raw: string;
    try {
      raw = await callCloudflareJSON(msgs, 30);
    } catch {
      raw = await callOpenRouterJSON(msgs, OR_MODELS.llama, 30);
    }
    const title = raw.trim().replace(/^["']|["']$/g, '').slice(0, 80);
    return title || fallback;
  } catch {
    return fallback;
  }
}

export default dispatchRoutes;
