/**
 * Audio Router — выбирает модель генерации музыки по промту.
 *
 * Модели (дешевле → дороже):
 *   diffrhythm_base   $0.02  — быстрая, 95 сек, хорошо для атмосферы/фона
 *   diffrhythm_full   $0.02  — полный трек 4:45, сложнее промт
 *   udio              $0.05  — высокое качество, 32 сек, точный стиль
 *
 * Пользователь не видит модель — только бренд «GhostLine».
 */

import type { DiffRhythmMode } from './providers/goapi.js';

export type AudioModel = 'diffrhythm_base' | 'diffrhythm_full' | 'udio';

export interface AudioRouterResult {
  model: AudioModel;
  costUsd: number;
  reason: string;
  diffRhythmMode?: DiffRhythmMode;
}

// Ключевые слова для высококачественного Udio (поп, рок, джаз — точный стиль)
const UDIO_REQUIRED = [
  'поп', 'рок', 'джаз', 'хип-хоп', 'рэп', 'классик', 'опер', 'метал',
  'электронн', 'техно', 'хаус', 'дабстеп', 'r&b', 'соул', 'регги',
  'кантри', 'фолк', 'блюз', 'дэнс', 'диско', 'инди',
  'pop', 'rock', 'jazz', 'hip hop', 'hip-hop', 'rap', 'classical', 'opera', 'metal',
  'electronic', 'techno', 'house', 'dubstep', 'soul', 'reggae',
  'country', 'folk', 'blues', 'dance', 'disco', 'indie',
  'вокал', 'голос', 'певец', 'певица', 'lyrics', 'vocal', 'singer', 'song',
];

// Простые/длинные треки — DiffRhythm Full
const FULL_TRACK = [
  'длинн', 'полный', 'long', 'full', 'extended', '4 минут', '5 минут',
  'саундтрек', 'фон', 'ambient', 'lofi', 'lo-fi', 'lo fi',
];

export function routeAudio(prompt: string): AudioRouterResult {
  const lower = prompt.toLowerCase();

  // Высококачественный Udio для жанровой/вокальной музыки
  if (UDIO_REQUIRED.some((kw) => lower.includes(kw))) {
    return {
      model: 'udio',
      costUsd: 0.05,
      reason: 'genre/vocal keywords → Udio',
    };
  }

  // Длинный/фоновый трек → DiffRhythm Full
  if (FULL_TRACK.some((kw) => lower.includes(kw)) || prompt.length > 150) {
    return {
      model: 'diffrhythm_full',
      costUsd: 0.02,
      diffRhythmMode: 'full',
      reason: 'long/ambient prompt → DiffRhythm Full',
    };
  }

  // По умолчанию → DiffRhythm Base (быстро и дёшево)
  return {
    model: 'diffrhythm_base',
    costUsd: 0.02,
    diffRhythmMode: 'base',
    reason: 'default → DiffRhythm Base',
  };
}
