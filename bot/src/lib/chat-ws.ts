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
 * Открывает новое WS-соединение на каждое сообщение (так же, как это делает
 * веб-фронтенд), передаёт токены через onToken для периодической правки
 * сообщения в Telegram и резолвится, когда сервер пришлёт `done`.
 */
export function streamChat(
  session: UserSession,
  params: {
    chatId: string;
    mode: Extract<Mode, 'chat' | 'think'>;
    prompt: string;
    history: ChatMsg[];
    imageUrl?: string;
    fileContent?: string;
    fileName?: string;
    fileLang?: string;
  },
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
        ...(params.imageUrl ? { imageUrl: params.imageUrl } : {}),
        ...(params.fileContent ? { fileContent: params.fileContent, fileName: params.fileName, fileLang: params.fileLang } : {}),
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
      // события 'title' игнорируются — у бота нет живого сайдбара для их отображения
    });

    ws.on('error', () => {
      finish(() => reject(new ChatStreamError('CONNECTION_ERROR', 'Не удалось подключиться к чату')));
    });

    ws.on('close', () => {
      finish(() => reject(new ChatStreamError('CONNECTION_CLOSED', 'Соединение прервано')));
    });
  });
}
