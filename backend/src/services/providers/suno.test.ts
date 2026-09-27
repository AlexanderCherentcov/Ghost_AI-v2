import { describe, it, expect } from 'vitest';
import { extractAudioUrl } from './suno.js';

// Живой ответ sunoapi.org (упрощённый) — реальный инцидент 2026-09-27: генерация прошла успешно,
// но код бросал "no audio_url", потому что sourceAudioUrl пришёл пустой строкой, а не отсутствовал.
function sunoResponse(overrides: Record<string, unknown> = {}) {
  return {
    response: {
      sunoData: [{
        id: 'song-1',
        audioUrl: '', audio_url: 'https://tempfile.aiquickdraw.com/r/song-1.mp3',
        sourceAudioUrl: '', source_audio_url: '',
        ...overrides,
      }],
    },
  };
}

describe('extractAudioUrl', () => {
  it('пустая строка в приоритетном поле не перекрывает рабочую ссылку в audio_url (сам баг)', () => {
    expect(extractAudioUrl(sunoResponse())).toBe('https://tempfile.aiquickdraw.com/r/song-1.mp3');
  });

  it('camelCase audioUrl используется, когда он реально заполнен', () => {
    expect(extractAudioUrl(sunoResponse({ audioUrl: 'https://cdn.example/song-1.mp3' })))
      .toBe('https://cdn.example/song-1.mp3');
  });

  it('все поля пустые/отсутствуют — undefined, а не пустая строка', () => {
    expect(extractAudioUrl(sunoResponse({ audio_url: '' }))).toBeUndefined();
    expect(extractAudioUrl({})).toBeUndefined();
    expect(extractAudioUrl(null)).toBeUndefined();
  });

  it('поддерживает альтернативные формы ответа (data/clips) и d.audio_url как запасной вариант', () => {
    expect(extractAudioUrl({ response: { data: [{ audio_url: 'https://cdn.example/a.mp3' }] } }))
      .toBe('https://cdn.example/a.mp3');
    expect(extractAudioUrl({ response: { clips: [{ audio_url: 'https://cdn.example/b.mp3' }] } }))
      .toBe('https://cdn.example/b.mp3');
    expect(extractAudioUrl({ audio_url: 'https://cdn.example/c.mp3' })).toBe('https://cdn.example/c.mp3');
  });
});
