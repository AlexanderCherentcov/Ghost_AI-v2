'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChatIcon, VisionIcon, SoundIcon, ReelIcon, MicIcon,
  SparkleIcon, TokenIcon, ArrowDownIcon, CheckIcon,
  AppleIcon, AndroidIcon, WindowsIcon,
} from '@/components/icons';
import { ParticleBrainField } from '@/components/landing/ParticleBrainField';
import { HeroVideoBackground } from '@/components/landing/HeroVideoBackground';
import { SupportWidget } from '@/components/ui/SupportWidget';
import { api, type PlanInfo, type GalleryItem } from '@/lib/api';
import { loadFeatureModelNames, topNames, type FeatureModelNames } from '@/lib/model-display';
import { fakeCyclePrice, freeTierTagline, cheapestCosts, maxGenerations, type CheapestCosts } from '@/lib/pricing';
import { formatNumber, capitalizeFirst } from '@/lib/utils';
import { PlanFeatureList } from '@/components/billing/PlanFeatureList';
import { UserBalanceNav } from '@/components/layout/UserBalanceNav';
import { useAuthStore } from '@/store/auth.store';

// Заметно темнее и непрозрачнее стандартного --panel-glass — карточки на лендинге
// сидят поверх постоянно движущегося canvas с частицами, обычная прозрачность
// давала бликам частиц перебивать текст внутри карточек.
const CARD_BG = 'rgba(14,10,24,.86)';

// Градиенты для плиток-заглушек витрины генераций в хиро — только для визуального
// разнообразия, не привязаны к конкретным моделям.
const SHOWCASE_GRADIENTS = [
  'linear-gradient(135deg, rgba(123,92,240,.35), rgba(20,15,35,.9))',
  'linear-gradient(135deg, rgba(45,212,191,.3), rgba(20,15,35,.9))',
  'linear-gradient(135deg, rgba(244,114,182,.28), rgba(20,15,35,.9))',
  'linear-gradient(135deg, rgba(251,191,36,.25), rgba(20,15,35,.9))',
  'linear-gradient(135deg, rgba(96,165,250,.3), rgba(20,15,35,.9))',
  'linear-gradient(135deg, rgba(167,139,250,.32), rgba(20,15,35,.9))',
];
const SHOWCASE_TILE_HEIGHT = 'h-44';

// Реальные режимы продукта (см. inputbar/types.ts:ChatMode) — без вымышленных
// возможностей вроде старого "Ghost Think": тот режим был убран из реестра моделей
// ещё в прошлой итерации, оставлять его в маркетинге было бы враньём.
// Подсветка названий моделей акцентным цветом в тексте карточек — чтобы они
// были заметны на фоне приглушённого описания, не сливались в общий абзац.
function M({ children }: { children: ReactNode }) {
  return <strong style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>{children}</strong>;
}

// Названия моделей в карточках — живые данные с бэкенда (см. lib/model-display.ts),
// не хардкод. Пока модели не загрузились — короткая заглушка вместо пустоты.
function joinHighlighted(names: string[], fallback: string): ReactNode {
  if (names.length === 0) return <M>{fallback}</M>;
  return names.map((name, i) => (
    <span key={name}>
      <M>{name}</M>
      {i < names.length - 2 ? ', ' : i === names.length - 2 ? ' и ' : ''}
    </span>
  ));
}

function buildFeatures(models: FeatureModelNames | null) {
  const chat = topNames(models?.chat ?? [], 5);
  const image = models?.image ?? [];
  const video = models?.video ?? [];
  return [
    {
      Icon: ChatIcon,
      label: 'Чат',
      tag: 'AI-диалоги',
      desc: (
        <>
          {joinHighlighted(chat, 'Топ ИИ-моделей')} — в одном чате, без переключения вкладок и лишних подписок. Не знаете, какую выбрать — включите «Авто»: сама подберёт нужную и сэкономит Caspers.
        </>
      ),
    },
    {
      Icon: VisionIcon,
      label: 'Картинка',
      tag: 'Генерация изображений',
      desc: (
        <>
          {joinHighlighted(image, 'Топ моделей')} — рисуют по описанию и редактируют то, что уже сгенерировали. Не понравилась деталь — поправьте одной фразой, без пересборки промпта с нуля.
        </>
      ),
    },
    {
      Icon: ReelIcon,
      label: 'Видео',
      tag: 'Генерация видео',
      desc: (
        <>
          Текст или фото на входе — готовый ролик с озвучкой на выходе. {joinHighlighted(video, 'Топ видеомоделей')} — весь топ видео уже подключён, отдельные подписки не нужны.
        </>
      ),
    },
    {
      Icon: SoundIcon,
      label: 'Музыка',
      tag: 'Генерация музыки',
      desc: (
        <>
          Опишите настроение или пришлите текст песни — <M>Suno</M> соберёт трек за пару минут. Без студии и музыкального образования.
        </>
      ),
    },
    {
      Icon: MicIcon,
      label: 'Голос',
      tag: 'Голосовой чат',
      desc: 'Скажите — а не напечатайте. GhostLine услышит, ответит по делу и озвучит ответ голосом.',
    },
  ];
}

