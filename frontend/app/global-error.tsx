'use client';

// Срабатывает, когда падает сам корневой layout — стили сайта к этому моменту могли не
// подгрузиться, поэтому разметка на inline-стилях и сама рисует <html>/<body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, padding: '0 24px', textAlign: 'center',
          background: '#050311', color: '#fff', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Что-то пошло не так</h1>
        <p style={{ fontSize: 14, maxWidth: 360, margin: 0, color: 'rgba(255,255,255,0.6)' }}>
          Сайт не загрузился. Обновите страницу — если ошибка повторяется, напишите нам в Telegram.
        </p>
        <button
          onClick={reset}
          style={{ height: 44, padding: '0 24px', borderRadius: 12, border: 'none', background: '#7B5CF0', color: '#fff', fontSize: 15, cursor: 'pointer' }}
        >
          Обновить
        </button>
        <a href="https://t.me/ghostlineai" style={{ fontSize: 12, color: '#c4b5fd' }}>Написать в поддержку</a>
      </body>
    </html>
  );
}
