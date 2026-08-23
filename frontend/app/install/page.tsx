'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppleIcon, AndroidIcon, WindowsIcon } from '@/components/icons/PlatformIcons';

type Platform = 'ios' | 'android' | 'windows' | 'mac';

const PLATFORMS: { id: Platform; label: string; Icon: (p: { size?: number; className?: string }) => JSX.Element }[] = [
  { id: 'ios', label: 'iPhone / iPad', Icon: AppleIcon },
  { id: 'android', label: 'Android', Icon: AndroidIcon },
  { id: 'windows', label: 'Windows', Icon: WindowsIcon },
  { id: 'mac', label: 'Mac', Icon: AppleIcon },
];

interface Method {
  browser: string;
  steps: string[];
  warning?: string;
}

interface PlatformInfo {
  title: string;
  methods: Method[];
  note?: string;
}

// Проверено вживую по актуальным источникам (2024–2026), не по памяти — см. обсуждение
// с Александром: он справедливо усомнился в старой версии текста «только Safari на iOS»
// и «Safari на Mac вообще не умеет» — оба утверждения устарели.
const STEPS: Record<Platform, PlatformInfo> = {
  ios: {
    title: 'Установка на iPhone и iPad',
    methods: [
      {
        browser: 'Safari',
        steps: [
          'Откройте ghostlineai.ru в Safari.',
          'Нажмите кнопку «Поделиться» в панели инструментов (квадрат со стрелкой вверх).',
          'Пролистайте вниз и выберите «На экран «Домой»».',
          'Нажмите «Добавить» в правом верхнем углу.',
        ],
      },
      {
        browser: 'Chrome / Edge',
        steps: [
          'Откройте ghostlineai.ru.',
          'Нажмите значок «Поделиться» в адресной строке.',
          'Выберите «На экран «Домой»».',
          'Нажмите «Добавить».',
        ],
        warning: 'С iOS 16.4 Chrome и Edge на iPhone тоже умеют добавлять сайт на экран «Домой» — на iOS все браузеры технически работают на движке Safari, это требование Apple, а не наше ограничение.',
      },
    ],
    note: 'Иконка GhostLine появится на главном экране и будет открываться в полноэкранном режиме, как обычное приложение.',
  },
  android: {
    title: 'Установка на Android',
    methods: [
      {
        browser: 'Chrome',
        steps: [
          'Откройте ghostlineai.ru в Chrome.',
          'Нажмите значок установки справа в адресной строке — если его не видно, откройте меню (три точки) → «Установить приложение».',
          'Подтвердите установку во всплывающем окне.',
        ],
      },
    ],
    note: 'После установки GhostLine появится в списке приложений и на рабочем столе, как обычное приложение из Google Play. В Samsung Internet и Firefox для Android установка тоже доступна через меню браузера, но там это чаще создаёт просто ярлык-закладку, а не полноценное приложение — для лучшего результата используйте Chrome.',
  },
  windows: {
    title: 'Установка на Windows',
    methods: [
      {
        browser: 'Chrome / Edge',
        steps: [
          'Откройте ghostlineai.ru в Chrome или Edge.',
          'Справа в адресной строке нажмите на иконку установки (экран со стрелкой вниз) — если её не видно, откройте меню (три точки) → «Установить GhostLine».',
          'Подтвердите установку во всплывающем окне.',
        ],
      },
    ],
    note: 'GhostLine откроется в отдельном окне без адресной строки и появится в меню «Пуск». В Firefox установка PWA как приложения не поддерживается — используйте Chrome или Edge.',
  },
  mac: {
    title: 'Установка на Mac',
    methods: [
      {
        browser: 'Safari (macOS Sonoma и новее)',
        steps: [
          'Откройте ghostlineai.ru в Safari.',
          'В строке меню выберите «Файл» → «Добавить в Dock…» (или значок «Поделиться» → «Добавить в Dock»).',
          'Введите имя и нажмите «Добавить».',
        ],
        warning: 'На macOS старше Sonoma (14) у Safari нет этой функции — используйте способ через Chrome или Edge ниже.',
      },
      {
        browser: 'Chrome / Edge',
        steps: [
          'Откройте ghostlineai.ru в Chrome или Edge.',
          'Справа в адресной строке нажмите на иконку установки (экран со стрелкой вниз) — если её не видно, откройте меню (три точки) → «Установить GhostLine».',
          'Подтвердите установку во всплывающем окне.',
        ],
      },
    ],
    note: 'GhostLine откроется в отдельном окне и появится в Launchpad (Chrome/Edge) или в Dock (Safari).',
  },
};

