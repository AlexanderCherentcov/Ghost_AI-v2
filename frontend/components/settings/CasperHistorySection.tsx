'use client';

import { useEffect, useState } from 'react';
import { api, type CasperTransaction, type PlansResponse } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import { formatTransactionReason } from '@/lib/casper-history';
import { CasperCoin } from '@/components/icons';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function CasperHistorySection() {
  const [models, setModels] = useState<PlansResponse['models'] | null>(null);
  const [items, setItems] = useState<CasperTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([api.payments.plans(), api.payments.casperHistory(1)])
      .then(([plans, hist]) => {
        setModels(plans.models);
        setItems(hist.transactions);
        setTotal(hist.total);
        setPage(1);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const hist = await api.payments.casperHistory(next);
      setItems((prev) => [...prev, ...hist.transactions]);
      setPage(next);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = items.length < total;

  return (
    <div className="rounded-[18px] py-7 px-[30px]" style={{ background: 'var(--panel-glass)', border: '1px solid var(--panel-glass-border)' }}>
      <h2 className="font-display font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>История списания Caspers</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Все начисления и списания по вашему балансу</p>

      {loading && (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>Загрузка...</p>
      )}

      {!loading && error && items.length === 0 && (
        <p className="text-sm py-4 text-center text-red-400">Не удалось загрузить историю. Попробуйте позже.</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>Пока пусто — здесь появится история операций с Caspers</p>
      )}

      {items.length > 0 && (
        <div className="space-y-0">
          {items.map((tx) => {
            const credit = tx.amount > 0;
            return (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-3 py-3 border-b last:border-b-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {formatTransactionReason(tx.reason, models)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatDateTime(tx.createdAt)}</p>
                </div>
                <span
                  className="flex items-center gap-1 text-sm font-semibold shrink-0"
                  style={{ color: credit ? '#4ade80' : 'var(--text-secondary)' }}
                >
                  {credit ? '+' : ''}{formatNumber(tx.amount)}<CasperCoin size={12} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="btn btn-ghost h-9 px-4 text-sm mt-4 w-full sm:w-auto disabled:opacity-40"
          style={{ borderColor: 'rgba(148,163,184,.25)', color: 'var(--text-primary)' }}
        >
          {loadingMore ? 'Загрузка...' : 'Показать ещё'}
        </button>
      )}
    </div>
  );
}
