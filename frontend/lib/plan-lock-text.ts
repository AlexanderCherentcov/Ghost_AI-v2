const PLAN_NAMES: Record<string, string> = {
  FREE: 'Бесплатный', START: 'Старт', BASIC: 'Basic', PRO: 'Pro', PRO_PLUS: 'Pro+', VIP: 'VIP', ULTRA: 'Ultra',
};

export function planName(plan: string | undefined): string {
  return (plan && PLAN_NAMES[plan]) || plan || '';
}

/**
 * Текст попапа «модель закрыта тарифом». Раньше показывался общий «Картинки, файлы и видео доступны с
 * платного тарифа» — и врал: часть картинок бесплатным пользователям доступна, а наличие Caspers на
 * балансе доступ к модели не открывает, что и сбивало с толку.
 */
export function lockedModelText(modelLabel?: string, minPlan?: string, userPlan?: string): string {
  const need = minPlan ? `тарифа ${planName(minPlan)} и выше` : 'более высокого тарифа';
  const subject = modelLabel ? `Модель «${modelLabel}»` : 'Эта модель';
  const current = userPlan ? ` Сейчас у вас тариф «${planName(userPlan)}».` : '';
  return `${subject} доступна с ${need}.${current} Caspers на балансе не пропадут — ими можно платить за модели, открытые на вашем тарифе.`;
}
