// Derive WS URL from API URL: https:// → wss://, http:// → ws://
// Falls back to NEXT_PUBLIC_WS_URL if explicitly set, otherwise auto-derives.
function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return api.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
}
const WS_URL = getWsUrl();

export interface WSChunk {
  type: 'token' | 'done' | 'error';
  data?: string;
  tokensCost?: number;
  cacheHit?: boolean;
  title?: string;
  code?: string;
  message?: string;
}

export interface WSMessage {
  chatId: string;
  mode: 'chat' | 'think';
  prompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  // TODO: move to WS handshake
  jwt: string;
  imageUrl?: string;    // base64 data URL of attached image
  fileContent?: string; // extracted text from document
  fileName?: string;    // original file name
  fileLang?: string;    // code-fence language (js, python, …)
  preferredModel?: 'haiku' | 'deepseek';
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
// [H-07] aborted flag: when true, incoming token chunks are ignored
let aborted = false;
const listeners = new Set<(chunk: WSChunk) => void>();

export function connectWS(): WebSocket {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;

  // [H-08] Clear any pending reconnect timer before creating a new connection
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  ws = new WebSocket(`${WS_URL}/api/chat/stream`);

  // [H-15] Connection timeout — close if not OPEN within 10 seconds
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
      // [H-07] If stream was aborted, ignore incoming token chunks
      if (aborted && chunk.type === 'token') return;
      // [H-07] Reset aborted flag when server sends done/error
      if (chunk.type === 'done' || chunk.type === 'error') aborted = false;
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

// [H-16] Stream stall timeouts:
//   30s  — no first token received (server hung before responding)
//   20s  — no new token after last one (stream frozen mid-response)
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
        resetStall(); // reset stall window on every token
      } else if (chunk.type === 'done') {
        cleanup();
        resolve({ tokensCost: chunk.tokensCost ?? 0, cacheHit: chunk.cacheHit ?? false, title: chunk.title });
      } else if (chunk.type === 'error') {
        cleanup();
        reject(Object.assign(new Error(chunk.message ?? chunk.code ?? 'WS error'), { code: chunk.code }));
      }
    };

    listeners.add(handler);
    resetStall(); // start stall timer immediately

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

// Abort current stream — marks aborted so further token chunks are ignored,
// then broadcasts a synthetic 'done' so the promise resolves immediately.
// Note: the server continues generating; we cannot cancel it via WS.
// [H-07]
export function abortStream() {
  aborted = true;
  const abortChunk: WSChunk = { type: 'done', tokensCost: 0, cacheHit: false };
  listeners.forEach((l) => l(abortChunk));
}
