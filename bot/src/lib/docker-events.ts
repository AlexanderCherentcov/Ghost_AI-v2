// Слежение за Docker events (die/start контейнеров infra-* через сокет) —
// чтобы админ узнавал о падении/рестарте сервиса сразу, а не когда пользователи
// напишут "бот не отвечает". Поток держим открытым и переподключаем при обрыве.
import { docker } from './admin-api.js';
import { ALL_SERVICES } from './docker.js';

const COMPOSE_PROJECT = process.env.COMPOSE_PROJECT ?? 'infra';

/** container name → сервис из ALL_SERVICES, если это наш контейнер */
function serviceFromName(name: string): string | null {
  const prefix = `/${COMPOSE_PROJECT}-`;
  if (!name.startsWith(prefix) || !name.endsWith('-1')) return null;
  const svc = name.slice(prefix.length, -2);
  return ALL_SERVICES.includes(svc) ? svc : null;
}

export function watchDockerEvents(onEvent: (svc: string, action: 'die' | 'start', exitCode?: string) => void): void {
  let stream: any = null;

  function connect(): void {
    docker.get('/events?filters=' + encodeURIComponent(JSON.stringify({ type: ['container'], event: ['die', 'start'] })), {
      responseType: 'stream',
      timeout: 0,
    }).then((res) => {
      stream = res.data;
      let buf = '';
      stream.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            const name = ev.Actor?.Attributes?.name ? `/${ev.Actor.Attributes.name}` : '';
            const svc  = serviceFromName(name);
            if (!svc) continue;
            if (ev.Action === 'die') onEvent(svc, 'die', ev.Actor?.Attributes?.exitCode);
            else if (ev.Action === 'start') onEvent(svc, 'start');
          } catch { /* игнорируем неполные/битые строки */ }
        }
      });
      stream.on('error', () => setTimeout(connect, 5000));
      stream.on('end', () => setTimeout(connect, 5000));
    }).catch(() => setTimeout(connect, 5000));
  }

  connect();
}
