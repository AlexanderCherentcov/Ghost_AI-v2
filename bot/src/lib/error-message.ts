// Единый способ достать текст ошибки из axios-исключения для ответа пользователю.
// Раньше этот паттерн — "взять текст из response.data.error бэкенда, иначе err.message,
// иначе дефолт, обрезать до 200 символов" — был скопирован ~28 раз в bot.ts/admin-bot.ts
// в 4 чуть разных вариантах (где-то без обрезки, где-то без проверки response.data.error).
export function apiErrorMessage(err: any, fallback = 'неизвестная ошибка'): string {
  const msg = err?.response?.data?.error ?? err?.message ?? fallback;
  return String(msg).slice(0, 200);
}
