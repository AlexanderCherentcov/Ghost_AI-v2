'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GhostIcon } from '@/components/icons/GhostIcon';
import {
  ChatIcon, VisionIcon, SoundIcon, ReelIcon, ThinkIcon,
  SparkleIcon, TokenIcon, ArrowDownIcon,
} from '@/components/icons';
import { SupportWidget } from '@/components/ui/SupportWidget';

const FEATURES = [
  {
    Icon: ChatIcon,
    label: 'Ghost Chat',
    color: '#7B5CF0',
    desc: 'Умные диалоги, анализ документов, написание кода, переводы и суммаризация. Самые передовые разработки в области AI.',
    wip: false,
  },
  {
    Icon: VisionIcon,
    label: 'Ghost Vision',
    color: '#5C8CF0',
    desc: 'Генерация изображений по текстовому описанию. Фотореализм, концепт-арт, иллюстрации — на пике качества.',
    wip: false,
  },
  {
    Icon: ReelIcon,
    label: 'Ghost Reel',
    color: '#F05C8C',
    desc: 'Генерация коротких видеоклипов по описанию. Передовые технологии AI-видео для ваших идей.',
    wip: false,
  },
  {
    Icon: ThinkIcon,
    label: 'Ghost Think',
    color: '#F0C85C',
    desc: 'Режим глубокого размышления для сложных задач. Рассуждает шаг за шагом, как лучший эксперт.',
    wip: false,
  },
  {
    Icon: SoundIcon,
    label: 'Ghost Music',
    color: '#5CF0C8',
    desc: 'Генерация музыкальных треков любого жанра. От атмосферного эмбиента до динамичной электроники.',
    wip: true,
  },
];

const PLANS = [
  {
    name: 'Базовый',
    price: 790,
    fakePrice: 1580,   // price × 2 (fake 50% off)
    caspers: 300,
    features: ['Стандартный чат: безлимит', '300 Caspers/мес', 'Картинки — 10 Caspers/шт', 'Видео — от 25 Caspers', 'Музыка — 5 Caspers/трек'],
    badge: null,
  },
  {
    name: 'Про',
    price: 1690,
    fakePrice: 3380,
    caspers: 700,
    features: ['Стандартный чат: безлимит', '700 Caspers/мес', 'Про чат: 20 запросов/день бесплатно', 'Картинки — 10 Caspers/шт', 'Видео — от 25 Caspers'],
    badge: 'Популярный',
  },
  {
    name: 'VIP',
    price: 3990,
    fakePrice: 7980,
    caspers: 1800,
    features: ['Стандартный чат: безлимит', '1 800 Caspers/мес', 'Про чат: 50 запросов/день бесплатно', 'Картинки — 10 Caspers/шт', 'Видео — от 25 Caspers'],
    badge: null,
  },
  {
    name: 'Ультра',
    price: 5990,
    fakePrice: 11980,
    caspers: 2800,
    features: ['Стандартный чат: безлимит', '2 800 Caspers/мес', 'Про чат: безлимит', 'Картинки — 10 Caspers/шт', 'Видео — от 25 Caspers'],
    badge: 'Максимум',
  },
];

const THESIS = [
  { Icon: SparkleIcon, title: 'Интеллектуальный роутинг', desc: 'Каждый запрос автоматически направляется к оптимальному AI-движку. Скорость там, где нужно — мощь там, где требуется.' },
  { Icon: TokenIcon,   title: 'Мгновенная скорость',      desc: 'Оптимизированная инфраструктура доставляет ответы быстрее, чем вы ожидаете. Каждый запрос обрабатывается с максимальной эффективностью.' },
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
            🎁 100 Caspers · 5 сообщений/день · 5 картинок/неделю · 3 видео/месяц · Без карты
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
            <h2 className="text-4xl font-medium tracking-tight mb-3">Наши духи.</h2>
            <p className="text-[rgba(255,255,255,0.4)]">Один аккаунт. Бесконечные возможности.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ Icon, label, desc, color, wip }, i) => (
              <motion.div
                key={label}
                className={`card card-interactive cursor-default relative ${wip ? 'opacity-60' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                {wip && (
                  <span className="absolute top-4 right-4 text-[10px] font-medium px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.4)]">
                    В разработке
                  </span>
                )}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${color}20` }}
                >
                  <Icon size={20} className="text-current" style={{ color: wip ? 'rgba(255,255,255,0.3)' : color }} />
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

          {/* Free tier note */}
          <div className="flex items-center justify-between bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl px-6 py-4 mb-6">
            <div>
              <span className="font-medium text-white">Бесплатный план</span>
              <span className="ml-3 text-sm text-[rgba(255,255,255,0.4)]">🎁 100 Caspers · 5 сообщений/день · 5 картинок/неделю · 3 видео/месяц · Без карты</span>
            </div>
            <Link href="/login" className="btn btn-ghost text-sm h-9 px-5 shrink-0">
              Начать бесплатно
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map(({ name, price, fakePrice, caspers, features, badge }, i) => (
              <motion.div
                key={name}
                className={`card relative flex flex-col ${badge === 'Максимум' ? 'border-accent shadow-accent' : badge === 'Популярный' ? 'border-accent/60' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                {badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-black text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap">
                    {badge}
                  </div>
                )}
                <h3 className="font-medium text-white mb-1">{name}</h3>
                <div className="mb-1">
                  <span className="text-xs text-[rgba(255,255,255,0.3)] line-through mr-2">
                    {fakePrice.toLocaleString('ru-RU')} ₽
                  </span>
                  <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">-50%</span>
                </div>
                <div className="mb-1">
                  <span className="text-2xl font-medium">{price.toLocaleString('ru-RU')} ₽</span>
                  <span className="text-sm text-[rgba(255,255,255,0.3)]">/мес</span>
                </div>
                <p className="text-xs text-accent mb-3">{caspers.toLocaleString('ru-RU')} Caspers/мес</p>
                <ul className="space-y-1.5 flex-1 mb-5">
                  {features.map((f) => (
                    <li key={f} className="text-sm text-[rgba(255,255,255,0.4)] flex items-center gap-2">
                      <span className="text-accent text-xs">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`w-full btn text-sm h-10 mt-auto ${badge ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Выбрать
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
            🎁 100 Caspers · 5 сообщений/день · 5 картинок/неделю · 3 видео/месяц · Без карты
          </p>
        </motion.div>
      </section>

      <SupportWidget />

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <GhostIcon size={18} className="text-accent" />
              <span className="text-sm text-[rgba(255,255,255,0.3)]">GhostLine AI · {new Date().getFullYear()}</span>
            </div>
            <a
              href="mailto:xxghostlinex@gmail.com"
              className="text-xs text-[rgba(255,255,255,0.2)] hover:text-[rgba(255,255,255,0.4)] transition-colors"
            >
              xxghostlinex@gmail.com
            </a>
          </div>
          <div className="flex items-center gap-6 text-sm text-[rgba(255,255,255,0.3)]">
            <Link href="/privacy" className="hover:text-white transition-colors">Политика конфиденциальности</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Условия использования</Link>
            <a href="https://t.me/ghostlineai" target="_blank" rel="noopener" className="hover:text-white transition-colors">
              Telegram
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
