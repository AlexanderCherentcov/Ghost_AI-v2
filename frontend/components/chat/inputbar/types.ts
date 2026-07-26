// Общие типы InputBar — режим чата, опции видео/музыки.

export type VideoQuality = 'motion' | 'cinema' | 'reality';
// для обратной совместимости
export type VideoModel = VideoQuality | 'standard' | 'pro';

export interface VideoOptions {
  videoModel: VideoQuality;
  duration: '4s' | '8s';
  aspectRatio: '16:9' | '9:16';
  enableAudio: boolean;
  resolution: '720p' | '1080p';
  imageUrl?: string;
  negativePrompt: string;
}

export type MusicMode = 'short' | 'long' | 'quality' | 'suno'; // сохраняем для обратной совместимости

export interface MusicOptions {
  title: string;
  style: string;
  instrumental: boolean;
  lyrics: string;
}

export type ChatMode = 'chat' | 'images' | 'video' | 'music';
