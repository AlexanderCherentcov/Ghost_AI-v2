'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { UserIcon, TokenIcon } from '@/components/icons';
import { formatDate, formatTokens } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: txData } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => api.auth.transactions(),
  });

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const updated = await api.auth.updateMe({ name });
    setUser(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium text-white">Профиль</h1>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-6 space-y-6">
        {/* Avatar + name */}
        <div className="card">
          <div className="flex items-center gap-4 mb-5">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
                <UserIcon size={24} className="text-accent" />
              </div>
            )}
            <div>
              <p className="font-medium text-white">{user?.name ?? 'Ghost User'}</p>
              <p className="text-sm text-[rgba(255,255,255,0.3)]">{user?.email ?? 'Telegram аккаунт'}</p>
              <span className="inline-block mt-1 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                {user?.plan ?? 'FREE'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1.5 block">
                Имя
              </label>
              <input
                className="input-ghost"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || name === user?.name}
              className="btn btn-primary h-10 px-6 text-sm disabled:opacity-40"
            >
              {saving ? 'Сохранение...' : saved ? '✓ Сохранено' : 'Сохранить'}
            </button>
          </div>
        </div>

        {/* Token stats */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TokenIcon size={18} className="text-accent" />
            <h2 className="font-medium text-white">Токены</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--bg-elevated)] rounded-xl p-3">
              <p className="text-xs text-[rgba(255,255,255,0.3)] mb-1">Баланс</p>
              <p className="text-lg font-medium text-accent">{formatTokens(user?.tokenBalance ?? 0)}</p>
            </div>
            <div className="bg-[var(--bg-elevated)] rounded-xl p-3">
              <p className="text-xs text-[rgba(255,255,255,0.3)] mb-1">Истекает</p>
              <p className="text-sm text-white">
                {user?.planExpiresAt ? formatDate(user.planExpiresAt) : 'Не истекает'}
              </p>
            </div>
          </div>
        </div>

        {/* Transaction history */}
        {txData?.transactions && txData.transactions.length > 0 && (
          <div className="card">
            <h2 className="font-medium text-white mb-4">История транзакций</h2>
            <div className="space-y-2">
              {txData.transactions.slice(0, 10).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                  <div>
                    <p className="text-sm text-[rgba(255,255,255,0.6)]">{tx.type}</p>
                    <p className="text-xs text-[rgba(255,255,255,0.2)]">{formatDate(tx.createdAt)}</p>
                  </div>
                  <span className={`text-sm font-medium ${tx.amount > 0 ? 'text-green-400' : 'text-[rgba(255,255,255,0.4)]'}`}>
                    {tx.amount > 0 ? '+' : ''}{formatTokens(Math.abs(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
