// Прокси для Telegram Bot API — тот же внешний HTTP-прокси (Амстердам), что
// уже используется бэкендом для AI-провайдеров (backend/src/lib/proxy.ts).
//
// Живой инцидент 2026-09-12: прямая связь с Telegram (ВСЕ проверенные IP —
// 149.154.166.110, 149.154.167.220, 149.154.175.50, 91.108.56.130, порт 443)
// перестала проходить с этого VPS — остальной интернет (Cloudflare, Google)
// при этом был доступен мгновенно. Известная особенность роутинга до
// Telegram у части российских/СНГ-хостеров — раньше не проявлялась (боты
// работали от прямого соединения 5+ суток), но when она случается, ждать
// самостоятельного восстановления может быть слишком долго. Прокси
// подтверждён живым тестом (curl -x .../ к api.telegram.org) как рабочий
// путь к Telegram в момент, когда прямое соединение не проходило.
//
// grammY использует node-fetch внутри (не встроенный fetch), поэтому обычный
// undici-диспетчер (lib/proxy.ts в backend) его не перехватывает — нужен
// явный http.Agent-совместимый прокси-агент через client.baseFetchConfig.agent,
// тот же приём, что уже применён для OpenRouter (backend/src/services/providers/openrouter.ts).
import { HttpsProxyAgent } from 'https-proxy-agent';

let agent: HttpsProxyAgent<string> | null | undefined;

function getAgent(): HttpsProxyAgent<string> | undefined {
  if (agent !== undefined) return agent ?? undefined;
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (!proxyUrl || proxyUrl.startsWith('socks')) {
    agent = null;
    return undefined;
  }
  agent = new HttpsProxyAgent(proxyUrl);
  const masked = proxyUrl.replace(/:[^:@]*@/, ':***@');
  console.log(`[TelegramProxy] Routing Bot API via proxy → ${masked}`);
  return agent;
}

/** Передаётся в `new Bot(token, { client: telegramClientOptions() })`. */
export function telegramClientOptions() {
  const proxyAgent = getAgent();
  if (!proxyAgent) return {};
  return { baseFetchConfig: { agent: proxyAgent } };
}
