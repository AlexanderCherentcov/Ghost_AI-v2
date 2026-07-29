// Типизированные обёртки над методами Bot API для форум-тем и отправки
// сообщений — используются сервисом тикетов поддержки (support-tickets.ts).
import { callTelegramApi } from './telegram-api.js';

export interface InlineKeyboardMarkup {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export async function createForumTopic(botToken: string, chatId: string, name: string): Promise<number> {
  const result = await callTelegramApi<{ message_thread_id: number }>(botToken, 'createForumTopic', {
    chat_id: chatId,
    name,
  });
  return result.message_thread_id;
}

export async function reopenForumTopic(botToken: string, chatId: string, topicId: number): Promise<void> {
  await callTelegramApi(botToken, 'reopenForumTopic', { chat_id: chatId, message_thread_id: topicId });
}

export async function closeForumTopic(botToken: string, chatId: string, topicId: number): Promise<void> {
  await callTelegramApi(botToken, 'closeForumTopic', { chat_id: chatId, message_thread_id: topicId });
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  options?: { messageThreadId?: number; replyMarkup?: InlineKeyboardMarkup },
): Promise<number> {
  const result = await callTelegramApi<{ message_id: number }>(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(options?.messageThreadId ? { message_thread_id: options.messageThreadId } : {}),
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });
  return result.message_id;
}

export async function editMessageReplyMarkup(
  botToken: string,
  chatId: string | number,
  messageId: number,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
  await callTelegramApi(botToken, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup ?? { inline_keyboard: [] },
  });
}
