import { describe, it, expect } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it('пропускает внутренние пути', () => {
    expect(safeRedirect('/chat')).toBe('/chat');
    expect(safeRedirect('/onboarding/name')).toBe('/onboarding/name');
    expect(safeRedirect('/billing?plan=PRO#x')).toBe('/billing?plan=PRO#x');
  });

  it('чужие адреса и опасные схемы заменяет на /chat', () => {
    expect(safeRedirect('https://evil.com')).toBe('/chat');
    expect(safeRedirect('http://evil.com/path')).toBe('/chat');
    expect(safeRedirect('javascript:alert(1)')).toBe('/chat');
    expect(safeRedirect('data:text/html,x')).toBe('/chat');
  });

  it('protocol-relative и обратный слэш — тоже чужой адрес', () => {
    expect(safeRedirect('//evil.com')).toBe('/chat');
    expect(safeRedirect('/\\evil.com')).toBe('/chat');
  });

  it('пустое значение и относительный путь без слэша дают запасной адрес', () => {
    expect(safeRedirect(null)).toBe('/chat');
    expect(safeRedirect(undefined)).toBe('/chat');
    expect(safeRedirect('')).toBe('/chat');
    expect(safeRedirect('chat')).toBe('/chat');
  });

  it('уважает свой запасной адрес', () => {
    expect(safeRedirect('https://evil.com', '/login')).toBe('/login');
  });
});
