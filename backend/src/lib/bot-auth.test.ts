import { describe, it, expect, beforeAll } from 'vitest';

// bot-auth.ts читает секреты из process.env на верхнем уровне модуля (throw,
// если их нет) — выставляем тестовые значения ДО импорта через динамический
// import в beforeAll, а не через обычный import (который был бы hoisted выше
// присваивания process.env).
let checkBotSecret: (request: any, reply: any) => boolean;
let checkAdminSecret: (request: any, reply: any) => boolean;
let checkSupportBotSecret: (request: any, reply: any) => boolean;

beforeAll(async () => {
  process.env.BOT_SECRET = 'test-bot-secret-1';
  process.env.ADMIN_BOT_SECRET = 'test-admin-secret-2';
  process.env.SUPPORT_BOT_SECRET = 'test-support-secret-3';
  const mod = await import('./bot-auth.js');
  checkBotSecret = mod.checkBotSecret;
  checkAdminSecret = mod.checkAdminSecret;
  checkSupportBotSecret = mod.checkSupportBotSecret;
});

function req(headers: Record<string, string>) {
  return { headers };
}

function reply() {
  const calls: { code?: number; body?: unknown } = {};
  return {
    code(c: number) { calls.code = c; return this; },
    send(b: unknown) { calls.body = b; return this; },
    calls,
  };
}

// Регрессия на утечку из этой сессии: раньше admin.ts, gallery.ts и support.ts
// все проверяли один и тот же BOT_SECRET, что и обычный юзер-бот — компрометация
// самого нагруженного/открытого бота давала полный доступ к /admin/*. Теперь три
// независимых секрета с разными заголовками — фиксируем, что они НЕ взаимозаменяемы.
describe('bot-auth — секреты трёх ботов независимы', () => {
  it('checkBotSecret пропускает только свой заголовок x-bot-secret со своим значением', () => {
    const rep = reply();
    expect(checkBotSecret(req({ 'x-bot-secret': 'test-bot-secret-1' }), rep)).toBe(true);
  });

  it('checkAdminSecret отклоняет значение BOT_SECRET, присланное в своём заголовке', () => {
    const rep = reply();
    expect(checkAdminSecret(req({ 'x-admin-bot-secret': 'test-bot-secret-1' }), rep)).toBe(false);
    expect(rep.calls.code).toBe(401);
  });

  it('checkAdminSecret отклоняет свой же верный секрет, присланный в чужом заголовке', () => {
    const rep = reply();
    expect(checkAdminSecret(req({ 'x-bot-secret': 'test-admin-secret-2' }), rep)).toBe(false);
  });

  it('checkSupportBotSecret не пропускает ADMIN_BOT_SECRET', () => {
    const rep = reply();
    expect(checkSupportBotSecret(req({ 'x-support-bot-secret': 'test-admin-secret-2' }), rep)).toBe(false);
  });

  it('checkAdminSecret пропускает только свой корректный секрет', () => {
    const rep = reply();
    expect(checkAdminSecret(req({ 'x-admin-bot-secret': 'test-admin-secret-2' }), rep)).toBe(true);
  });

  it('checkSupportBotSecret пропускает только свой корректный секрет', () => {
    const rep = reply();
    expect(checkSupportBotSecret(req({ 'x-support-bot-secret': 'test-support-secret-3' }), rep)).toBe(true);
  });

  it('отсутствующий заголовок отклоняется 401', () => {
    const rep = reply();
    expect(checkBotSecret(req({}), rep)).toBe(false);
    expect(rep.calls.code).toBe(401);
    expect(rep.calls.body).toEqual({ error: 'Unauthorized' });
  });

  it('пустая строка в заголовке отклоняется', () => {
    const rep = reply();
    expect(checkBotSecret(req({ 'x-bot-secret': '' }), rep)).toBe(false);
  });
});
