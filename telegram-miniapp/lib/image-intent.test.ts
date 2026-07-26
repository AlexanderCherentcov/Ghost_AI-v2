import { describe, it, expect } from 'vitest';
import { isImageRequest, isImageEditRequest, isPromptComposeRequest, extractImagePrompt } from './image-intent';

describe('isImageRequest', () => {
  it('распознаёт глагол + существительное', () => {
    expect(isImageRequest('нарисуй картинку кота')).toBe(true);
    expect(isImageRequest('create an image of a cat')).toBe(true);
  });

  it('распознаёт точные фразы без глагола', () => {
    expect(isImageRequest('хочу картинку')).toBe(true);
  });

  it('не срабатывает без ключевых слов', () => {
    expect(isImageRequest('расскажи анекдот')).toBe(false);
  });
});

describe('isImageEditRequest — требует И глагол редактирования, И ссылку на картинку', () => {
  it('срабатывает только при обоих условиях сразу', () => {
    expect(isImageEditRequest('измени эту картинку')).toBe(true);
    expect(isImageEditRequest('добавь шляпу на это фото')).toBe(true);
  });

  it('НЕ срабатывает при одном только глаголе редактирования без ссылки на картинку', () => {
    // В отличие от сайта, миниапп требует явную ссылку на изображение
    expect(isImageEditRequest('измени план на завтра')).toBe(false);
  });

  it('НЕ срабатывает при ссылке на картинку без глагола редактирования', () => {
    expect(isImageEditRequest('покажи эту картинку')).toBe(false);
  });
});

describe('isPromptComposeRequest', () => {
  it('распознаёт просьбу написать промт, но не ссылку на готовый', () => {
    expect(isPromptComposeRequest('напиши промт для кота')).toBe(true);
    expect(isPromptComposeRequest('сгенерируй по этому промту')).toBe(false);
  });
});

describe('extractImagePrompt', () => {
  it('приоритет инлайн-кода', () => {
    const content = 'Вот: `a red sports car on a mountain road at sunset`';
    expect(extractImagePrompt(content)).toBe('a red sports car on a mountain road at sunset');
  });

  it('не падает на пустой строке', () => {
    expect(() => extractImagePrompt('')).not.toThrow();
  });

  it('обрезает до 600 символов', () => {
    const content = '`' + 'x'.repeat(1000) + '`';
    expect(extractImagePrompt(content).length).toBeLessThanOrEqual(600);
  });
});
