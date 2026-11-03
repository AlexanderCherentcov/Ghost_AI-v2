// Старые клиенты (мини-апп, открытые вкладки) шлют mode/preferredModel
// вместо id из реестра. «Стандарт» (haiku) — это бесплатный чат, не «Авто»:
// раньше оба варианта резолвились в auto и первое сообщение нового пользователя
// падало из-за нулевого баланса, не оставляя записи в статистике.
import { AUTO_MODEL_ID, FREE_CHAT_MODEL_ID } from '../config/models.js';

export function resolveLegacyModelId(mode?: 'chat' | 'think', preferredModel?: 'haiku' | 'deepseek'): string {
  if (mode === 'think' || preferredModel === 'deepseek') return 'deepseek-v3.2';
  if (preferredModel === 'haiku') return FREE_CHAT_MODEL_ID;
  return AUTO_MODEL_ID;
}
