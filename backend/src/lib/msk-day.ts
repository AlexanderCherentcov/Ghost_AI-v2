// Границы «сегодня» и «этот месяц» для админской статистики.
// Раньше брался локальный полночь процесса (в Docker это UTC), а остальной
// админ-бот показывает время по Москве. Из-за этого «новых сегодня» и «чат
// сегодня» расходились с тем днём, который админ видит в уведомлениях.
// Москва без перехода на летнее время, постоянный UTC+3.

const MSK = 'Europe/Moscow';

function moscowDateParts(now: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MSK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function moscowDayStart(now: Date): Date {
  const { year, month, day } = moscowDateParts(now);
  return new Date(`${year}-${month}-${day}T00:00:00+03:00`);
}

export function moscowMonthStart(now: Date): Date {
  const { year, month } = moscowDateParts(now);
  return new Date(`${year}-${month}-01T00:00:00+03:00`);
}
