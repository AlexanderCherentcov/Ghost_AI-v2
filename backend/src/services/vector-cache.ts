/**
 * ВЕКТОРНЫЙ КЭШ (семантический)
 * ──────────────────────────────
 * Позволяет находить похожие запросы по смыслу:
 *   "как сварить яйцо" ≈ "сколько варить яйца" → один и тот же ответ из кэша
 *
 * Требования:
 *   1. PostgreSQL с расширением pgvector:
 *      CREATE EXTENSION IF NOT EXISTS vector;
 *      (в infra/docker-compose.yml используй образ ankane/pgvector)
 *
 *   2. Переменные окружения (все опциональны):
 *      EMBEDDING_API_KEY    — ключ OpenAI для эмбеддингов (НЕ Groq!)
 *      EMBEDDING_BASE_URL   — кастомный base URL (default: api.openai.com/v1)
 *      EMBEDDING_MODEL      — модель (default: text-embedding-3-small)
 *      VECTOR_CACHE_THRESHOLD — порог совпадения 0-1 (default: 0.95)
 *
 *   Если EMBEDDING_API_KEY не задан или является Groq-ключом (gsk_…),
 *   векторный кэш отключается автоматически — ошибок не будет.
 */

import OpenAI from 'openai';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma.js';

const THRESHOLD = parseFloat(process.env.VECTOR_CACHE_THRESHOLD ?? '0.95');
const MODEL     = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
const DIMS      = 1536; // text-embedding-3-small

// Клиент для эмбеддингов — всегда OpenAI, не Groq
const embedClient = new OpenAI({
  apiKey:  process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
  baseURL: process.env.EMBEDDING_BASE_URL ?? 'https://api.openai.com/v1',
});

let ready = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Вызывается один раз при старте приложения.
 * Создаёт таблицу cached_embeddings и ivfflat-индекс, если не существуют.
 * Если pgvector не установлен — тихо отключается.
 */
export async function initVectorCache(): Promise<void> {
  // Не инициализируем если нет нормального OpenAI ключа
  const key = process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  if (!key || key.startsWith('gsk_') || key === 'placeholder') {
    console.info('[VectorCache] Disabled — no OpenAI embedding key (EMBEDDING_API_KEY)');
    return;
  }

  try {
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS cached_embeddings (
        id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        mode         TEXT        NOT NULL,
        prompt_hash  TEXT        NOT NULL,
        embedding    vector(1536),
        response     TEXT        NOT NULL,
        hits         INT         NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (mode, prompt_hash)
      )
    `;

    // ivfflat индекс — быстрый ANN-поиск по косинусному расстоянию
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS cached_embeddings_vec_idx
      ON cached_embeddings
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 50)
    `;

    ready = true;
    console.info('[VectorCache] Ready — pgvector initialized');
  } catch (err: any) {
    console.warn('[VectorCache] pgvector unavailable, semantic cache disabled:', err.message);
  }
}

// ─── Embedding ────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function embed(text: string): Promise<number[] | null> {
  if (!ready) return null;
  try {
    const res = await embedClient.embeddings.create({
      model: MODEL,
      input: normalize(text),
    });
    return res.data[0].embedding;
  } catch {
    return null; // graceful fallback
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ищем семантически похожий кэшированный ответ.
 * Использует cosine similarity ≥ THRESHOLD (default 0.95).
 */
export async function getVectorCached(
  mode: string,
  prompt: string,
  historyContext: string[] = []
): Promise<{ hit: true; response: object } | { hit: false }> {
  const combined = [...historyContext.slice(-2), prompt].join('\n');
  const vec = await embed(combined);
  if (!vec) return { hit: false };

  const vecStr = `[${vec.join(',')}]`;

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ response: string; similarity: number }>>(
      `SELECT response, 1 - (embedding <=> $1::vector) AS similarity
       FROM cached_embeddings
       WHERE mode = $2
         AND 1 - (embedding <=> $1::vector) >= $3
       ORDER BY similarity DESC
       LIMIT 1`,
      vecStr, mode, THRESHOLD
    );

    if (rows.length > 0) {
      // Инкрементируем счётчик попаданий асинхронно
      prisma.$executeRawUnsafe(
        `UPDATE cached_embeddings
         SET hits = hits + 1
         WHERE mode = $1 AND prompt_hash = (
           SELECT prompt_hash FROM cached_embeddings
           WHERE mode = $1 AND 1 - (embedding <=> $2::vector) >= $3
           ORDER BY embedding <=> $2::vector LIMIT 1
         )`,
        mode, vecStr, THRESHOLD
      ).catch(() => {});

      return { hit: true, response: JSON.parse(rows[0].response) };
    }
  } catch (err: any) {
    console.warn('[VectorCache] Query error:', err.message);
  }

  return { hit: false };
}

/**
 * Сохраняем ответ + его вектор.
 * ON CONFLICT — обновляем response (на случай если промпт уже был).
 */
export async function setVectorCached(
  mode: string,
  prompt: string,
  response: object,
  historyContext: string[] = []
): Promise<void> {
  const combined = [...historyContext.slice(-2), prompt].join('\n');
  const vec = await embed(combined);
  if (!vec) return;

  // Стабильный SHA-256 хеш для UNIQUE constraint — необратимый, исходный текст не восстановить
  const hash = createHash('sha256').update(normalize(combined)).digest('hex');
  const vecStr = `[${vec.join(',')}]`;

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO cached_embeddings (mode, prompt_hash, embedding, response)
       VALUES ($1, $2, $3::vector, $4)
       ON CONFLICT (mode, prompt_hash)
       DO UPDATE SET response = EXCLUDED.response`,
      mode, hash, vecStr, JSON.stringify(response)
    );
  } catch (err: any) {
    console.warn('[VectorCache] Insert error:', err.message);
  }
}
