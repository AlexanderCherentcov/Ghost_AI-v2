export type Billing = 'MONTHLY' | 'YEARLY';

interface ExpiryInput {
  currentPlan: string;
  currentExpiresAt: Date | null;
  newPlan: string;
  billing: Billing;
  now?: Date;
}

/**
 * Новая дата окончания подписки после оплаты. Продление того же плана, пока срок не
 * вышел, прибавляется к остатку — раньше срок считался от «сейчас» и оплата за неделю
 * до конца затирала оставшиеся дни (для годовой — до 11 месяцев). Смена плана начинает
 * отсчёт заново: остаток дешёвого тарифа не должен превращаться в бесплатное время дорогого.
 */
export function computeNewExpiry({ currentPlan, currentExpiresAt, newPlan, billing, now = new Date() }: ExpiryInput): Date {
  const stillActive = currentPlan === newPlan && currentExpiresAt !== null && currentExpiresAt > now;
  const base = new Date(stillActive ? currentExpiresAt : now);

  if (billing === 'YEARLY') {
    base.setFullYear(base.getFullYear() + 1);
  } else {
    base.setMonth(base.getMonth() + 1);
  }
  return base;
}
