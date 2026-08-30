import type { PlansResponse } from './api';

/**
 * CasperTransaction.reason — либо id модели из реестра (см. backend/src/config/
 * models.ts — chat/image/video модели тарифицируются списанием с reason = spec.id),
 * либо один из системных кодов ниже. Единого источника меток для системных кодов
 * на бэкенде нет (это не модели), поэтому словарь — здесь, а модели подтягиваются
 * из уже загруженного /api/plans, а не дублируются локальным списком.
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

export function formatTransactionReason(reason: string, models: PlansResponse['models'] | null): string {
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
