import type { ModelCatalog } from './api-client.js';

/**
 * CasperTransaction.reason — либо id модели из реестра (chat/image/video модели
 * тарифицируются списанием с reason = spec.id, см. backend/src/services/tokens.ts),
 * либо один из системных кодов ниже. Тот же словарь, что и на сайте
 * (frontend/lib/casper-history.ts) — держим оба в синхроне при изменении reason'ов.
 */
const SYSTEM_REASON_LABELS: Record<string, string> = {
  admin_grant: 'Начисление администратором',
  admin_deduct: 'Списание администратором',
  welcome_bonus: 'Приветственный бонус',
  plan_grant_monthly: 'Ежемесячное начисление по тарифу',
  topup: 'Пополнение баланса',
  music_generate: 'Генерация музыки',
  voice_exchange: 'Голосовое сообщение',
  lipsync: 'Синхронизация губ (Lip Sync)',
};

export function formatTransactionReason(reason: string, models: ModelCatalog | null): string {
  if (reason.startsWith('refund_')) {
    return `Возврат: ${formatTransactionReason(reason.slice('refund_'.length), models)}`;
  }
  if (SYSTEM_REASON_LABELS[reason]) return SYSTEM_REASON_LABELS[reason];
  if (models) {
    const all = [...models.chat, ...models.image, ...models.video];
    const found = all.find((m) => m.id === reason);
    if (found) return found.label;
  }
  return reason;
}