const INSTALL_PLATFORMS = [
  { id: 'ios', label: 'iPhone / iPad', Icon: AppleIcon },
  { id: 'android', label: 'Android', Icon: AndroidIcon },
  { id: 'windows', label: 'Windows', Icon: WindowsIcon },
  { id: 'mac', label: 'Mac', Icon: AppleIcon },
];

const THESIS = [
  { Icon: SparkleIcon, title: 'Всё в одном месте', desc: 'Не нужно оформлять отдельную подписку на каждый сервис — один аккаунт, одна валюта Caspers на все модели и режимы.' },
  { Icon: TokenIcon, title: 'Без сложной регистрации', desc: 'Вход в один клик — Google, Яндекс или Telegram. Без анкет, без паролей, без банковской карты для старта.' },
  { Icon: CheckIcon, title: 'Работает из России', desc: 'Никакого VPN и зарубежных карт — мы уже решили вопрос доступа, вам остаётся только пользоваться.' },
];

const STEPS = [
  { n: 1, title: 'Войдите в один клик', desc: 'Google, Яндекс или Telegram — без анкет и паролей. 100 Caspers дарим сразу.' },
  { n: 2, title: 'Выберите режим', desc: 'Диалог, изображение, видео, музыка или голос — переключайтесь в любой момент, не теряя историю.' },
  { n: 3, title: 'Получите результат', desc: 'GhostLine сам подберёт модель в режиме «Авто» или отработает именно ту, что вы выбрали явно — без подмены и переплаты.' },
];

// Сценарий использования под каждый платный тариф — переводит абстрактные Caspers
// в понятную картину "для чего это", как это делают конкуренты (BotHub: "хватит на
// 5-7 книг" вместо голых цифр). Не завязано на конкретные счётчики генераций —
// они уже показаны строкой ниже ("+ До N изображений/видео/треков").
const PLAN_SCENARIO: Record<string, string> = {
  BASIC: 'Для регулярного чата с парой картинок и видео в неделю',
  PRO: 'Для активной работы: чат каждый день и генерации несколько раз в неделю',
  VIP: 'Для команды или контент-плана: видео и картинки без счёта',
  ULTRA: 'Для максимальной нагрузки: безлимитные платные модели чата и генерации без остановки',
};

// ЗАГЛУШКА: черновые отзывы, ещё не от реальных пользователей — Александр пришлёт
// настоящие цитаты (анонимизированные из тикетов/Telegram), заменить перед деплоем
// в прод. Специально без имён/должностей/компаний, чтобы не выдавать за реальных
// людей то, чем они пока не являются.
const TESTIMONIALS = [
  { quote: 'Раньше платил за три отдельные подписки — теперь всё в одном месте и выходит дешевле.', plan: 'Тариф PRO' },
  { quote: 'Понравилось, что можно выбрать конкретную модель, а не гадать, что подставится под капотом.', plan: 'Тариф BASIC' },
  { quote: 'Видео в Kling и Veo без VPN — то, чего не хватало весь последний год.', plan: 'Тариф VIP' },
  { quote: 'Бесплатного тарифа хватило, чтобы понять, что это работает — апгрейднулся в первую неделю.', plan: 'Тариф PRO' },
];

