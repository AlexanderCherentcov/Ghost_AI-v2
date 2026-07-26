// Эвристики распознавания "пользователь хочет картинку" в свободном тексте чата.
// Вынесено из app/chat/page.tsx в отдельный модуль, чтобы логику можно было
// протестировать без рендера страницы (регэкспы/списки слов — самое хрупкое
// место, легко сломать при правке одной фразы и не заметить).

export const IMAGE_VERBS = [
  // повелительное наклонение
  'нарисуй', 'создай', 'сгенерируй', 'сделай', 'покажи',
  // будущее время 1 лица (голосовой ввод с телефона / опечатки)
  'нарисую', 'сгенерирую',
  // инфинитив
  'нарисовать', 'создать', 'сгенерировать', 'сделать',
  // английский
  'draw', 'generate', 'create', 'make',
];
export const IMAGE_NOUNS = [
  'картинку', 'картину', 'картинок', 'изображение', 'изображения', 'рисунок',
  'рисунки', 'иллюстрацию', 'арт', 'image', 'picture', 'photo', 'illustration',
];
export const IMAGE_EXACT = ['изображение в стиле', 'generate image', 'хочу картинку'];

// Ключевые слова, означающие, что пользователь ССЫЛАЕТСЯ на предыдущее сообщение/промпт
export const REF_KEYWORDS = [
  'по этому', 'по нему', 'по промту', 'по этой', 'этот промт', 'выше', 'его', 'из чата',
];

export const EDIT_VERBS = [
  'измени', 'изменить', 'отредактируй', 'отредактировать', 'сделай', 'поменяй', 'поменять',
  'добавь', 'добавить', 'убери', 'убрать', 'замени', 'заменить', 'преврати', 'превратить',
  'перекрась', 'раскрась', 'стилизуй', 'edit', 'change', 'modify', 'transform', 'remove', 'add',
];

export const IMAGE_EDIT_REF = ['эту картинку', 'это изображение', 'её', 'ее', 'его', 'эту', 'это фото', 'картинку выше', 'изображение выше'];

export function isImageRequest(text: string): boolean {
  const lower = text.toLowerCase();
  if (IMAGE_EXACT.some((kw) => lower.includes(kw))) return true;
  return IMAGE_VERBS.some((v) => lower.includes(v)) && IMAGE_NOUNS.some((n) => lower.includes(n));
}

export function isImageEditRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return EDIT_VERBS.some((v) => lower.includes(v)) && IMAGE_EDIT_REF.some((kw) => lower.includes(kw));
}

/**
 * true, если пользователь хочет, чтобы ИИ НАПИСАЛ промпт — а не сгенерировал изображение напрямую.
 * напр. "создай мне промт для изображения битвы", "напиши промт 9:18"
 * Исключение: "сгенерируй по этому промту" — пользователь ИСПОЛЬЗУЕТ уже написанный промпт.
 */
export function isPromptComposeRequest(text: string): boolean {
  const lower = text.toLowerCase();
  if (REF_KEYWORDS.some((ref) => lower.includes(ref))) return false;
  return lower.includes('промт') || lower.includes('prompt') || lower.includes('промпт');
}

export function extractImagePrompt(content: string): string {
  // 1. Блок кода ```...``` — наивысший приоритет
  const codeBlock = content.match(/```[^\n]*\n?([\s\S]+?)```/);
  if ((codeBlock?.[1]?.trim().length ?? 0) > 20) return codeBlock![1].trim().slice(0, 600);

  // 2. Инлайн-код `...` длиной > 20 символов
  const inline = content.match(/`([^`]{20,})`/);
  if (inline?.[1]?.trim()) return inline[1].trim().slice(0, 600);

  // 3. Жирный текст **...** длиной > 30 символов, который НЕ заголовок раздела (не заканчивается на : или —)
  const boldMatches = content.match(/\*\*([^*]{30,})\*\*/g);
  if (boldMatches?.length) {
    const candidates = boldMatches
      .map((m) => m.replace(/\*\*/g, '').trim())
      .filter((t) => !t.endsWith(':') && !t.endsWith('—') && !t.endsWith('-'))
      .sort((a, b) => b.length - a.length);
    if (candidates[0]) return candidates[0].slice(0, 600);
  }

  // 4. Текст в кавычках "..." или «...» длиной > 30 символов
  const quoted = content.match(/["""«]([^"""»\n]{30,})["""»]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim().slice(0, 600);

  // 5. Ищем строку, похожую на промпт для изображения
  const IMAGE_KEYWORDS = ['4k', '8k', 'photorealistic', 'detailed', 'style', 'lighting',
    'portrait', 'landscape', 'digital art', 'cinematic', 'high quality', 'beautiful',
    'stunning', 'realistic', 'illustration', 'render', 'resolution'];
  const INTRO_PREFIXES = ['конечно', 'вот ', 'используй', 'этот промт', 'данный', 'можно',
    'вы можете', 'для генерации', 'для создания', 'ниже', 'предлагаю', 'here ', 'this '];
  const lines = content
    .replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s+/g, '').replace(/`/g, '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 30 && !l.endsWith(':'));
  const keywordLine = lines.find((l) => IMAGE_KEYWORDS.some((kw) => l.toLowerCase().includes(kw)));
  if (keywordLine) return keywordLine.slice(0, 600);
  const nonIntroLine = lines.find((l) => !INTRO_PREFIXES.some((p) => l.toLowerCase().startsWith(p)));
  if (nonIntroLine) return nonIntroLine.slice(0, 600);
  if (lines.length) return lines.sort((a, b) => b.length - a.length)[0].slice(0, 600);

  return content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/---+/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 600);
}
