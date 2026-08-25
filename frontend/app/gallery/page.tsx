'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { api, type GalleryItem, type GalleryResponse } from '@/lib/api';
import { capitalizeFirst } from '@/lib/utils';
import { UserBalanceNav } from '@/components/layout/UserBalanceNav';

type DomainFilter = 'all' | 'image' | 'video';

const PAGE_LIMIT = 24;

// Эмодзи (🔥/🆕) — только для бота (там нет SVG-рендера, там это уместно и
// единообразно с остальным ботом). На сайте везде SVG-иконки, как и во всём
// остальном интерфейсе — по прямому замечанию Александра.
function TrendingIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1c1 2.5-1.5 3-1.5 5.5 0 1 .5 1.5 1.5 1.5s1.5-1 1.5-2c1.5 1 2.5 2.5 2.5 4 0 2.5-2 4.5-4.5 4.5S3 13 3 10.5C3 6 8 5 8 1z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.5l1.2 3.8 3.8 1.2-3.8 1.2L8 11.5l-1.2-3.8-3.8-1.2 3.8-1.2L8 1.5z"
        stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"
      />
      <path d="M13 10l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9z" fill="currentColor" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'}>
      <path
        d="M8 13.8s-5.6-3.4-5.6-7.4c0-1.9 1.5-3.4 3.4-3.4 1.1 0 2.1.5 2.7 1.4.6-.9 1.6-1.4 2.7-1.4 1.9 0 3.4 1.5 3.4 3.4 0 4-5.6 7.4-5.6 7.4z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
    </svg>
  );
}

// Карточка одной работы — картинка/видео (looping-превью, как в DiscoveryCard на
// главной чата), подпись модель+автор и лайк. Переиспользуемый компонент — сетка
// ниже просто мапит массив, вся логика лайка живёт здесь.
function GalleryCard({ item, canLike, onLikeChange }: {
  item: GalleryItem;
  canLike: boolean;
  onLikeChange: (id: string, liked: boolean, likesCount: number) => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    if (!canLike || pending) return;
    setPending(true);
    try {
      const { liked, likesCount } = await api.gallery.like(item.id);
      onLikeChange(item.id, liked, likesCount);
    } catch {
      // best-effort — тихо игнорируем, счётчик просто не поменяется
    } finally {
      setPending(false);
    }
  }

  return (
    <a
      href={item.mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block rounded-2xl overflow-hidden aspect-square"
      style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--panel-glass-border)' }}
    >
      {item.domain === 'video' ? (
        <video
          src={item.mediaUrl}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay loop muted playsInline
        />
      ) : (
        <img src={item.mediaUrl} alt={item.prompt} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      )}

      <div
        className="absolute inset-0 flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(5,3,17,.92) 100%)' }}
      >
        <p className="text-[12px] text-white/90 line-clamp-2 mb-1">{item.prompt}</p>
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,.55)' }}>
            {item.modelLabel} · {capitalizeFirst(item.authorName)}
          </span>
        </div>
      </div>

      <button
        onClick={handleLike}
        disabled={!canLike}
        title={canLike ? undefined : 'Войдите, чтобы лайкать'}
        className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
        style={{
          background: 'rgba(5,3,17,.6)',
          color: item.likedByMe ? 'var(--accent)' : 'rgba(255,255,255,.8)',
          cursor: canLike ? 'pointer' : 'default',
        }}
      >
        <HeartIcon filled={item.likedByMe} />
        {item.likesCount}
      </button>
    </a>
  );
}

export default function GalleryPage() {
  const { user, isLoading } = useAuthStore();
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextSort: 'top' | 'new', nextDomain: DomainFilter, nextPage: number, append: boolean) => {
    setLoading(true);
    try {
      const data: GalleryResponse = await api.gallery.list({
        sort: nextSort,
        page: nextPage,
        limit: PAGE_LIMIT,
        ...(nextDomain !== 'all' ? { domain: nextDomain } : {}),
      });
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setTotal(data.total);
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    load(sort, domainFilter, 1, false);
  }, [sort, domainFilter, load]);

  function handleLikeChange(id: string, liked: boolean, likesCount: number) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, likedByMe: liked, likesCount } : it)));
  }

  // canLike ждёт гидратации auth-стора (isLoading), иначе гость на долю секунды
  // выглядел бы залогиненным (или наоборот) — та же гонка, что и в остальном приложении.
  const canLike = !isLoading && !!user;
  const hasMore = items.length < total;

  return (
    <div className="min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)]">
      {/* Тот же навбар, что на лендинге (app/page.tsx) — фиксированная стеклянная
          панель с реальным лого. Раньше здесь был другой, более старый паттерн
          (GhostIcon вместо картинки, обычный статичный header) — по прямому
          замечанию Александра "галерея в старом дизайне". */}
      <nav className="sticky top-0 z-50 border-b border-[var(--panel-glass-border)] backdrop-blur-xl bg-[rgba(6,5,14,0.72)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="/ghostline-logo-icon.png"
              alt="GhostLine"
              className="w-9 h-9 rounded-[9px] object-cover"
              style={{ filter: 'drop-shadow(0 0 10px rgba(123,92,240,.55))' }}
            />
            <span className="font-display font-bold text-base tracking-tight">GhostLine</span>
          </Link>
          {/* Явные кнопки на главную и в чат — по прямому запросу Александра
              (раньше был только один условный "Войти"/чат-баланс). */}
          <div className="flex items-center gap-3">
            <Link href="/" className="hidden sm:block text-sm text-[rgba(255,255,255,0.6)] hover:text-white transition-colors">
              Главная
            </Link>
            {user ? (
              <UserBalanceNav caspersBalance={user.caspers_balance} />
            ) : (
              <Link href="/login" className="btn btn-primary text-sm h-9 px-5">
                Войти
              </Link>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-display font-semibold">Галерея работ</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Картинки и видео, которыми поделились пользователи GhostLine
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            {/* Вкладки по типу работы */}
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--panel-glass)', border: '1px solid var(--panel-glass-border)' }}>
              {([
                ['all', 'Все'],
                ['image', 'Картинки'],
                ['video', 'Видео'],
              ] as const).map(([d, label]) => (
                <button
                  key={d}
                  onClick={() => setDomainFilter(d)}
                  className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors"
                  style={{
                    background: domainFilter === d ? 'var(--accent-dim)' : 'transparent',
                    color: domainFilter === d ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Сортировка */}
            <div className="flex gap-2">
              {(['top', 'new'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
                  style={{
                    background: sort === s ? 'var(--accent-dim)' : 'var(--panel-glass)',
                    color: sort === s ? 'var(--accent)' : 'var(--text-secondary)',
                    border: '1px solid var(--panel-glass-border)',
                  }}
                >
                  {s === 'top' ? <TrendingIcon /> : <SparkleIcon />}
                  {s === 'top' ? 'Топ' : 'Новое'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {items.length === 0 && !loading ? (
          <div className="text-center py-24" style={{ color: 'var(--text-muted)' }}>
            Пока пусто — станьте первым, кто поделится своей работой в чате
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((item) => (
              <GalleryCard key={item.id} item={item} canLike={canLike} onLikeChange={handleLikeChange} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center mt-8">
            <button
              onClick={() => { const next = page + 1; setPage(next); load(sort, domainFilter, next, true); }}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'var(--panel-glass)', border: '1px solid var(--panel-glass-border)', color: 'var(--text-primary)' }}
            >
              {loading ? 'Загрузка...' : 'Показать ещё'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
