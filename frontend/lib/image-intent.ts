// Утилиты для работы с промтами ВНУТРИ уже явно выбранного домена
// (вкладки Картинка/Видео/Музыка) — не для угадывания домена по тексту в чате.
// Раньше здесь же жили эвристики "похоже, юзер хочет картинку прямо в чате" —
// они молча конвертировали обычное сообщение в платную генерацию без выбора
// вкладки пользователем. Убраны целиком, см. план в mellow-imagining-dawn.md.

// Ключевые слова, означающие, что пользователь ССЫЛАЕТСЯ на предыдущее сообщение/промт
export const REF_KEYWORDS = [
  'по этому', 'по нему', 'по промту', 'по этой', 'этот промт', 'выше', 'его', 'из чата',
];

// Ключевые слова намерения редактирования — когда пользователь в домене
// картинок (вкладка "Картинка") просит изменить уже сгенерированное изображение
export const EDIT_VERBS = [
  'измени', 'изменить', 'отредактируй', 'отредактировать', 'сделай', 'поменяй', 'поменять',
  'добавь', 'добавить', 'убери', 'убрать', 'замени', 'заменить', 'преврати', 'превратить',
  'перекрась', 'раскрась', 'нарисуй', 'стилизуй', 'edit', 'change', 'modify', 'transform',
  'remove', 'add', 'make it', 'turn into',
];

/** true, если в домене картинок пользователь просит отредактировать уже сгенерированное, а не создать новое */
export function isImageEditRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return EDIT_VERBS.some((v) => lower.includes(v));
}

/** Извлекает чистый промт для картинки/видео/музыки из markdown-ответа AI (убирает заголовки, жирный текст, списки и т.п.) */
export function extractImagePrompt(content: string): string {
  // 1. Блок кода ```...``` — наивысший приоритет, однозначно
  const codeBlock = content.match(/```[^\n]*\n?([\s\S]+?)```/);
  if ((codeBlock?.[1]?.trim().length ?? 0) > 20) return codeBlock![1].trim().slice(0, 600);

  // 2. Инлайн-код `...` длиннее 20 символов
  const inline = content.match(/`([^`]{20,})`/);
  if (inline?.[1]?.trim()) return inline[1].trim().slice(0, 600);

  // 3. Жирный текст **...** длиннее 30 символов, который НЕ является заголовком секции (не заканчивается на : или —)
  const boldMatches = content.match(/\*\*([^*]{30,})\*\*/g);
  if (boldMatches?.length) {
    const candidates = boldMatches
      .map((m) => m.replace(/\*\*/g, '').trim())
      .filter((t) => !t.endsWith(':') && !t.endsWith('—') && !t.endsWith('-'))
      .sort((a, b) => b.length - a.length);
    if (candidates[0]) return candidates[0].slice(0, 600);
  }

  // 4. Текст в кавычках "..." или «...» длиннее 30 символов
  const quoted = content.match(/["""«]([^"""»\n]{30,})["""»]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim().slice(0, 600);

  // 5. Ищем строку, похожую на промт для картинки (есть визуальные ключевые слова, не вводное предложение)
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

  // Финальный запасной вариант: убрать весь markdown
  return content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/---+/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 600);
}
