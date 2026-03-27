'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GhostIcon } from '@/components/icons/GhostIcon';
import {
  ChatIcon, VisionIcon, SoundIcon, ReelIcon, ThinkIcon,
  SparkleIcon, TokenIcon, ArrowDownIcon,
} from '@/components/icons';

const FEATURES = [
  {
    Icon: ChatIcon,
    label: 'Ghost Chat',
    color: '#7B5CF0',
    desc: 'Умные диалоги, анализ документов, написание кода, переводы и суммаризация. Самые передовые разработки в области AI.',
  },
  {
    Icon: VisionIcon,
    label: 'Ghost Vision',
    color: '#5C8CF0',
    desc: 'Генерация изображений по текстовому описанию. Фотореализм, концепт-арт, иллюстрации — на пике качества.',
  },
  {
    Icon: SoundIcon,
    label: 'Ghost Sound',
    color: '#5CF0C8',
    desc: 'Генерация музыкальных треков любого жанра. От атмосферного эмбиента до динамичной электроники.',
  },
  {
    Icon: ReelIcon,
    label: 'Ghost Reel',
    color: '#F05C8C',
    desc: 'Генерация коротких видеоклипов по описанию. Передовые технологии AI-видео для ваших идей.',
  },
  {
    Icon: ThinkIcon,
    label: 'Ghost Think',
    color: '#F0C85C',
    desc: 'Режим глубокого размышления для сложных задач. Рассуждает шаг за шагом, как лучший эксперт.',
  },
];

const PLANS = [
  {
    name: 'Пробный',
    price: 0,
    tokens: '50',
    period: '7 дней',
    features: ['5 сообщений в день', '3 картинки в месяц', 'Без карты'],
    badge: null,
  },
  {
    name: 'Базовый',
    price: 499,
    tokens: '500',
    period: null,
    features: ['500 сообщений', '10 картинок'],
    badge: null,
  },
  {
    name: 'Стандарт',
    price: 999,
    tokens: '1 500',
    period: null,
    features: ['1 500 сообщений', '20 картинок'],
    badge: 'Популярный',
  },
  {
    name: 'Про',
    price: 2190,
    tokens: '4 000',
    period: null,
    features: ['4 000 сообщений', '50 картинок'],
    badge: null,
  },
  {
    name: 'Ультра',
    price: 4490,
    tokens: '10 000',
    period: null,
    features: ['10 000 сообщений', '120 картинок', 'Приоритетная обработка'],
    badge: 'Максимум',
  },
];

