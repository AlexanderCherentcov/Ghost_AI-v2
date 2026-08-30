// Реестр голосов для режима "Озвучка" (text-to-speech) — по прямому решению
// Александра после уточнения, что OpenAI даёт не 6, а 13 голосов у той же
// модели (gpt-audio-mini), уже используемой в голосовом чате (см.
// services/providers/openrouter.ts:synthesizeSpeech). Единый источник правды —
// и для валидации на бэкенде, и для селектора на фронтенде (отдаётся через
// /api/plans, как и casper_costs/models — фронтенд ничего не хардкодит).
//
// recommended — по прямой рекомендации самого OpenAI в доках ("for best
// quality, we recommend using marin or cedar"), не наша оценка на слух.
//
// previewUrl — короткий сэмпл фразы этим голосом (см. scratchpad-скрипт
// generate-voice-previews, сгенерирован один раз через тот же synthesizeSpeech
// и сохранён статикой в frontend/public/previews/voices/ — переслушивать
// голос не стоит ни цента пользователю, звук уже готов).
export interface TtsVoiceOption {
  id: string;
  label: string;
  recommended?: boolean;
  previewUrl: string;
}

export const TTS_VOICES: TtsVoiceOption[] = [
  { id: 'alloy',   label: 'Alloy',   previewUrl: '/previews/voices/alloy.mp3' },
  { id: 'ash',     label: 'Ash',     previewUrl: '/previews/voices/ash.mp3' },
  { id: 'ballad',  label: 'Ballad',  previewUrl: '/previews/voices/ballad.mp3' },
  { id: 'cedar',   label: 'Cedar',   recommended: true, previewUrl: '/previews/voices/cedar.mp3' },
  { id: 'coral',   label: 'Coral',   previewUrl: '/previews/voices/coral.mp3' },
  { id: 'echo',    label: 'Echo',    previewUrl: '/previews/voices/echo.mp3' },
  { id: 'fable',   label: 'Fable',   previewUrl: '/previews/voices/fable.mp3' },
  { id: 'marin',   label: 'Marin',   recommended: true, previewUrl: '/previews/voices/marin.mp3' },
  { id: 'nova',    label: 'Nova',    previewUrl: '/previews/voices/nova.mp3' },
  { id: 'onyx',    label: 'Onyx',    previewUrl: '/previews/voices/onyx.mp3' },
  { id: 'sage',    label: 'Sage',    previewUrl: '/previews/voices/sage.mp3' },
  { id: 'shimmer', label: 'Shimmer', previewUrl: '/previews/voices/shimmer.mp3' },
  { id: 'verse',   label: 'Verse',   previewUrl: '/previews/voices/verse.mp3' },
];

export const DEFAULT_TTS_VOICE = 'alloy';
export const TTS_VOICE_IDS = new Set(TTS_VOICES.map((v) => v.id));
