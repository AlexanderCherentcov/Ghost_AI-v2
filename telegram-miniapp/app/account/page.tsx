'use client';


import { useEffect, useState } from 'react';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

type Theme = 'dark' | 'light';
type FontSize = 'small' | 'medium' | 'large';

function applyTheme(t: Theme) {
  const cl = document.documentElement.classList;
  cl.remove('dark', 'light'); cl.add(t);
  localStorage.setItem('theme', t);
}
function applyFontSize(f: FontSize) {
  const cl = document.documentElement.classList;
  cl.remove('font-small', 'font-medium', 'font-large');
  if (f !== 'medium') cl.add(`font-${f}`);
  localStorage.setItem('fontSize', f);
}

const SUPPORT_GROUP_URL = process.env.NEXT_PUBLIC_SUPPORT_GROUP_URL ?? 'https://t.me/GhostLineSupport_bot';

// Поля должны 1:1 совпадать с тем, что реально отдаёт GET /me (backend/src/routes/auth.ts) —
// раньше тут были придуманные images_today/*_daily_limit, которых бэкенд не возвращает,
// из-за чего лимиты на экране всегда падали на захардкоженные дефолты.
interface UserInfo {
  id: string;
  name: string | null;
  plan: string;
  std_messages_today: number;
  images_this_week:   number;
}

interface FreeLimits {
  std_messages_daily: number;
  images_weekly: number;
  music_weekly: number;
  videos_monthly: number;
}

// Ключи планов должны совпадать с PLAN_KEYS из backend/src/config/plans.ts —
// STANDARD был переименован в PRO в апреле 2026 (миграция 20260429_caspers_system) и здесь мёртвый.
const PLAN_LABELS: Record<string, string> = {
  FREE:  'Бесплатный',
  BASIC: 'Базовый',
  PRO:   'Про',
  VIP:   'VIP',
  ULTRA: 'Ультра',
};

