import { describe, it, expect } from 'vitest';
import {
  isOnlyImageIntent, isImageRequest, isImageEditRequest, isPromptComposeRequest, extractImagePrompt,
} from './image-intent';

describe('isImageRequest', () => {
  it('распознаёт глагол + существительное', () => {
    expect(isImageRequest('нарисуй картинку кота')).toBe(true);
    expect(isImageRequest('сгенерируй изображение заката')).toBe(true);
    expect(isImageRequest('create an image of a cat')).toBe(true);
  });

  it('распознаёт точные фразы из IMAGE_EXACT без глагола', () => {
    expect(isImageRequest('хочу картинку')).toBe(true);
  });

  it('не срабатывает на просто глагол без существительного про картинку', () => {
    expect(isImageRequest('сделай это красиво')).toBe(false);
  });

  it('не срабатывает на просто существительное без глагола', () => {
    expect(isImageRequest('красивая картинка природы')).toBe(false);
  });

  it('не срабатывает на обычный вопрос без намерения генерации', () => {
    expect(isImageRequest('расскажи про историю живописи')).toBe(false);
  });
});

describe('isPromptComposeRequest', () => {
  it('распознаёт просьбу написать промт', () => {
    expect(isPromptComposeRequest('напиши промт для битвы ангелов')).toBe(true);
    expect(isPromptComposeRequest('создай промт 9:18')).toBe(true);
  });

  it('НЕ распознаёт, если пользователь ссылается на уже готовый промт', () => {
    // "сгенерируй по этому промту" — использование, а не составление
    expect(isPromptComposeRequest('сгенерируй по этому промту')).toBe(false);
    expect(isPromptComposeRequest('нарисуй по промту выше')).toBe(false);
  });

  it('не срабатывает без слова "промт"', () => {
    expect(isPromptComposeRequest('нарисуй кота')).toBe(false);
  });
});

describe('isImageEditRequest', () => {
  it('распознаёт глаголы редактирования', () => {
    expect(isImageEditRequest('измени фон на синий')).toBe(true);
    expect(isImageEditRequest('add a hat')).toBe(true);
  });

  it('не срабатывает на нейтральный текст', () => {
    expect(isImageEditRequest('какая сегодня погода')).toBe(false);
  });
});

describe('isOnlyImageIntent', () => {
  it('true для голого намерения без описания', () => {
    expect(isOnlyImageIntent('хочу картинку')).toBe(true);
    expect(isOnlyImageIntent('можешь нарисовать изображение')).toBe(true);
  });

  it('false, если есть содержательное описание сверх намерения', () => {
    expect(isOnlyImageIntent('хочу картинку кота на пляже')).toBe(false);
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
