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
  jwt: string;
  imageUrl?: string; // base64 data URL of attached image
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(chunk: WSChunk) => void>();

export function connectWS(): WebSocket {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;

  ws = new WebSocket(`${WS_URL}/api/chat/stream`);

  ws.onmessage = (event) => {
    try {
      const chunk = JSON.parse(event.data) as WSChunk;
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

export function sendMessage(msg: WSMessage): Promise<{ tokensCost: number; cacheHit: boolean; title?: string }> {
  return new Promise((resolve, reject) => {
    const socket = connectWS();

    const cleanup = () => listeners.delete(handler);

    const handler = (chunk: WSChunk) => {
      if (chunk.type === 'done') {
        cleanup();
        resolve({ tokensCost: chunk.tokensCost ?? 0, cacheHit: chunk.cacheHit ?? false, title: chunk.title });
      } else if (chunk.type === 'error') {
        cleanup();
        reject(Object.assign(new Error(chunk.message ?? chunk.code ?? 'WS error'), { code: chunk.code }));
      }
    };

    listeners.add(handler);

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    } else {
      socket.addEventListener('open', () => socket.send(JSON.stringify(msg)), { once: true });
    }
  });
}

export function onToken(callback: (chunk: WSChunk) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Abort current stream — commits whatever arrived so far
export function abortStream() {
  // Broadcast a synthetic 'done' so promise resolves and streaming stops
  const abortChunk: WSChunk = { type: 'done', tokensCost: 0, cacheHit: false };
  listeners.forEach((l) => l(abortChunk));
}
