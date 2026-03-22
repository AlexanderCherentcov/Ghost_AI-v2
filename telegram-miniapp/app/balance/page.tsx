'use client';

import { useEffect, useState } from 'react';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

const PACKS = [
  { key: 'STARTER', label: 'Starter',  price: 99,   tokens: '100K' },
  { key: 'MEDIUM',  label: 'Medium',   price: 390,  tokens: '500K' },
  { key: 'LARGE',   label: 'Large',    price: 1290, tokens: '2M' },
  { key: 'MEGA',    label: 'Mega',     price: 4900, tokens: '10M' },
];

interface User {
  tokenBalance: number;
  plan: string;
}

function BalanceApp() {
  const tg = useTg();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<User>('/me').then(setUser).catch(() => {});
  }, []);

  async function handleBuy(key: string) {
    setLoading(key);
    tg?.HapticFeedback.impactOccurred('light');
    try {
      const { paymentUrl } = await apiRequest<{ paymentUrl: string }>('/payments/create', {
        method: 'POST',
        body: JSON.stringify({ type: 'TOKEN_PACK', key }),
      });
      tg?.openLink(paymentUrl);
    } catch (err: any) {
      tg?.showAlert(err.message);
    } finally {
      setLoading(null);
    }
  }

  const balance = user?.tokenBalance ?? 0;
  const maxTokens = { FREE: 50000, PRO: 500000, ULTRA: 2000000, TEAM: 10000000 }[user?.plan ?? 'FREE'] ?? 50000;

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A12] pb-[80px]">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="font-medium text-white">Баланс</h1>
      </div>

      <div className="px-4 py-4">
        {/* Balance card */}
        <div className="bg-[#0E0E1A] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-[rgba(255,255,255,0.4)]">Токены</span>
            <span className="text-sm text-[#7B5CF0]">{user?.plan ?? 'FREE'}</span>
          </div>
          <div className="text-2xl font-medium text-white mb-3">
            {balance >= 1000000 ? `${(balance / 1000000).toFixed(1)}M` : balance >= 1000 ? `${Math.floor(balance / 1000)}K` : balance}
          </div>
          <div className="h-1.5 bg-[#13131F] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#7B5CF0] rounded-full transition-all"
              style={{ width: `${Math.min((balance / maxTokens) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Packs */}
        <h2 className="text-sm font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-3">
          Пополнить токены
        </h2>
        <div className="space-y-3">
          {PACKS.map(({ key, label, price, tokens }) => (
            <div
              key={key}
              className="bg-[#0E0E1A] border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-white text-sm">{label}</p>
                <p className="text-xs text-[#7B5CF0]">{tokens} токенов</p>
              </div>
              <button
                onClick={() => handleBuy(key)}
                disabled={loading === key}
                className="px-4 py-2 rounded-xl bg-[#7B5CF0] text-white text-sm font-medium disabled:opacity-50"
              >
                {loading === key ? '...' : `${price} ₽`}
              </button>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

export default function TgBalancePage() {
  return <TelegramProvider><BalanceApp /></TelegramProvider>;
}
