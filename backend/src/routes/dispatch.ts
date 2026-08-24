import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { callCloudflareJSON } from '../services/providers/cloudflare.js';
import { callOpenRouterJSON, OR_MODELS } from '../services/providers/openrouter.js';

const bodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  // Последние 1-3 сообщения для контекста
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

// ─── Уровень 1: мгновенный regex (бесплатно, 0мс) ─────────────────────────────
//
// Только паттерны настолько очевидные, что дают 0% ложных срабатываний.
// Покрывает ~80% всех творческих запросов без единого вызова API.

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

// ─── Уровень 2: Llama с контекстом (бесплатно на Cloudflare) ──────────────────

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

// ─── Роут ─────────────────────────────────────────────────────────────────────

const dispatchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/dispatch', async (request, reply) => {
    const { prompt, context } = bodySchema.parse(request.body);

    // Уровень 1: мгновенный regex — без вызова API
    const fast = regexPreFilter(prompt);
    if (fast) return reply.send(fast);

    // Уровень 2: Llama с контекстом диалога
    try {
      // Собираем одно сообщение пользователя, включающее контекст + текущий промт
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
      // Никогда не ломаем UI
    }

    return reply.send({ category: 'chat', autoFill: {} });
  });
};

// ─── Генерация заголовка чата ─────────────────────────────────────────────────
// Вызывается из chat.ts на первом сообщении пользователя, чтобы получить умный заголовок из 3-6 слов.

// Живая проверка в проде вскрыла: слабая/быстрая Llama (та же модель, что даёт
// сбои идентичности в chat — см. lib/prompts.ts) регулярно путает "озаглавь"
// с "ответь" — первое сообщение пользователя выглядит как вопрос/задача/загадка
// К НЕЙ, и модель начинает его РЕШАТЬ вместо того, чтобы описать тему, обрываясь
// на середине по лимиту токенов ("Вот мои ответы на загадки:\n\n1. Без него не
// выйдешь в сеть..." вместо названия). Явный запрет отвечать + контрастные
// примеры (вопрос/загадка → тема, а не решение) — тот же приём, что уже помог
// с честностью идентичности модели.
const TITLE_SYSTEM = `You are ONLY a title generator. You NEVER answer, solve, or respond to what the user's message asks — you are not talking to them. Given the user's first message, output ONLY a short title (3–6 words) naming its TOPIC — never its answer, solution or content.

Rules:
- Output ONLY the title text on a single line — no preamble, no explanation, no quotes, no markdown, no line breaks.
- Even if the message is a question, riddle, request or task — describe what it's ABOUT, do not answer or solve it.
- Do not describe yourself or your role.
- Same language as the message (Russian if Russian, English if English)
- No punctuation at the end
- No generic titles like "Новый чат", "Chat", "Help me"
- Be specific and descriptive
- If it's a creative task (image/video/music), reflect that

Examples:
"напиши функцию сортировки на python" → Сортировка на Python
"как похудеть за месяц?" → Как похудеть за месяц
"сгенерируй аниме девушку с мечом" → Аниме девушка с мечом
"write me a cover letter for a developer job" → Developer cover letter
"что такое квантовая запутанность" → Квантовая запутанность
"сделай грустный джаз про осень" → Грустный джаз про осень
"привет" → Приветствие
"реши загадку: без него не выйдешь в сеть, хоть весь день жми на кнопки" → Загадка про интернет
"помоги, ошибка в цикле for, не работает код" → Ошибка в цикле for`;

// Сеть безопасности поверх промпта — сама модель иногда всё равно срывается
// в ответ/многострочный текст (см. комментарий у TITLE_SYSTEM), поэтому режем
// по границе слова, а не raw.slice(80), которое рвало текст посреди слова
// ("Чтобы решить задачу с кодом, я и") и оставляло переносы строк в title,
// который потом рендерится в один ряд в сайдбаре.
function sanitizeTitle(raw: string): string {
  const oneLine = raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const noQuotes = oneLine.replace(/^["'«]+|["'»]+$/g, '');
  const words = noQuotes.split(' ').filter(Boolean).slice(0, 8);
  return words.join(' ').slice(0, 60);
}

export async function generateChatTitle(prompt: string): Promise<string> {
  // Фолбэк: обрезаем промт до 50 символов
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
    const title = sanitizeTitle(raw);
    return title || fallback;
  } catch {
    return fallback;
  }
}

export default dispatchRoutes;
