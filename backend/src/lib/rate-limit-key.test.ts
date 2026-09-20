import { describe, it, expect, afterEach } from 'vitest';
import {
  createRateLimitKey, rateLimitMax, rateLimitErrorBuilder,
  USER_RATE_LIMIT_PER_MIN, ANON_RATE_LIMIT_PER_MIN, AUTH_ANON_RATE_LIMIT_PER_MIN,
} from './rate-limit-key';

const verifyOk = (token: string) => {
  if (token === 'valid-user-1') return { userId: 'u1' };
  if (token === 'valid-user-2') return { userId: 'u2' };
  throw new Error('bad signature');
};

const keyOf = createRateLimitKey(verifyOk);

afterEach(() => { delete process.env.TRUST_PROXY; });

describe('createRateLimitKey', () => {
  it('разные пользователи за одним IP получают разные бакеты (главный сценарий: все за адресом nginx)', () => {
    const a = keyOf({ headers: { authorization: 'Bearer valid-user-1' }, ip: '172.18.0.1' });
    const b = keyOf({ headers: { authorization: 'Bearer valid-user-2' }, ip: '172.18.0.1' });
    expect(a).toBe('u:u1');
    expect(b).toBe('u:u2');
    expect(a).not.toBe(b);
  });

  it('анонимы делят один бакет по IP', () => {
    expect(keyOf({ headers: {}, ip: '172.18.0.1' })).toBe('ip:172.18.0.1');
  });

  it('невалидный токен не даёт пользовательский ключ — нельзя подделать чужой бакет или создать свой', () => {
    expect(keyOf({ headers: { authorization: 'Bearer forged' }, ip: '172.18.0.1' })).toBe('ip:172.18.0.1');
    expect(keyOf({ headers: { authorization: 'Basic abc' }, ip: '172.18.0.1' })).toBe('ip:172.18.0.1');
  });

  it('x-real-ip учитывается только при TRUST_PROXY=true', () => {
    const req = { headers: { 'x-real-ip': '203.0.113.7' }, ip: '172.18.0.1' };
    expect(keyOf(req)).toBe('ip:172.18.0.1');
    process.env.TRUST_PROXY = 'true';
    expect(keyOf(req)).toBe('ip:203.0.113.7');
  });
});

describe('rateLimitMax', () => {
  it('авторизованному — пользовательский лимит, анониму — общий потолок области', () => {
    expect(rateLimitMax(ANON_RATE_LIMIT_PER_MIN)({}, 'u:u1')).toBe(USER_RATE_LIMIT_PER_MIN);
    expect(rateLimitMax(ANON_RATE_LIMIT_PER_MIN)({}, 'ip:172.18.0.1')).toBe(ANON_RATE_LIMIT_PER_MIN);
    expect(rateLimitMax(AUTH_ANON_RATE_LIMIT_PER_MIN)({}, 'ip:172.18.0.1')).toBe(AUTH_ANON_RATE_LIMIT_PER_MIN);
  });

  it('общий анонимный потолок заметно выше старых 200/мин на весь сайт', () => {
    expect(ANON_RATE_LIMIT_PER_MIN).toBeGreaterThan(200 * 10);
    expect(AUTH_ANON_RATE_LIMIT_PER_MIN).toBeGreaterThan(20 * 10);
  });
});

describe('rateLimitErrorBuilder', () => {
  it('отдаёт statusCode 429 (без него пользователь получал 500) и понятное сообщение', () => {
    const body = rateLimitErrorBuilder({}, { after: '1 минуту' });
    expect(body.statusCode).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.message).toContain('1 минуту');
  });
});
