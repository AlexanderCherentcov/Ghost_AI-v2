export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Разбор заголовка Range для раздачи файлов (видео/аудио).
 *  - ByteRange — корректный одиночный диапазон;
 *  - 'unsatisfiable' — диапазон за пределами файла (ответ 416);
 *  - null — заголовок непригоден/не поддерживается (отдаём файл целиком).
 * Раньше «bytes=-500» (последние 500 байт) давал start = NaN → падение createReadStream и 500.
 */
export function parseByteRange(header: string | undefined, total: number): ByteRange | 'unsatisfiable' | null {
  if (!header || total <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null; // несколько диапазонов и прочие формы не поддерживаем — отдаём целиком

  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return null;

  let start: number;
  let end: number;
  if (startStr === '') {
    const suffix = parseInt(endStr, 10);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === '' ? total - 1 : Math.min(parseInt(endStr, 10), total - 1);
  }

  if (start >= total || start > end) return 'unsatisfiable';
  return { start, end };
}
