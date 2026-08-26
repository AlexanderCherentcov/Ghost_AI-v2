// Список моделей для маркетинговых текстов (лендинг, в перспективе — бот и приложение) —
// берётся с бэкенда через уже существующий /api/plans, а не хардкодится по доменам.
// Бэкенд (backend/src/config/models.ts) остаётся единственным источником истины
// по тому, какие модели вообще существуют, доступны и сколько стоят — этот файл
// НЕ дублирует их список, только подставляет более узнаваемое имя для маркетинга
// (например «Nano Banana» вместо технического «Gemini Flash Image») и группирует
// варианты одной линейки (Veo standard/pro, Sora 2/2 Pro) в одно имя.
// Если модель уберут или добавят на бэкенде — этот список обновится сам,
// без правок текста на сайте.

import { api } from './api';

// Имя, под которым модель называют пользователи/маркетинг — только отображение,
// не влияет на цену/доступность (та всегда приходит с бэкенда).
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'gemini-flash-image': 'Nano Banana',
  // 'Gemini Pro Image' — без override оставляем родной лейбл с бэкенда: с
  // урезанным до 'Gemini Pro' названием модель на хиро визуально не отличить
  // от текстовой (там уже есть отдельная 'Gemini' для чата) — Александр заметил
  // путаницу в витрине картинок.
  'gpt-image-mini': 'GPT Image',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o',
  'claude-haiku-4.5': 'Claude',
  'gemini-2.5-flash': 'Gemini',
  'gemini-2.5-pro': 'Gemini',
  'deepseek-v3.2': 'DeepSeek',
  sonar: 'Perplexity',
  'kling-v2.5': 'Kling',
  'veo-3.1-standard': 'Veo',
  'veo-3.1-pro': 'Veo',
  'seedance-2': 'Seedance',
  'hailuo-v2.3': 'Hailuo',
  'wan-2.6': 'Wan',
  'sora-2': 'Sora',
  'sora-2-pro': 'Sora',
};

// id, которые не стоит светить в маркетинге (служебный/бесплатный fallback, не про продажу).
const HIDDEN_IDS = new Set(['auto', 'llama-3.1-fast']);

export interface FeatureModelNames {
  chat: string[];
  image: string[];
  video: string[];
}

export interface FeatureModelPreview {
  name: string;
  domain: 'image' | 'video';
  previewUrl: string;
}

let previewCache: Promise<FeatureModelPreview[]> | null = null;

// Для витрины в хиро лендинга — те же модели, что в /api/plans, но только те,
// у которых уже загружено превью (см. previews/ и config/models.ts) — модели
// без превью в этой витрине не участвуют, чтобы не подставлять пустоту вместо
// картинки (честная деградация, как и остальная галерея на лендинге).
export function loadFeatureModelPreviews(): Promise<FeatureModelPreview[]> {
  if (!previewCache) {
    previewCache = api.payments.plans().then((data) => {
      const seen = new Set<string>();
      const out: FeatureModelPreview[] = [];
      const collect = (models: Array<{ id: string; label: string; previewImageUrl?: string }>, domain: 'image' | 'video') => {
        for (const m of models) {
          if (!m.previewImageUrl) continue;
          const name = displayName(m.id, m.label);
          if (seen.has(name)) continue;
          seen.add(name);
          out.push({ name, domain, previewUrl: m.previewImageUrl });
        }
      };
      collect(data.models.image, 'image');
      collect(data.models.video, 'video');
      return out;
    });
  }
  return previewCache;
}

function displayName(id: string, label: string): string {
  return DISPLAY_NAME_OVERRIDES[id] ?? label;
}

function dedupeOrdered(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

let cache: Promise<FeatureModelNames> | null = null;

/** Живой список названий моделей по доменам, с бэкенда. Кэшируется на сессию вкладки. */
export function loadFeatureModelNames(): Promise<FeatureModelNames> {
  if (!cache) {
    cache = api.payments.plans().then((data) => ({
      chat: dedupeOrdered(
        data.models.chat.filter((m) => !HIDDEN_IDS.has(m.id)).map((m) => displayName(m.id, m.label)),
      ),
      image: dedupeOrdered(data.models.image.map((m) => displayName(m.id, m.label))),
      video: dedupeOrdered(data.models.video.map((m) => displayName(m.id, m.label))),
    }));
  }
  return cache;
}

/** Первые N имён — для случаев, где нужен короткий, а не исчерпывающий список (карточки, тизеры). */
export function topNames(names: string[], n: number): string[] {
  return names.slice(0, n);
}
