// Тонкая обёртка над Telegram Bot API — переиспользуется везде, где нужно
// вызвать произвольный метод под конкретным токеном (разные боты: основной,
// админский), вместо копирования axios-вызовов по каждому месту.
import axios from 'axios';

// proxy: false — см. комментарий в admin-notify.ts: внутренний вызов к
// api.telegram.org не должен идти через внешний HTTPS_PROXY.
const client = axios.create({ proxy: false, timeout: 10_000 });

export async function callTelegramApi<T = unknown>(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data } = await client.post(`https://api.telegram.org/bot${botToken}/${method}`, payload);
  if (!data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description ?? 'unknown error'}`);
  }
  return data.result as T;
}
