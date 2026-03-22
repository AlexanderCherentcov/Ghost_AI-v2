# GhostLine AI

> Ваш AI-дух. Думает. Создаёт. Исчезает в тишине.

Полная платформа GhostLine — монорепо с фронтендом, бэкендом и Telegram Mini App.

## Структура

```
ghostline/
├── backend/              # Fastify 4 + TypeScript + Prisma + Redis + BullMQ
├── frontend/             # Next.js 14 App Router + Tailwind + shadcn/ui
├── telegram-miniapp/     # Next.js 14 + Telegram WebApp SDK
├── .env.example          # Шаблон переменных окружения
└── package.json          # Workspace root
```

## Быстрый старт

### 1. Переменные окружения

```bash
cp .env.example .env
# Заполнить все поля
```

### 2. База данных

```bash
# Backend — Prisma миграции
npm run db:migrate
npm run db:generate
```

### 3. Разработка

```bash
# Запустить backend
npm run dev:backend

# Запустить frontend (в другом терминале)
npm run dev:frontend

# Запустить Telegram Mini App (в третьем терминале)
npm run dev:miniapp
```

### 4. Деплой

| Сервис         | Платформа |
|---------------|-----------|
| Frontend      | Vercel    |
| Mini App      | Vercel    |
| Backend       | Railway   |
| PostgreSQL    | Railway   |
| Redis         | Railway   |
| Media Storage | Cloudflare R2 |

## Технический стек

### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify 4
- **Language**: TypeScript 5
- **ORM**: Prisma 5 + PostgreSQL 16
- **Cache**: Redis 7 (ioredis)
- **Queue**: BullMQ (Vision, Sound, Reel)
- **WebSocket**: Fastify WebSocket (стриминг)
- **Auth**: JWT (access 15m + refresh 30d)
- **Payments**: ЮKassa SDK

### Frontend
- **Framework**: Next.js 14 App Router
- **Language**: TypeScript 5
- **Styles**: Tailwind CSS 3
- **State**: Zustand
- **Queries**: TanStack Query
- **Animations**: Framer Motion
- **Auth**: OAuth (Яндекс, Google, Telegram)

### AI провайдеры (скрыты от пользователя)
| Режим | Провайдер |
|-------|-----------|
| Chat (simple) | Gemini 1.5 Flash / GPT-4o mini |
| Chat (complex) | Claude Sonnet / GPT-4o |
| Vision | DALL-E 3 + Stable Diffusion XL |
| Sound | Replicate MusicGen |
| Reel | Runway Gen-3 |

### Тарифы
| Plan | Цена | Токены |
|------|------|--------|
| Free | 0 ₽ | 50K |
| Pro | 499 ₽/мес | 500K |
| Ultra | 1490 ₽/мес | 2M |
| Team | 3900 ₽/мес | 10M |

## Архитектура AI роутера

```
Запрос → Классификатор → SIMPLE/COMPLEX
                              ↓
                    SIMPLE: Gemini Flash / GPT-4o mini (ротация)
                    COMPLEX: Claude Sonnet → кэш → ответ
                              ↓
                    Redis кэш (7 дней, SHA-256 ключ)
                              ↓
                    Списание токенов (всегда)
                              ↓
                    Стриминг через WebSocket
```

## Дизайн система

**«Призрачный минимализм»** — темнота как холст, контент как источник света.

- Основной цвет: `#7B5CF0` (фиолетовый GhostLine)
- Фон: `#06060B` → `#0A0A12` → `#0E0E1A`
- Шрифты: Inter + JetBrains Mono
- Анимации: float (призрак), fade-in (появление контента)