const FAQ = [
  { q: 'Что такое Caspers?', a: 'Caspers — единая внутренняя валюта GhostLine. Ей оплачиваются все действия: диалоги с платными моделями, генерация изображений, видео, музыки и голосовые ответы.' },
  { q: 'Нужна ли банковская карта для регистрации?', a: 'Нет. Вход через Google, Яндекс или Telegram в один клик, без карты — на счёт сразу начисляются приветственные Caspers.' },
  { q: 'GhostLine точно работает из России?', a: 'Да — доступ к моделям организован на нашей стороне, вам не нужен VPN или зарубежная карта.' },
  { q: 'Можно ли выбрать конкретную модель, а не «Авто»?', a: 'Да. В чате, изображениях и видео можно явно выбрать модель — тогда работает именно она, и списание идёт по её реальной цене, без подмены на более дешёвую.' },
  { q: 'Можно ли сменить тариф позже?', a: 'Да, тариф можно повысить или понизить в любой момент в настройках аккаунта — неизрасходованные Caspers не сгорают при смене тарифа, а суммируются с новым начислением.' },
  { q: 'Хранится ли история переписки?', a: 'Да, только для вашего удобства — доступна лишь вам и удаляется по вашему запросу.' },
];

export default function LandingPage() {
  // Залогиненный посетитель, вернувшийся на лендинг (например по ссылке из поиска) —
  // показываем баланс Caspers в шапке вместо "Войти/Начать бесплатно" (см. auth.store,
  // уже гидратируется из localStorage при монтировании provider'а).
  const { user } = useAuthStore();
  // Тарифы — только с бэкенда (GET /plans), без локальной копии цифр
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  // Бонус/лимит FREE-тарифа для маркетинговой строки — тоже с бэкенда, не захардкожены
  const [tagline, setTagline] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState(0);
  const [modelNames, setModelNames] = useState<FeatureModelNames | null>(null);
  // Самая дешёвая модель в каждом домене — чтобы честно посчитать "до скольки
  // картинок/видео/треков хватит Caspers на тарифе", а не выдумывать цифры. Если
  // появится модель дешевле — пересчитается само, без правок текста на странице.
  const [cheapest, setCheapest] = useState<CheapestCosts | null>(null);
  // Витрина в хиро и отдельная секция "Галерея работ" ниже — один и тот же
  // источник данных (не дублируем запрос): топ по лайкам, добор случайными,
  // если лайкнутых меньше лимита (см. backend/src/services/gallery.ts:listFeatured,
  // решение Александра 2026-08-25 "если топа нет — рандомные"). Хиро берёт первые
  // 6, секция — все до 10. Пока в галерее вообще ничего нет (пустой массив) —
  // в хиро остаётся честная плейсхолдер-плитка (SHOWCASE_ITEMS ниже), а секция
  // целиком скрывается — см. рендер секции.
  const [galleryFeatured, setGalleryFeatured] = useState<GalleryItem[]>([]);
  useEffect(() => {
    api.payments.plans().then((data) => {
      setPlans(data.plans);
      setTagline(freeTierTagline(data.free.limits.chat_daily));
      setCheapest(cheapestCosts(data.models.image, data.models.video, data.casper_costs.music_generate ?? 5));
    }).catch(() => {});
    loadFeatureModelNames().then(setModelNames).catch(() => {});
    api.gallery.featured(10).then((data) => setGalleryFeatured(data.items)).catch(() => {});
  }, []);
  const FEATURES = buildFeatures(modelNames);
  // Плейсхолдер-плитки — реальные названия моделей с бэкенда, но без превью
  // (используются, только пока галерея пуста, см. galleryTop выше).
  const SHOWCASE_ITEMS = [
    ...topNames(modelNames?.image ?? [], 3).map((name) => ({ name, domain: 'image' as const })),
    ...topNames(modelNames?.video ?? [], 3).map((name) => ({ name, domain: 'video' as const })),
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-void)] text-white overflow-x-hidden">
      {/* Фирменный градиентный фон — как в редизайне: мягкое свечение по углам + лёгкая сетка */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 18% 12%, rgba(123,92,240,.24), transparent 42%),' +
            'radial-gradient(circle at 84% 8%, rgba(45,212,191,.14), transparent 38%),' +
            'radial-gradient(circle at 78% 78%, rgba(242,181,68,.08), transparent 40%),' +
            'radial-gradient(circle at 12% 82%, rgba(91,63,214,.18), transparent 42%),' +
            'linear-gradient(165deg, var(--bg-primary) 0%, var(--bg-void) 46%, var(--bg-primary) 100%)',
        }}
      />
      {/* Дрейфующая сетка поверх градиента, замаскированная в круг по центру — как в мокапе */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(167,139,250,.08) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(167,139,250,.08) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          animation: 'gridDrift 14s linear infinite',
          maskImage: 'radial-gradient(circle at 50% 30%, rgba(0,0,0,.9), transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 30%, rgba(0,0,0,.9), transparent 72%)',
        }}
      />
      {/* Полноэкранный canvas с частицами мозга — сдвигается по скроллу, парраллакс как в мокапе */}
      <ParticleBrainField />

      {/* Затемняющие виньетки НАД canvas — держат текст читаемым везде на странице,
          не только в hero (в мокапе это тоже fixed-оверлеи на всю страницу, не scoped). */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 34%, rgba(5,3,17,.4) 0%, rgba(5,3,17,.75) 55%, rgba(5,3,17,.97) 100%),' +
            'linear-gradient(90deg, rgba(5,3,17,.92) 0%, rgba(5,3,17,.75) 32%, rgba(5,3,17,.45) 58%, rgba(5,3,17,.45) 100%)',
        }}
      />

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--panel-glass-border)] backdrop-blur-xl bg-[rgba(6,5,14,0.72)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/ghostline-logo-icon.png"
              alt="GhostLine"
              className="w-9 h-9 rounded-[9px] object-cover"
              style={{ filter: 'drop-shadow(0 0 10px rgba(123,92,240,.55))' }}
            />
            <span className="font-display font-bold text-base tracking-tight">GhostLine</span>
          </div>
          {/* lg, не md: на 768px логотип + 4 ссылки + Войти + Начать бесплатно физически
              не помещаются в ширину — переносятся и наезжают друг на друга. Планшеты
              видят только кнопки, ссылки появляются с lg (1024px), где места хватает. */}
          <div className="hidden lg:flex items-center gap-7 text-sm">
            <a href="#features" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Возможности</a>
            <a href="#how" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Как это работает</a>
            <a href="#pricing" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Тарифы</a>
            <a href="#faq" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <UserBalanceNav caspersBalance={user.caspers_balance} />
            ) : (
              <>
                {/* Оборачиваем в div, а не вешаем hidden прямо на .btn: .btn — обычный CSS-класс
                    с display:inline-flex в globals.css, при равной specificity с .hidden он
                    выигрывает по порядку в каскаде и перебивает скрытие на мобильных. */}
                <div className="hidden sm:block">
                  <Link href="/login" className="btn text-sm h-9 px-5" style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', color: '#c4b5fd' }}>
                    Войти
                  </Link>
                </div>
                <Link href="/login" className="btn btn-primary text-sm h-9 px-5">
                  Начать бесплатно
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero — на весь первый экран (min-h-screen, не 92vh): видео-фон внутри секции
            должно занимать буквально всю ширину/высоту, а не почти всю. min- вместо
            фиксированной h-screen — чтобы контент не обрезался на низких viewport. */}
        <section id="hero" className="relative flex items-center min-h-screen py-20 overflow-hidden">
          {/* Видео-фон — скроллится вместе с hero (не fixed), поэтому ниже по странице
              открывается обычный ParticleBrainField, который лежит fixed под всей
              страницей (см. рендер выше). Рендерит null, пока нет реального файла —
              см. компонент. */}
          <HeroVideoBackground />

          {/* Тот же max-w-6xl mx-auto px-6, что и в навбаре — иначе на широких экранах текст
              съезжает левее шапки вместо того, чтобы быть в общем контейнере страницы. */}
          <div className="relative z-10 max-w-6xl mx-auto px-6 w-full flex items-center justify-between gap-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative z-10 max-w-xl text-left min-w-0 lg:shrink-0"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6 text-xs font-semibold tracking-wide" style={{ borderColor: 'var(--accent-border)', background: 'var(--panel-glass)', color: '#c4b5fd' }}>
              ✦ ВСЕ AI В ОДНОМ МЕСТЕ
            </div>

            <h1 className="font-display text-[clamp(38px,6vw,64px)] font-bold leading-[1.05] tracking-[-0.03em] mb-5">
              Думает. Создаёт.<br />
              <span style={{ color: '#a78bfa', textShadow: '0 0 34px rgba(167,139,250,.55)' }}>Работает из России.</span>
            </h1>

            <p className="text-lg leading-relaxed text-[rgba(255,255,255,0.55)] mb-8 max-w-lg">
              GPT-4o, Claude, Gemini, DeepSeek, Perplexity, Kling, Sora — в одном аккаунте, без VPN и отдельных подписок.
              Вход в один клик через Google, Яндекс или Telegram.
            </p>

            <div className="flex items-center gap-4 flex-wrap mb-8">
              <Link href="/login" className="btn btn-primary text-base h-12 px-8">
                Начать бесплатно →
              </Link>
              <a href="#features" className="btn btn-ghost text-base h-12 px-8">
                Смотреть возможности
              </a>
            </div>

            <div className="flex gap-3 flex-wrap">
              {[tagline ?? '100 Caspers в подарок', 'Без сложной регистрации', 'Отменить в любой момент'].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs" style={{ background: 'var(--panel-glass)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.75)' }}>
                  {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Витрина генераций — плейсхолдер-плитки, см. комментарий у SHOWCASE_ITEMS.
              Скрыта до lg: на узких экранах места под неё нет рядом с текстом. */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="hidden lg:grid grid-cols-2 gap-4 w-[380px] shrink-0"
          >
            {galleryFeatured.length > 0 ? (
              galleryFeatured.slice(0, 6).map((item) => (
                <Link
                  key={item.id}
                  href="/gallery"
                  className={`group relative rounded-2xl overflow-hidden block ${SHOWCASE_TILE_HEIGHT}`}
                  style={{ border: '1px solid rgba(255,255,255,.12)' }}
                >
                  {item.domain === 'video' ? (
                    <video src={item.mediaUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />
                  ) : (
                    <img src={item.mediaUrl} alt={item.prompt} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  )}
                  <div
                    className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-[11px] truncate opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'linear-gradient(180deg, transparent, rgba(6,5,14,.85))', color: 'rgba(255,255,255,.85)' }}
                  >
                    {item.modelLabel} · {capitalizeFirst(item.authorName)}
                  </div>
                </Link>
              ))
            ) : (
              SHOWCASE_ITEMS.map((item, i) => (
                <div
                  key={`${item.domain}-${item.name}`}
                  className={`relative rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-2 ${SHOWCASE_TILE_HEIGHT}`}
                  style={{
                    background: SHOWCASE_GRADIENTS[i],
                    border: '1px dashed rgba(255,255,255,.18)',
                  }}
                >
                  {item.domain === 'video' ? (
                    <ReelIcon size={22} className="opacity-40" />
                  ) : (
                    <VisionIcon size={22} className="opacity-40" />
                  )}
                  <span
                    className="absolute bottom-2 left-2 right-2 truncate text-[11px] px-2 py-1 rounded-lg text-center"
                    style={{ background: 'rgba(6,5,14,0.65)', color: 'rgba(255,255,255,.7)' }}
                  >
                    {item.name}
                  </span>
                </div>
              ))
            )}
          </motion.div>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[rgba(255,255,255,0.2)]">
            <div className="w-px h-8 bg-gradient-to-b from-transparent to-current" />
            <ArrowDownIcon size={16} className="animate-bounce-slow" />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24 px-6 scroll-mt-20">
          <div className="max-w-5xl mx-auto">
            <SectionHeading eyebrow="ВОЗМОЖНОСТИ" title="Один аккаунт — все режимы" subtitle="Переключайтесь между задачами без потери контекста — от диалога до готового видео" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map(({ Icon, label, desc, tag }, i) => (
                <motion.div
                  key={label}
                  className="h-full flex flex-col rounded-2xl p-7 cursor-default transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-[5px] hover:shadow-[0_10px_40px_rgba(123,92,240,.14)]"
                  style={{ background: CARD_BG, border: '1px solid var(--panel-glass-border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(167,139,250,.4)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--panel-glass-border)')}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-[46px] h-[46px] flex-shrink-0 rounded-xl flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, rgba(123,92,240,.22), rgba(45,212,191,.1))' }}
                    >
                      <Icon size={22} style={{ color: '#c4b5fd' }} />
                    </div>
                    <h3 className="font-display font-semibold text-white">{label}</h3>
                  </div>
                  <p className="text-sm text-[rgba(255,255,255,0.5)] leading-relaxed mb-4">{desc}</p>
                  <span
                    className="inline-block self-start mt-auto px-3 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.25)', color: '#c4b5fd' }}
                  >
                    {tag}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Галерея работ — скрыта целиком, пока в галерее нет ни одной одобренной
            работы (свежая инсталляция) — пустая секция выглядела бы сломанной,
            честнее не показывать её вообще, чем врать плейсхолдерами. */}
        {galleryFeatured.length > 0 && (
          <section id="gallery" className="py-24 px-6 scroll-mt-20">
            <div className="max-w-6xl mx-auto">
              <SectionHeading eyebrow="СООБЩЕСТВО" title="Галерея работ" subtitle="Картинки и видео, которыми поделились пользователи GhostLine" />

              <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
                {galleryFeatured.map((item) => (
                  <Link
                    key={item.id}
                    href="/gallery"
                    className="group relative flex-shrink-0 snap-start rounded-2xl overflow-hidden"
                    style={{ width: 220, height: 220, border: '1px solid var(--panel-glass-border)' }}
                  >
                    {item.domain === 'video' ? (
                      <video src={item.mediaUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />
                    ) : (
                      <img src={item.mediaUrl} alt={item.prompt} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    )}
                    <div
                      className="absolute inset-x-0 bottom-0 px-3 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'linear-gradient(180deg, transparent, rgba(6,5,14,.92))' }}
                    >
                      <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,.85)' }}>
                        {item.modelLabel} · {capitalizeFirst(item.authorName)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="text-center mt-8">
                <Link href="/gallery" className="btn btn-primary text-sm h-11 px-7">
                  Смотреть всю галерею →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* How it works */}
        <section id="how" className="py-24 px-6 scroll-mt-20">
          <div className="max-w-5xl mx-auto">
            <SectionHeading eyebrow="ПРОЦЕСС" title="Как это работает" subtitle="От идеи до результата — три шага" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {STEPS.map(({ n, title, desc }, i) => (
                <motion.div key={n} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4 font-display font-bold" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: '#c4b5fd' }}>
                    {n}
                  </div>
                  <h3 className="font-display font-semibold text-white mb-2">{title}</h3>
                  <p className="text-sm text-[rgba(255,255,255,0.5)] leading-relaxed">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Установка как приложение — PWA, без App Store/Google Play, см. /install */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <SectionHeading eyebrow="PWA" title="Установите на любое устройство" subtitle="Иконка на главном экране, без App Store и Google Play — работает как обычное приложение" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {INSTALL_PLATFORMS.map(({ id, label, Icon }) => (
                <Link
                  key={id}
                  href={`/install?platform=${id}`}
                  className="flex flex-col items-center gap-3 rounded-2xl p-6 text-center transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-[5px] hover:shadow-[0_10px_40px_rgba(123,92,240,.14)]"
                  style={{ background: CARD_BG, border: '1px solid var(--panel-glass-border)' }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, rgba(123,92,240,.22), rgba(45,212,191,.1))' }}
                  >
                    <Icon size={20} className="text-[#c4b5fd]" />
                  </div>
                  <span className="font-display font-semibold text-white text-sm">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* About / thesis — этой секции нет в мокапе, стилизована под общий glass-card язык остальных блоков */}
        <section id="about" className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="font-display text-3xl font-bold tracking-tight mb-4">Зачем ещё одна подписка на AI?</h2>
              <p className="text-[rgba(255,255,255,0.5)] max-w-xl mx-auto leading-relaxed">
                Незачем — GhostLine не заменяет одну модель, а даёт доступ ко всем сразу, из России, без лишних шагов.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {THESIS.map(({ Icon, title, desc }, i) => (
                <motion.div
                  key={title}
                  className="rounded-2xl p-7 text-center transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-[5px] hover:shadow-[0_10px_40px_rgba(123,92,240,.14)]"
                  style={{ background: CARD_BG, border: '1px solid var(--panel-glass-border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(167,139,250,.4)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--panel-glass-border)')}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4"
                    style={{ background: 'linear-gradient(135deg, rgba(123,92,240,.22), rgba(45,212,191,.1))' }}
                  >
                    <Icon size={20} style={{ color: '#c4b5fd' }} />
                  </div>
                  <h3 className="font-display font-semibold text-white mb-2">{title}</h3>
                  <p className="text-sm text-[rgba(255,255,255,0.5)] leading-relaxed">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 px-6 scroll-mt-20">
          <div className="max-w-5xl mx-auto">
            <SectionHeading eyebrow="ТАРИФЫ" title="Оплата в Caspers" subtitle="Единая валюта на все режимы — тратьте там, где нужно именно сейчас" />

            <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl px-6 py-4 mb-6" style={{ background: CARD_BG, border: '1px solid var(--panel-glass-border)' }}>
              <div>
                <span className="font-display font-semibold text-white">Бесплатный план</span>
                {tagline && <span className="ml-3 text-sm text-[rgba(255,255,255,0.5)]">{tagline} · Без карты</span>}
              </div>
              <Link href="/login" className="btn btn-ghost text-sm h-9 px-5 shrink-0">
                Начать бесплатно
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map(({ key, label: name, description, price, caspers_monthly: caspers, features, badge }, i) => (
                <motion.div
                  key={key}
                  className="rounded-2xl p-7 relative flex flex-col transition-[transform,box-shadow] duration-300 hover:-translate-y-[5px] hover:shadow-[0_10px_40px_rgba(123,92,240,.14)]"
                  style={{
                    background: badge ? `linear-gradient(160deg, rgba(123,92,240,.2), ${CARD_BG})` : CARD_BG,
                    border: badge ? '1px solid rgba(123,92,240,.45)' : '1px solid var(--panel-glass-border)',
                  }}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                >
                  {badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-black text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap" style={{ background: 'var(--accent-gold)' }}>
                      {badge}
                    </div>
                  )}
                  <h3 className="font-display font-semibold text-white mb-1">{name}</h3>
                  <p className="text-xs mb-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{description}</p>
                  <div className="mb-1">
                    <span className="text-xs text-[rgba(255,255,255,0.3)] line-through mr-2">
                      {formatNumber(fakeCyclePrice(price, 'monthly'))} ₽
                    </span>
                    <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">-50%</span>
                  </div>
                  <div className="mb-1">
                    <span className="font-display text-2xl font-bold">{formatNumber(price)} ₽</span>
                    <span className="text-sm text-[rgba(255,255,255,0.3)]">/мес</span>
                  </div>
                  <p className="text-xs mb-3" style={{ color: 'var(--accent-teal)' }}>{formatNumber(caspers)} Caspers/мес</p>
                  {PLAN_SCENARIO[key] && (
                    <p className="text-xs mb-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{PLAN_SCENARIO[key]}</p>
                  )}
                  {cheapest && (
                    <ul className="text-xs mb-3 space-y-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      <li>+ До {formatNumber(maxGenerations(caspers, cheapest.image))} изображений</li>
                      <li>+ До {formatNumber(maxGenerations(caspers, cheapest.video))} видео</li>
                      <li>+ До {formatNumber(maxGenerations(caspers, cheapest.music))} треков</li>
                    </ul>
                  )}
                  <PlanFeatureList
                    features={features}
                    checkIcon={<CheckIcon size={13} style={{ color: 'var(--accent-teal)' }} />}
                  />
                  <Link href="/login" className={`w-full btn text-sm h-10 mt-auto ${badge ? 'btn-primary' : 'btn-ghost'}`}>
                    Выбрать
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Отзывы — ЗАГЛУШКА, см. комментарий у TESTIMONIALS выше */}
        <section className="py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {TESTIMONIALS.map((t, i) => (
                <motion.div
                  key={i}
                  className="rounded-2xl p-6 flex flex-col"
                  style={{ background: CARD_BG, border: '1px solid var(--panel-glass-border)' }}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                >
                  <span className="font-display text-3xl leading-none mb-2" style={{ color: 'var(--accent-teal)' }}>“</span>
                  <p className="text-sm leading-relaxed mb-4 flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{t.quote}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{t.plan}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-24 px-6 scroll-mt-20">
          <div className="max-w-3xl mx-auto">
            <SectionHeading eyebrow="FAQ" title="Частые вопросы" />
            <div className="flex flex-col gap-2.5">
              {FAQ.map((item, i) => (
                <div key={item.q} className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: '1px solid var(--panel-glass-border)' }}>
                  <button
                    type="button"
                    onClick={() => setFaqOpen(faqOpen === i ? -1 : i)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-4.5 text-left"
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="font-mono text-xs shrink-0" style={{ color: 'var(--accent-teal)' }}>
                        /{String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[15px] font-medium text-white">{item.q}</span>
                    </span>
                    <ArrowDownIcon
                      size={16}
                      className="shrink-0 transition-transform"
                      style={{ color: '#c4b5fd', transform: faqOpen === i ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {faqOpen === i && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="pl-[3.75rem] pr-6 pb-4.5 text-sm leading-relaxed text-[rgba(255,255,255,0.55)]">{item.a}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <img
              src="/ghostline-logo-icon.png"
              alt=""
              className="w-16 h-16 rounded-2xl object-cover animate-float mx-auto mb-6"
              style={{ filter: 'drop-shadow(0 0 20px rgba(123,92,240,.5))' }}
            />
            <h2 className="font-display text-4xl font-bold tracking-tight mb-4">
              Готовы встретить своего духа?
            </h2>
            <Link href="/login" className="btn btn-primary text-base h-12 px-10 mx-auto">
              Начать бесплатно
            </Link>
            {tagline && <p className="mt-4 text-sm text-[rgba(255,255,255,0.35)]">{tagline}</p>}
          </motion.div>
        </section>
      </main>

      <SupportWidget />

      {/* Footer */}
      <footer
        // Нижний паддинг больше вплоть до xl: плавающая кнопка поддержки (fixed
        // bottom-6 right-6, см. SupportWidget) иначе перекрывает статус-пилюлю в
        // последней строке подвала — контейнер max-w-5xl (1280px) занимает почти
        // всю ширину вплоть до xl, реальные поля появляются только шире этого.
        className="relative z-10 border-t pt-[60px] px-6 pb-24 xl:pb-[30px]"
        style={{
          background: 'rgba(5,4,12,.4)',
          // Инлайновый style не проходит через autoprefixer (в отличие от className-
          // утилит вроде backdrop-blur-xl у navbar — там префикс уже подставляется
          // сборкой) — Safari < 15.4 понимает только -webkit-backdrop-filter.
          WebkitBackdropFilter: 'blur(4px)',
          backdropFilter: 'blur(4px)',
          borderColor: 'rgba(148,163,184,.1)',
        }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-3.5">
                <img src="/ghostline-logo-icon.png" alt="GhostLine" className="w-7 h-7 rounded-[7px] object-cover" />
                <span className="font-display font-bold text-base text-white">GhostLine</span>
              </div>
              <p className="text-[13.5px] leading-relaxed max-w-[260px]" style={{ color: '#8a81a0' }}>
                Думает, создаёт и работает из России — все AI в одном месте.
              </p>
            </div>
            <div>
              <div className="text-xs font-bold tracking-wide mb-4" style={{ color: '#726a89' }}>ПРОДУКТ</div>
              <div className="flex flex-col gap-2.5 text-sm">
                <a href="#features" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Возможности</a>
                <a href="#how" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Как это работает</a>
                <a href="#pricing" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Тарифы</a>
                <a href="#faq" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">FAQ</a>
              </div>
            </div>
            <div>
              <div className="text-xs font-bold tracking-wide mb-4" style={{ color: '#726a89' }}>КОМПАНИЯ</div>
              <div className="flex flex-col gap-2.5 text-sm">
                <Link href="/install" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Установить как приложение</Link>
                <Link href="/privacy" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Политика конфиденциальности</Link>
                <Link href="/terms" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Условия использования</Link>
              </div>
            </div>
            <div>
              <div className="text-xs font-bold tracking-wide mb-4" style={{ color: '#726a89' }}>ПОДДЕРЖКА</div>
              <div className="flex flex-col gap-2.5 text-sm">
                <a href="mailto:xxghostlinex@gmail.com" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Написать в поддержку</a>
                <a href="https://t.me/ghostlineai" target="_blank" rel="noopener" className="text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">Telegram</a>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t" style={{ borderColor: 'rgba(148,163,184,.1)' }}>
            <span className="text-[13px]" style={{ color: '#726a89' }}>© {new Date().getFullYear()} GhostLine AI</span>
            <span
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs"
              style={{ background: 'rgba(123,92,240,.08)', border: '1px solid rgba(123,92,240,.2)', color: '#c4b5fd' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#7B5CF0', boxShadow: '0 0 6px #7B5CF0', animation: 'statusBlink 1.8s ease-in-out infinite' }}
              />
              Сервисы работают штатно
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <motion.div
      className="text-center mb-14"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <div className="inline-flex items-center gap-2.5 mb-3.5">
        <span className="w-5 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--accent))' }} />
        <span className="text-xs font-bold tracking-[2.5px]" style={{ color: '#c4b5fd' }}>{eyebrow}</span>
        <span className="w-5 h-px" style={{ background: 'linear-gradient(90deg, var(--accent), transparent)' }} />
      </div>
      <h2 className="font-display text-[clamp(26px,3.4vw,36px)] font-bold text-white mb-2.5">{title}</h2>
      {subtitle && <p className="text-[rgba(255,255,255,0.5)] max-w-xl mx-auto">{subtitle}</p>}
    </motion.div>
  );
}
