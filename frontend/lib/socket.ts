// Выводим WS URL из API URL: https:// → wss://, http:// → ws://
// Если явно задан NEXT_PUBLIC_WS_URL — используем его, иначе выводим автоматически.
function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return api.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
}
const WS_URL = getWsUrl();

export interface WSChunk {
  type: 'token' | 'done' | 'error' | 'title';
  data?: string;
  tokensCost?: number;
  cacheHit?: boolean;
  title?: string;
  chatId?: string;
  code?: string;
  message?: string;
}

export interface WSMessage {
  chatId: string;
  // id модели из реестра (backend/src/config/models.ts), 'auto' по умолчанию.
  model: string;
  prompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  // TODO: перенести в WS-хендшейк
  jwt: string;
  imageUrl?: string;    // base64 data URL прикреплённого изображения
  fileContent?: string; // извлечённый текст документа
  fileName?: string;    // исходное имя файла
  fileLang?: string;    // язык для code-fence (js, python, …)
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
// [H-07] флаг aborted: если true, входящие токен-чанки игнорируются
let aborted = false;
const listeners = new Set<(chunk: WSChunk) => void>();

export function connectWS(): WebSocket {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;

  // [H-08] Очищаем таймер переподключения перед созданием нового соединения
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  ws = new WebSocket(`${WS_URL}/api/chat/stream`);

  // [H-15] Таймаут соединения — закрываем, если не открылось за 10 секунд
  const connectTimeout = setTimeout(() => {
    if (ws && ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Connection timeout');
      ws.close();
    }
  }, 10_000);

  ws.addEventListener('open', () => {
    clearTimeout(connectTimeout);
  }, { once: true });

  ws.onmessage = (event) => {
    try {
      const chunk = JSON.parse(event.data) as WSChunk;
      // [H-07] Если стрим прерван, игнорируем входящие токен-чанки
      if (aborted && chunk.type === 'token') return;
      // [H-07] Сбрасываем флаг aborted, когда сервер шлёт done/error
      if (chunk.type === 'done' || chunk.type === 'error') aborted = false;
      // Фоновое обновление заголовка — обновляем стор чатов напрямую, слушателей уведомлять не нужно
      if (chunk.type === 'title' && chunk.chatId && chunk.title) {
        import('@/store/chat.store').then(({ useChatStore }) => {
          useChatStore.getState().updateChat(chunk.chatId!, { title: chunk.title });
        }).catch(() => {});
        return;
      }
      listeners.forEach((l) => l(chunk));
    } catch {}
  };

  ws.onclose = () => {
    ws = null;
    reconnectTimer = setTimeout(() => connectWS(), 3000);
  };

  ws.onerror = (err) => {
    console.error('[WS] Error', err);
  };

  return ws;
}

export function disconnectWS() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
  ws = null;
}

// [H-16] Таймауты зависания стрима:
//   30с — не пришёл первый токен (сервер завис перед ответом)
//   20с — нет нового токена после предыдущего (стрим замер посередине)
const STALL_BEFORE_FIRST = 30_000;
const STALL_AFTER_TOKEN  = 20_000;

export function sendMessage(msg: WSMessage): Promise<{ tokensCost: number; cacheHit: boolean; title?: string }> {
  return new Promise((resolve, reject) => {
    const socket = connectWS();
    const requestId = `${msg.chatId}-${Date.now()}-${Math.random()}`;
    const msgWithId = { ...msg, requestId };

    let firstTokenReceived = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    function resetStall() {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        cleanup();
        aborted = true;
        reject(Object.assign(
          new Error('Нет ответа от сервера, попробуйте ещё раз'),
          { code: 'STREAM_TIMEOUT' },
        ));
      }, firstTokenReceived ? STALL_AFTER_TOKEN : STALL_BEFORE_FIRST);
    }

    const cleanup = () => {
      listeners.delete(handler);
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    };

    const handler = (chunk: WSChunk) => {
      if (chunk.type === 'token') {
        firstTokenReceived = true;
        resetStall(); // сбрасываем окно зависания на каждом токене
      } else if (chunk.type === 'done') {
        cleanup();
        resolve({ tokensCost: chunk.tokensCost ?? 0, cacheHit: chunk.cacheHit ?? false, title: chunk.title });
      } else if (chunk.type === 'error') {
        cleanup();
        reject(Object.assign(new Error(chunk.message ?? chunk.code ?? 'WS error'), { code: chunk.code }));
      }
    };

    listeners.add(handler);
    resetStall(); // запускаем таймер зависания сразу

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msgWithId));
    } else {
      socket.addEventListener('open', () => socket.send(JSON.stringify(msgWithId)), { once: true });
    }
  });
}

export function onToken(callback: (chunk: WSChunk) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Прерывает текущий стрим — выставляет aborted, чтобы дальнейшие токен-чанки игнорировались,
// затем рассылает синтетический 'done', чтобы промис резолвился немедленно.
// Примечание: сервер продолжает генерацию — отменить её через WS нельзя.
// [H-07]
export function abortStream() {
  aborted = true;
  const abortChunk: WSChunk = { type: 'done', tokensCost: 0, cacheHit: false };
  listeners.forEach((l) => l(abortChunk));
}
