/**
 * Иконки моделей — сопоставление id из бэкендового реестра (backend/src/config/models.ts)
 * с визуальными ассетами редизайна: плоский SVG для списков/пиллов и ключ облака точек
 * для частичной (particle) анимации аватара.
 *
 * У части провайдеров (Llama, Veo, Seedance, Hailuo, Wan, а также ChatGPT — его SVG в
 * присланном дизайне оказался пустым) нет собственного лого-ассета. По прямому указанию
 * Александра для них подставляется мозг (brain.svg / 'brainicon') вместо иконки провайдера.
 */

export const FALLBACK_ICON = '/models/brain.svg';
export const FALLBACK_PARTICLE_SHAPE = 'brainicon';

/** 'auto' — GhostLine сам думает и выбирает модель за пользователя, поэтому мозг —
 *  по прямому указанию Александра, не звёздочка/лого. */
export const AUTO_PARTICLE_SHAPE = FALLBACK_PARTICLE_SHAPE;

interface ModelIconEntry {
  icon: string;
  particleShape: string;
}

const MODEL_ICON_MAP: Record<string, ModelIconEntry> = {
  // ─── Чат ───
  // Плоского SVG для чипов/пиллов у OpenAI пока нет (см. modelIcon() — там всё ещё
  // мозг-заглушка), но форма для particle-аватара реально есть в particle-logos-data.js
  // (та же, что уже крутится в цикле лого на лендинге — LOOP в ParticleBrainField.tsx),
  // просто не была здесь подключена.
  'llama-3.1-fast': { icon: FALLBACK_ICON, particleShape: FALLBACK_PARTICLE_SHAPE },
  'gpt-4o-mini': { icon: FALLBACK_ICON, particleShape: 'chatgpt' },
  'deepseek-v3.2': { icon: '/models/deepseek.svg', particleShape: 'deepseek' },
  'gemini-2.5-flash': { icon: '/models/gemini.svg', particleShape: 'gemini' },
  sonar: { icon: '/models/perplexity.svg', particleShape: 'perplexity' },
  'claude-haiku-4.5': { icon: '/models/claude.svg', particleShape: 'claude' },
  'gemini-2.5-pro': { icon: '/models/gemini.svg', particleShape: 'gemini' },
  'gpt-4o': { icon: FALLBACK_ICON, particleShape: 'chatgpt' },

  // ─── Изображения ───
  'gemini-flash-image': { icon: '/models/gemini.svg', particleShape: 'gemini' },
  'gemini-pro-image': { icon: '/models/gemini.svg', particleShape: 'gemini' },
  'gpt-image-mini': { icon: FALLBACK_ICON, particleShape: 'chatgpt' },
  'gpt-image': { icon: FALLBACK_ICON, particleShape: 'chatgpt' },
  'gpt-5.4-image-2': { icon: FALLBACK_ICON, particleShape: 'chatgpt' },
  'nano-banana-classic': { icon: '/models/gemini.svg', particleShape: 'gemini' },

  // ─── Видео ───
  'kling-v2.5': { icon: '/models/kling.svg', particleShape: 'kling' },
  'kling-v2.5-pro': { icon: '/models/kling.svg', particleShape: 'kling' },
  'kling-2.1-master': { icon: '/models/kling.svg', particleShape: 'kling' },
  'veo-3.1-standard': { icon: FALLBACK_ICON, particleShape: FALLBACK_PARTICLE_SHAPE },
  'veo-3.1-pro': { icon: FALLBACK_ICON, particleShape: FALLBACK_PARTICLE_SHAPE },
  'seedance-2': { icon: FALLBACK_ICON, particleShape: FALLBACK_PARTICLE_SHAPE },
  'hailuo-v2.3': { icon: FALLBACK_ICON, particleShape: FALLBACK_PARTICLE_SHAPE },
  'wan-2.6': { icon: FALLBACK_ICON, particleShape: FALLBACK_PARTICLE_SHAPE },
  'skyreels': { icon: FALLBACK_ICON, particleShape: FALLBACK_PARTICLE_SHAPE },
  'framepack': { icon: FALLBACK_ICON, particleShape: FALLBACK_PARTICLE_SHAPE },
  'sora-2': { icon: '/models/sora.svg', particleShape: 'sora' },
  'sora-2-pro': { icon: '/models/sora.svg', particleShape: 'sora' },
};

/** SVG-версия лого GhostLine для пункта «Авто» — растровый /ghostline-logo-icon.png
 *  использовать здесь нельзя: это UI-иконка в пилюле/списке моделей (ModelPill),
 *  а не полноразмерный бренд-логотип на лендинге. */
export const AUTO_ICON = FALLBACK_ICON;

export function modelIcon(modelId: string): string {
  if (modelId === 'auto') return AUTO_ICON;
  return MODEL_ICON_MAP[modelId]?.icon ?? FALLBACK_ICON;
}

export function modelParticleShape(modelId: string): string {
  if (modelId === 'auto') return AUTO_PARTICLE_SHAPE;
  return MODEL_ICON_MAP[modelId]?.particleShape ?? FALLBACK_PARTICLE_SHAPE;
}
