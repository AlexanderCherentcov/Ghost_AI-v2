import { describe, it, expect } from 'vitest';
import { CHAT_LIMIT_CODES, isChatLimitCode, shouldRefundCaspers, resolveChatErrorMessage } from './chat-errors.js';

describe('chat-errors — классификация кодов ошибок WS-чата', () => {
  it('LIMIT_PRO_MESSAGES — реальный код лимита платного чата — распознаётся как лимит', () => {
    // Регрессионный тест: раньше в списке был опечатанный 'LIMIT_FREE_MESSAGES',
    // которого tokens.ts никогда не бросает, из-за чего этот код проваливался
    // в общую ветку "Генерация провалась, попробуйте позже".
    expect(isChatLimitCode('LIMIT_PRO_MESSAGES')).toBe(true);
  });

  it('несуществующие/устаревшие коды не входят в список', () => {
    expect(CHAT_LIMIT_CODES).not.toContain('LIMIT_MESSAGES_DAILY');
    expect(CHAT_LIMIT_CODES).not.toContain('LIMIT_FREE_MESSAGES');
    expect(CHAT_LIMIT_CODES).not.toContain('LIMIT_STD_MESSAGES');
    expect(CHAT_LIMIT_CODES).not.toContain('LIMIT_FILES');
    expect(CHAT_LIMIT_CODES).not.toContain('FREE_LOCKED');
    expect(CHAT_LIMIT_CODES).not.toContain('PLAN_RESTRICTED');
  });

  it('undefined и неизвестный код — не лимит', () => {
    expect(isChatLimitCode(undefined)).toBe(false);
    expect(isChatLimitCode('SOME_UNKNOWN_CODE')).toBe(false);
  });

  it('shouldRefundCaspers: для лимита — false (списаний не было), для остальных — true', () => {
    expect(shouldRefundCaspers('LIMIT_PRO_MESSAGES')).toBe(false);
    expect(shouldRefundCaspers('SERVER_ERROR')).toBe(true);
    expect(shouldRefundCaspers(undefined)).toBe(true);
  });

  it('resolveChatErrorMessage: для лимита отдаёт точный текст с бэкенда', () => {
    expect(resolveChatErrorMessage('LIMIT_PRO_MESSAGES', 'Недостаточно Caspers для про-сообщения'))
      .toBe('Недостаточно Caspers для про-сообщения');
  });

  it('resolveChatErrorMessage: для лимита без текста — дефолт "Лимит исчерпан"', () => {
    expect(resolveChatErrorMessage('LIMIT_IMAGES', undefined)).toBe('Лимит исчерпан');
  });

  it('resolveChatErrorMessage: для НЕ-лимита всегда общий текст (не раскрываем детали провайдера)', () => {
    expect(resolveChatErrorMessage('SERVER_ERROR', 'connection reset by OpenRouter at 1.2.3.4'))
      .toBe('Генерация провалась, попробуйте позже');
  });
});
