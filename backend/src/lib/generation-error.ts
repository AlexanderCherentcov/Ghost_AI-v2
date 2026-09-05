// Единая классификация ошибок генерации (image/video/music) для показа
// пользователю. Сырые ошибки провайдеров (GoAPI/OpenRouter/OpenAI) часто —
// нечитаемые JSON-простыни ("GoAPI task failed: {...}") или голый статус-код,
// которые ничего не говорят обычному пользователю и никак не подсказывают,
// что делать дальше. Перегрузка апстрима — самый частый и при этом самый
// "непонятный" случай (видно только по 5xx/таймауту внутри чужого JSON), поэтому
// подменяем её на понятную рекомендацию. Остальные ошибки (неверные параметры,
// content policy и т.п.) оставляем как есть — они уже осмысленны.

const OVERLOAD_PATTERNS: RegExp[] = [
  /\b5\d{2}\b/,               // 500/502/503/504 — в том числе внутри чужого JSON/логов
  /too many requests/i,
  /rate limit/i,
  /\bbusy\b/i,
  /overloaded/i,
  /\btimeout\b/i,
  /timed out/i,
  /ECONNRESET/,
  /ETIMEDOUT/,
];

export function friendlyGenerationError(raw: string): string {
  if (OVERLOAD_PATTERNS.some((re) => re.test(raw))) {
    return 'Сервера перегружены, попробуйте другую модель или повторите чуть позже';
  }
  return raw;
}