export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform>('ios');

  // Ссылка с главной страницы ведёт сразу на нужную платформу — ?platform=android и т.п.
  // Через window.location вместо useSearchParams: последний в App Router требует
  // оборачивать страницу в Suspense при статической генерации, а это простая витрина.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('platform');
    if (p === 'ios' || p === 'android' || p === 'windows' || p === 'mac') setPlatform(p);
  }, []);

  const active = STEPS[platform];

  return (
    <div className="min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--panel-glass-border)] py-4 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-[rgba(255,255,255,0.5)] hover:text-white transition-colors">
            <img src="/ghostline-logo-icon.png" alt="" className="w-5 h-5 rounded-[5px] object-cover" />
            GhostLine AI
          </Link>
          <Link href="/chat" className="text-sm text-[#c4b5fd] hover:opacity-80 transition-opacity">
            Открыть чат →
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-bold mb-2">Установить GhostLine как приложение</h1>
        <p className="text-sm text-[rgba(255,255,255,0.5)] mb-8 leading-relaxed">
          GhostLine — это веб-приложение (PWA): устанавливать через App Store или Google Play не нужно,
          иконка добавляется прямо из браузера по ссылке ghostlineai.ru. Выберите вашу платформу:
        </p>

        <div className="flex gap-2 mb-8 flex-wrap">
          {PLATFORMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setPlatform(id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all"
              style={
                platform === id
                  ? { borderColor: 'var(--accent-border)', background: 'var(--accent-dim)', color: '#c4b5fd' }
                  : { borderColor: 'var(--panel-glass-border)', color: 'rgba(255,255,255,0.55)' }
              }
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl p-7" style={{ background: 'var(--panel-glass)', border: '1px solid var(--panel-glass-border)' }}>
          <h2 className="font-display font-semibold text-lg mb-5">{active.title}</h2>

          {active.methods.map((method, mi) => (
            <div key={method.browser} className={mi > 0 ? 'mt-6 pt-6 border-t' : ''} style={mi > 0 ? { borderColor: 'var(--panel-glass-border)' } : {}}>
              {active.methods.length > 1 && (
                <p className="text-xs font-bold uppercase tracking-wider mb-3.5" style={{ color: '#c4b5fd' }}>{method.browser}</p>
              )}
              <ol className="space-y-4">
                {method.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-[rgba(255,255,255,0.75)]">
                    <span
                      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-display font-bold"
                      style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: '#c4b5fd' }}
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
              {method.warning && (
                <p className="mt-3 pl-9 text-xs leading-relaxed text-[rgba(255,255,255,0.4)]">{method.warning}</p>
              )}
            </div>
          ))}

          {active.note && (
            <p className="text-xs leading-relaxed text-[rgba(255,255,255,0.4)] pt-5 mt-5 border-t" style={{ borderColor: 'var(--panel-glass-border)' }}>
              {active.note}
            </p>
          )}
        </div>

        <p className="text-xs text-[rgba(255,255,255,0.3)] mt-8 leading-relaxed">
          Установленный GhostLine работает как обычная страница в браузере — офлайн-режим пока не поддерживается,
          для ответов всегда нужен интернет.
        </p>
      </main>
    </div>
  );
}