const THESIS = [
  { Icon: SparkleIcon, title: 'Интеллектуальный роутинг', desc: 'Каждый запрос автоматически направляется к оптимальному AI-движку. Скорость там, где нужно — мощь там, где требуется.' },
  { Icon: TokenIcon,   title: 'Мгновенный кэш',           desc: 'Популярные запросы обрабатываются мгновенно из умного кэша. Без ожидания, без лишних затрат токенов.' },
  { Icon: GhostIcon,   title: 'Всегда топ',               desc: 'Мы постоянно интегрируем новейшие AI-разработки. Вы автоматически получаете доступ к лучшему на рынке.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-void)] text-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-[var(--border)] backdrop-blur-xl bg-[rgba(10,10,18,0.8)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <GhostIcon size={24} className="text-accent" />
            <span className="font-medium text-sm tracking-tight">GhostLine</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-[rgba(255,255,255,0.45)]">
            <a href="#features" className="hover:text-white transition-colors">Возможности</a>
            <a href="#pricing" className="hover:text-white transition-colors">Тарифы</a>
            <a href="#about" className="hover:text-white transition-colors">О нас</a>
          </div>
          <Link
            href="/login"
            className="btn btn-primary text-sm h-9 px-5"
          >
            Войти
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-screen text-center px-6 overflow-hidden">
        {/* Ghost background text */}
        <span className="ghost-bg-text top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          GHOSTLINE
        </span>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10"
        >
          <GhostIcon size={56} className="text-accent animate-float mx-auto mb-6" animated />

          <motion.h1
            className="text-[clamp(40px,8vw,72px)] font-normal leading-tight tracking-[-0.04em] mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            Ваш AI-дух.
          </motion.h1>

          <motion.p
            className="text-lg text-[rgba(255,255,255,0.45)] mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            Думает. Создаёт. Исчезает в тишине.
          </motion.p>

          <motion.div
            className="flex items-center justify-center gap-4 flex-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
          >
            <Link href="/login" className="btn btn-primary text-base h-12 px-8">
              Начать бесплатно
            </Link>
            <a href="#features" className="btn btn-ghost text-base h-12 px-8">
              Смотреть возможности
            </a>
          </motion.div>

          <motion.p
            className="mt-6 text-xs text-[rgba(255,255,255,0.2)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.4 }}
          >
            Не нужна карта · 50 токенов бесплатно на 7 дней
          </motion.p>
        </motion.div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[rgba(255,255,255,0.2)]">
          <div className="w-px h-8 bg-gradient-to-b from-transparent to-current" />
          <ArrowDownIcon size={16} className="animate-bounce-slow" />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl font-medium tracking-tight mb-3">Четыре духа.</h2>
            <p className="text-[rgba(255,255,255,0.4)]">Один аккаунт. Бесконечные возможности.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ Icon, label, desc, color }, i) => (
              <motion.div
                key={label}
                className="card card-interactive cursor-default"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${color}20` }}
                >
                  <Icon size={20} className="text-current" style={{ color }} />
                </div>
                <h3 className="font-medium text-white mb-2">{label}</h3>
                <p className="text-sm text-[rgba(255,255,255,0.4)] leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-24 px-6 bg-[var(--bg-surface)] border-y border-[var(--border)]">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-medium tracking-tight mb-4">Технологии мирового класса</h2>
            <p className="text-[rgba(255,255,255,0.45)] max-w-xl mx-auto leading-relaxed">
              GhostLine работает на самых передовых AI-разработках сегодняшнего дня.
              Мы отбираем лучшее и объединяем в единый seamless-опыт.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {THESIS.map(({ Icon, title, desc }, i) => (
              <motion.div
                key={title}
                className="text-center"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mx-auto mb-4">
                  <Icon size={22} className="text-accent" />
                </div>
                <h3 className="font-medium text-white mb-2">{title}</h3>
                <p className="text-sm text-[rgba(255,255,255,0.4)] leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-medium tracking-tight mb-3">Простые тарифы.</h2>
            <p className="text-[rgba(255,255,255,0.4)]">Начните бесплатно. Прокачайтесь когда нужно.</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {PLANS.map(({ name, price, tokens, period, features, badge }, i) => (
              <motion.div
                key={name}
                className={`card relative ${badge ? 'border-accent shadow-accent' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                {badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-xs px-3 py-1 rounded-full">
                    {badge}
                  </div>
                )}
                <h3 className="font-medium text-white mb-1">{name}</h3>
                <div className="mb-3">
                  <span className="text-2xl font-medium">
                    {price === 0 ? 'Бесплатно' : `${price} ₽`}
                  </span>
                  {period && <span className="text-sm text-[rgba(255,255,255,0.3)] ml-1">· {period}</span>}
                </div>
                <div className="text-sm text-accent mb-3">{tokens} токенов</div>
                <ul className="space-y-1 mb-6">
                  {features.map((f) => (
                    <li key={f} className="text-sm text-[rgba(255,255,255,0.4)] flex items-center gap-2">
                      <span className="text-accent">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`w-full btn text-sm h-10 ${badge ? 'btn-primary' : 'btn-ghost'}`}
                >
                  {price === 0 ? 'Начать бесплатно' : 'Выбрать'}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <GhostIcon size={40} className="text-accent animate-float mx-auto mb-6" animated />
          <h2 className="text-4xl font-medium tracking-tight mb-4">
            Готовы встретить своего духа?
          </h2>
          <Link href="/login" className="btn btn-primary text-base h-12 px-10 mx-auto">
            Начать бесплатно
          </Link>
          <p className="mt-4 text-sm text-[rgba(255,255,255,0.2)]">
            Не нужна карта · 50 токенов бесплатно на 7 дней
          </p>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <GhostIcon size={18} className="text-accent" />
            <span className="text-sm text-[rgba(255,255,255,0.3)]">GhostLine AI · {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[rgba(255,255,255,0.3)]">
            <Link href="/privacy" className="hover:text-white transition-colors">Политика</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Условия</Link>
            <a href="https://t.me/ghostlineai" target="_blank" rel="noopener" className="hover:text-white transition-colors">
              Telegram
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
