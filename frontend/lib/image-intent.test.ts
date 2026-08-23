import { describe, it, expect } from 'vitest';
import { isImageEditRequest, extractImagePrompt } from './image-intent';

// Угадывание домена по тексту в чате (isImageRequest/isOnlyImageIntent/
// isPromptComposeRequest) удалено вместе со скрытым перехватом в ChatIdPage —
// см. план в mellow-imagining-dawn.md. Здесь остаются только хелперы,
// используемые ВНУТРИ уже явно выбранного домена (вкладка "Картинка").

describe('isImageEditRequest', () => {
  it('распознаёт глаголы редактирования', () => {
    expect(isImageEditRequest('измени фон на синий')).toBe(true);
    expect(isImageEditRequest('add a hat')).toBe(true);
  });

  it('не срабатывает на нейтральный текст', () => {
    expect(isImageEditRequest('какая сегодня погода')).toBe(false);
  });
});

describe('extractImagePrompt', () => {
  it('приоритет 1: блок кода', () => {
    const content = 'Вот промт:\n```\nphotorealistic portrait of a wizard, 4k, cinematic lighting\n```\nНадеюсь, подойдёт!';
    expect(extractImagePrompt(content)).toContain('photorealistic portrait of a wizard');
  });

  it('приоритет 2: инлайн-код длиннее 20 символов', () => {
    const content = 'Используй этот промт: `a cat sitting on a windowsill at sunset`';
    expect(extractImagePrompt(content)).toBe('a cat sitting on a windowsill at sunset');
  });

  it('приоритет 3: жирный текст, не являющийся заголовком секции', () => {
    const content = '**Стиль:**\n\n**Величественный горный пейзаж на закате с розовыми облаками**\n\nНадеюсь, понравится!';
    expect(extractImagePrompt(content)).toContain('Величественный горный пейзаж');
  });

  it('обрезает результат до 600 символов', () => {
    const long = 'a'.repeat(1000);
    const content = '`' + long + '`';
    expect(extractImagePrompt(content).length).toBeLessThanOrEqual(600);
  });

  it('запасной вариант — не падает на пустом/коротком тексте', () => {
    expect(() => extractImagePrompt('')).not.toThrow();
    expect(() => extractImagePrompt('привет')).not.toThrow();
  });
});
