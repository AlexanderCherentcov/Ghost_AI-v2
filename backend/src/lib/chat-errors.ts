// Классификация ошибок WS-чата (backend/src/routes/chat.ts).
// Вынесено в отдельный модуль, чтобы список кодов был протестирован отдельно —
// расхождение этого списка с реально бросаемыми кодами (tokens.ts) уже один раз
// приводило к тому, что пользователь видел общее "Генерация провалась" вместо
// реальной причины.

/**
 * Коды, которые реально бросает tokens.ts (лимиты/авторизация) — НЕ ошибки
 * провайдера. Для них: не возвращаем Caspers (ничего не списывалось) и
 * показываем пользователю точный текст ошибки, а не общий "попробуйте позже".
 */
export const CHAT_LIMIT_CODES = [
  'LIMIT_PRO_MESSAGES',
  'LIMIT_PRO_UNAVAILABLE',
  'LIMIT_IMAGES',
  'LIMIT_MUSIC',
  'LIMIT_VIDEOS',
  'INSUFFICIENT_CASPERS',
  'UNAUTHORIZED',
] as const;

export function isChatLimitCode(code: string | undefined): boolean {
  return !!code && (CHAT_LIMIT_CODES as readonly string[]).includes(code);
}

/** true — Caspers списывались и их нужно вернуть при ошибке. */
export function shouldRefundCaspers(code: string | undefined): boolean {
  return !isChatLimitCode(code);
}

/** Текст, который увидит пользователь — точная причина для лимитов, иначе общий текст. */
export function resolveChatErrorMessage(code: string | undefined, rawMessage: string | undefined): string {
  if (isChatLimitCode(code)) return rawMessage ?? 'Лимит исчерпан';
  return 'Генерация провалась, попробуйте позже';
}
