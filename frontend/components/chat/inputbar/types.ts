// Общие типы InputBar — режим чата, опции видео/музыки.

// Полный набор значений среди ВСЕХ видео-моделей реестра — конкретная модель
// использует только свою часть, см. per-model таблицу в lib/video-model-params.ts.
export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '21:9' | '9:21' | '4:3' | '3:4';
export type VideoResolution = '480p' | '720p' | '1080p' | '768p';
export type CameraPreset = 'static' | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down' | 'orbit';

export interface VideoOptions {
  // id модели из реестра (backend/src/config/models.ts), напр. 'kling-v2.5' / 'veo-3.1-pro' / 'sora-2'.
  videoModel: string;
  duration: '4s' | '8s';
  aspectRatio: VideoAspectRatio;
  enableAudio: boolean;
  resolution: VideoResolution;
  imageUrl?: string;
  negativePrompt: string;
  /** Только Kling — простой пресет камеры (см. buildCameraControl на бэкенде). */
  cameraPreset?: CameraPreset;
}

export interface ImageOptions {
  // Реально применяется только к Gemini-семейству (Gemini Flash/Pro Image, Nano Banana 2 Lite) —
  // image_config.aspect_ratio через OpenRouter, см. lib/image-model-params.ts.
  aspectRatio?: string;
}

export type MusicMode = 'short' | 'long' | 'quality' | 'suno'; // сохраняем для обратной совместимости

export interface MusicOptions {
  title: string;
  style: string;
  instrumental: boolean;
  lyrics: string;
}

export type ChatMode = 'chat' | 'images' | 'video' | 'music';