function AccountApp() {
  const tg = useTg();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [freeLimits, setFreeLimits] = useState<FreeLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>('dark');
  const [fontSize, setFontSize] = useState<FontSize>('medium');

  useEffect(() => {
    setTheme((localStorage.getItem('theme') as Theme) || 'dark');
    setFontSize((localStorage.getItem('fontSize') as FontSize) || 'medium');
  }, []);

  useEffect(() => {
    apiRequest<UserInfo>('/me')
      .then((u) => setUser(u))
      .catch(() => {})
      .finally(() => setLoading(false));
    // Реальные лимиты FREE-тарифа — только с бэкенда (GET /plans), без локальных дефолтов
    apiRequest<{ free: { limits: FreeLimits } }>('/plans')
      .then((d) => setFreeLimits(d.free.limits))
      .catch(() => {});
  }, []);

  function openSupport() {
    tg?.HapticFeedback.impactOccurred('light');
    tg?.openLink(SUPPORT_GROUP_URL);
  }

  // На платных тарифах стандартный чат безлимитный, а недельная квота картинок FREE-тарифа не действует
  const isFree = user?.plan === 'FREE';
  const msgLimit = isFree ? (freeLimits?.std_messages_daily ?? '—') : '∞';
  const imgLimit = isFree ? (freeLimits?.images_weekly ?? '—') : '∞';

  return (
    <div className="flex flex-col h-screen pb-[60px]" style={{ background: 'var(--bg-void)' }}>
      {/* Шапка */}
      <div
        className="flex items-center px-4 pt-5 pb-4"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <span className="text-base font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>Аккаунт</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-4">
        {loading ? (
          <p className="text-center text-sm mt-10" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Загрузка...
          </p>
        ) : user ? (
          <div className="space-y-3">
            {/* Аватар + имя */}
            <div
              className="flex items-center gap-4 p-4 rounded-2xl"
              style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: 'rgba(123,92,240,0.15)' }}
              >
                👻
              </div>
              <div className="min-w-0">
                <p className="text-base font-medium text-white truncate">
                  {user.name ?? 'Ghost User'}
                </p>
                <span
                  className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
                  style={{ background: 'rgba(123,92,240,0.15)', color: 'var(--accent)' }}
                >
                  {PLAN_LABELS[user.plan] ?? user.plan}
                </span>
              </div>
            </div>

            {/* Использование */}
            <div
              className="p-4 rounded-2xl"
              style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Использование
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="p-3 rounded-xl text-center"
                  style={{ background: 'rgba(123,92,240,0.08)' }}
                >
                  <p className="text-xl font-medium" style={{ color: 'var(--accent)' }}>
                    {user.std_messages_today}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    из {msgLimit} сообщений сегодня
                  </p>
                </div>
                <div
                  className="p-3 rounded-xl text-center"
                  style={{ background: 'rgba(92,240,200,0.08)' }}
                >
                  <p className="text-xl font-medium" style={{ color: '#5CF0C8' }}>
                    {user.images_this_week}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    из {imgLimit} картинок за неделю
                  </p>
                </div>
              </div>
            </div>

            {/* Призыв перейти на платный тариф для FREE-плана */}
            {user.plan === 'FREE' && (
              <div
                className="p-4 rounded-2xl"
                style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Бесплатный план
                </p>
                <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {freeLimits
                    ? `${freeLimits.std_messages_daily} сообщений/день · ${freeLimits.images_weekly} картинок/нед`
                    : ' '}
                </p>
                <a
                  href="/balance"
                  className="block py-2.5 rounded-xl text-sm text-center font-medium"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  Улучшить тариф
                </a>
              </div>
            )}

            {/* Внешний вид */}
            <div
              className="p-4 rounded-2xl space-y-4"
              style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Внешний вид
              </p>
              {/* Тема */}
              <div>
                <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Тема</p>
                <div className="flex gap-2">
                  {(['dark', 'light'] as Theme[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTheme(t); applyTheme(t); }}
                      className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                      style={{
                        background: theme === t ? 'rgba(123,92,240,0.18)' : 'rgba(255,255,255,0.04)',
                        color: theme === t ? '#A78BFA' : 'rgba(255,255,255,0.4)',
                        border: theme === t ? '1px solid rgba(123,92,240,0.35)' : '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      {t === 'dark' ? '🌙 Тёмная' : '☀️ Светлая'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Размер шрифта */}
              <div>
                <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Размер шрифта</p>
                <div className="flex gap-2">
                  {([
                    { key: 'small' as FontSize,  label: 'A', desc: 'Мелкий' },
                    { key: 'medium' as FontSize, label: 'A', desc: 'Средний' },
                    { key: 'large' as FontSize,  label: 'A', desc: 'Крупный' },
                  ]).map(({ key, label, desc }, i) => (
                    <button
                      key={key}
                      onClick={() => { setFontSize(key); applyFontSize(key); }}
                      className="flex-1 py-2 flex flex-col items-center rounded-xl text-xs transition-all"
                      style={{
                        background: fontSize === key ? 'rgba(123,92,240,0.18)' : 'rgba(255,255,255,0.04)',
                        color: fontSize === key ? '#A78BFA' : 'rgba(255,255,255,0.4)',
                        border: fontSize === key ? '1px solid rgba(123,92,240,0.35)' : '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      <span style={{ fontSize: 11 + i * 2 }}>{label}</span>
                      <span className="text-[9px] mt-0.5 opacity-60">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Поддержка */}
            <div
              className="p-4 rounded-2xl"
              style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Помощь
              </p>
              <button
                onClick={openSupport}
                className="w-full py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(123,92,240,0.15)', color: 'var(--accent)' }}
              >
                💬 Написать в поддержку
              </button>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm mt-10" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Не удалось загрузить данные
          </p>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

export default function AccountPage() {
  return (
    <TelegramProvider>
      <AccountApp />
    </TelegramProvider>
  );
}
