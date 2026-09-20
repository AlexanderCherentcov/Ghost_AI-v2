import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col items-center justify-center px-6 text-center gap-5">
      <p className="font-display text-6xl font-bold" style={{ color: '#a78bfa' }}>404</p>
      <h1 className="font-display text-2xl font-semibold text-white">Такой страницы нет</h1>
      <p className="text-sm max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        Возможно, ссылка устарела или в адресе опечатка.
      </p>
      <Link href="/" className="btn btn-primary h-11 px-6">На главную</Link>
    </div>
  );
}
