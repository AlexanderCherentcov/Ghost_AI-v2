import WebSocket from 'ws';
import type { UserSession, ChatMsg, Mode } from './session.js';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const WS_URL = API_URL.replace(/^http/, 'ws') + '/api/chat/stream';

export interface StreamResult {
  content: string;
  tokensCost: number;
  cacheHit: boolean;
}

export class ChatStreamError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Opens a fresh WS connection per message (mirrors how the web frontend
 * connects), streams tokens through onToken for periodic Telegram message
 * edits, and resolves once the server sends `done`.
 */
export function streamChat(
  session: UserSession,
  params: { chatId: string; mode: Extract<Mode, 'chat' | 'think'>; prompt: string; history: ChatMsg[] },
  onToken: (fullTextSoFar: string) => void,
  timeoutMs = 90_000,
): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let full = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.terminate();
      reject(new ChatStreamError('TIMEOUT', 'Не дождались ответа — попробуйте ещё раз'));
    }, timeoutMs);

    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      fn();
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        jwt: session.accessToken,
        chatId: params.chatId,
        mode: params.mode,
        prompt: params.prompt,
        history: params.history,
      }));
    });

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'token') {
        full += msg.data ?? '';
        onToken(full);
      } else if (msg.type === 'done') {
        finish(() => resolve({ content: full, tokensCost: msg.tokensCost ?? 0, cacheHit: !!msg.cacheHit }));
      } else if (msg.type === 'error') {
        finish(() => reject(new ChatStreamError(msg.code ?? 'SERVER_ERROR', msg.message ?? 'Ошибка сервера')));
      }
      // 'title' events are ignored — the bot doesn't render a live sidebar
    });

    ws.on('error', () => {
      finish(() => reject(new ChatStreamError('CONNECTION_ERROR', 'Не удалось подключиться к чату')));
    });

    ws.on('close', () => {
      finish(() => reject(new ChatStreamError('CONNECTION_CLOSED', 'Соединение прервано')));
    });
  });
}
