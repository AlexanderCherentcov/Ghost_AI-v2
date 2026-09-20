const DEFAULT_REDIRECT = '/chat';

/**
 * Допускает только внутренний путь вида «/что-то». Параметр redirect приходит из URL
 * (?redirect=..., #redirect=...), и без проверки router.replace('https://evil.com')
 * уводил залогиненного пользователя на чужой сайт, а «javascript:...» мог выполнить код.
 * «//host» и «/\host» браузер тоже трактует как чужой адрес — их отбрасываем.
 */
export function safeRedirect(target: string | null | undefined, fallback: string = DEFAULT_REDIRECT): string {
  if (!target) return fallback;
  if (!target.startsWith('/')) return fallback;
  if (target.startsWith('//') || target.startsWith('/\\')) return fallback;
  return target;
}
