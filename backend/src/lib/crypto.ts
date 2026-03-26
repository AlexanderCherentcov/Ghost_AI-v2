/**
 * AES-256-GCM message encryption
 * ────────────────────────────────
 * Шифрует тексты сообщений перед записью в PostgreSQL.
 * Даже при краже дампа БД — только зашифрованный текст.
 *
 * Формат хранения: <iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 * (все три части строго разделены двоеточием)
 *
 * ENV: ENCRYPTION_KEY — любая строка ≥ 16 символов.
 *      Ключ растягивается SHA-256 → 32 байта (AES-256).
 *
 * ПРЕДУПРЕЖДЕНИЕ: смена ENCRYPTION_KEY делает все старые
 * сообщения нечитаемыми. Храни ключ надёжно и не меняй.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH  = 16; // байт
const TAG_LENGTH = 16; // байт

// ─── Key derivation ───────────────────────────────────────────────────────────

let _keyCache: Buffer | null = null;

function getKey(): Buffer {
  if (_keyCache) return _keyCache;

  const secret = process.env.ENCRYPTION_KEY ?? '';
  if (!secret || secret === 'placeholder' || secret.length < 16) {
    // В dev-режиме — используем дефолт с предупреждением
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Crypto] ENCRYPTION_KEY not set — using dev default. Set it in production!');
      _keyCache = createHash('sha256').update('ghostline-dev-key-change-in-prod').digest();
      return _keyCache;
    }
    throw new Error('[Crypto] ENCRYPTION_KEY must be set in production (min 16 chars)');
  }

  _keyCache = createHash('sha256').update(secret).digest(); // → 32 bytes
  return _keyCache;
}

// ─── Encryption ───────────────────────────────────────────────────────────────

/**
 * Шифрует строку AES-256-GCM.
 * @returns строка вида "iv_hex:tag_hex:ciphertext_hex"
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// ─── Decryption ───────────────────────────────────────────────────────────────

/**
 * Расшифровывает строку, зашифрованную через encrypt().
 * Бросает ошибку если формат неверный или ключ не совпадает.
 */
export function decrypt(ciphertext: string): string {
  const key  = getKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('[Crypto] Invalid ciphertext format');
  }

  const [ivHex, tagHex, dataHex] = parts;
  const iv      = Buffer.from(ivHex,  'hex');
  const tag     = Buffer.from(tagHex, 'hex');
  const data    = Buffer.from(dataHex,'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Безопасная расшифровка с обратной совместимостью.
 * Если строка не похожа на зашифрованную (нет трёх частей через :) —
 * возвращает как есть (legacy незашифрованные сообщения).
 */
export function safeDecrypt(value: string): string {
  // Незашифрованные legacy-сообщения — не содержат ровно два двоеточия
  // iv(32 hex) : tag(32 hex) : data(N hex) → ровно 2 двоеточия
  const colonCount = (value.match(/:/g) ?? []).length;
  if (colonCount !== 2) return value;

  // Дополнительная проверка: iv и tag — ровно 32 hex-символа
  const parts = value.split(':');
  if (parts[0].length !== 32 || parts[1].length !== 32) return value;

  try {
    return decrypt(value);
  } catch {
    return value; // Возвращаем как есть при ошибке расшифровки
  }
}

/**
 * Проверяет, похожа ли строка на зашифрованную.
 * Используется для условного шифрования (не перешифровывать уже зашифрованное).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}
