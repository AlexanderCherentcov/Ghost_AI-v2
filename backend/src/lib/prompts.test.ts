import { describe, it, expect } from 'vitest';
import { getSystemPrompt } from './prompts.js';

// Регрессия: раньше урезанный "free"-промпт (100-200 слов + апселл на платный
// тариф) зависел от user.plan === 'FREE' — FREE-пользователь, явно оплативший
// Caspers'ами топовую модель, всё равно получал урезанный ответ. Теперь это
// зависит только от isFreeMessage (billedCost === 0 на стороне chat.ts) —
// оплачено сообщение или покрылось бесплатной дневной квотой, а не от тарифа.
describe('getSystemPrompt — ограничение "free" зависит от оплаты сообщения, не от тарифа', () => {
  it('isFreeMessage=true — всегда даёт урезанный промпт с апселлом, независимо от mode', () => {
    const promptThink = getSystemPrompt('think', null, true, 'DeepSeek V3.2');
    const promptChat = getSystemPrompt('chat', null, true, 'DeepSeek V3.2');
    expect(promptThink).toContain('100-200 слов');
    expect(promptThink).toContain('платный тариф');
    expect(promptChat).toContain('100-200 слов');
  });

  it('isFreeMessage=false + mode=think — даёт полный "think"-промпт без урезания, даже если формально FREE-план заплатил Caspers', () => {
    const prompt = getSystemPrompt('think', null, false, 'GPT-4o');
    expect(prompt).not.toContain('100-200 слов');
    expect(prompt).not.toContain('платный тариф');
    expect(prompt).toContain('Думай пошагово');
  });

  it('isFreeMessage=false + mode=chat — обычный чат-промпт, не think и не free', () => {
    const prompt = getSystemPrompt('chat', null, false, 'Claude Haiku 4.5');
    expect(prompt).not.toContain('100-200 слов');
    expect(prompt).not.toContain('Думай пошагово');
    expect(prompt).toContain('Режим: Chat');
  });

  it('неизвестный mode без isFreeMessage откатывается на обычный chat-промпт', () => {
    const prompt = getSystemPrompt('unknown-mode', null, false);
    expect(prompt).toContain('Режим: Chat');
  });
});

describe('getSystemPrompt — стиль ответа и имя модели', () => {
  it('подставляет реальное имя модели в правило идентичности', () => {
    const prompt = getSystemPrompt('chat', null, false, 'Gemini 2.5 Pro');
    expect(prompt).toContain('Gemini 2.5 Pro');
  });

  it('без имени модели — честный фолбэк без выдуманного бренда', () => {
    const prompt = getSystemPrompt('chat', null, false);
    expect(prompt).not.toMatch(/отвечаю на базе/);
  });

  it('известный responseStyle добавляет инструкцию стиля', () => {
    const prompt = getSystemPrompt('chat', 'strict', false);
    expect(prompt).toContain('Никакой воды');
  });

  it('неизвестный responseStyle молча игнорируется, а не ломает промпт', () => {
    const prompt = getSystemPrompt('chat', 'not-a-real-style', false);
    expect(prompt).toContain('Режим: Chat');
  });
});
