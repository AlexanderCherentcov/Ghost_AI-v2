/**
 * Audio Router — выбирает режим DiffRhythm (используется как аварийный фолбэк если Suno недоступен).
 *
 * Основная модель — Suno V5.5 (все режимы).
 * DiffRhythm используется только когда Suno упал и нет lyrics.
 *
 * DiffRhythm:
 *   diffrhythm_base   $0.02  — быстрая, 95 сек, простой фон
 *   diffrhythm_full   $0.02  — полный трек 4:45
 */

import type { DiffRhythmMode } from './providers/goapi.js';

export type AudioModel = 'diffrhythm_base' | 'diffrhythm_full';

export interface AudioRouterResult {
  model: AudioModel;
  costUsd: number;
  reason: string;
  diffRhythmMode?: DiffRhythmMode;
}

// Длинные/фоновые треки → DiffRhythm Full
const FULL_TRACK = [
  'длинн', 'полный', 'long', 'full', 'extended', '4 минут', '5 минут',
  'саундтрек', 'фон', 'ambient', 'lofi', 'lo-fi', 'lo fi',
];

export function routeAudio(prompt: string): AudioRouterResult {
  const lower = prompt.toLowerCase();

  if (FULL_TRACK.some((kw) => lower.includes(kw)) || prompt.length > 150) {
    return {
      model: 'diffrhythm_full',
      costUsd: 0.02,
      diffRhythmMode: 'full',
      reason: 'long/ambient prompt → DiffRhythm Full',
    };
  }

  return {
    model: 'diffrhythm_base',
    costUsd: 0.02,
    diffRhythmMode: 'base',
    reason: 'default → DiffRhythm Base',
  };
}
