'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { TokenIcon, CheckIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

const SUBSCRIPTIONS = [
  {
    key: 'BASIC',
    name: 'Базовый',
    price: 299,
    badge: undefined as string | undefined,
    features: ['300 сообщений', '10 картинок', '5 документов'],
  },
  {
    key: 'STANDARD',
    name: 'Стандарт',
    price: 699,
    badge: 'Популярный',
    features: ['1 000 сообщений', '30 картинок', '20 документов'],
  },
  {
    key: 'PRO',
    name: 'Про',
    price: 1490,
    badge: undefined,
    features: ['3 000 сообщений', '80 картинок', '50 документов'],
  },
  {
    key: 'ULTRA',
    name: 'Ультра',
    price: 2990,
    badge: 'Максимум',
    features: ['Без лимитов на чат', '200 картинок', '100 документов', 'Claude Sonnet везде'],
  },
];

function IconImage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="m21 15-5-5L5 21"/>
    </svg>
  );
}
function IconChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function IconDoc() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="13" y2="17"/>
    </svg>
  );
}
function IconCode() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  );
}

const ADDON_GROUPS: { title: string; Icon: () => JSX.Element; color: string; packs: { key: string; label: string; price: number }[] }[] = [
  {
    title: 'Картинки',
    Icon: IconImage,
    color: 'text-violet-400',
    packs: [
      { key: 'IMAGES_10',  label: '10 картинок',  price: 149 },
      { key: 'IMAGES_30',  label: '30 картинок',  price: 349 },
      { key: 'IMAGES_100', label: '100 картинок', price: 990 },
    ],
  },
  {
    title: 'Сообщения',
    Icon: IconChat,
    color: 'text-sky-400',
    packs: [
      { key: 'CHAT_500',   label: '500 сообщений',    price: 99 },
      { key: 'CHAT_2000',  label: '2 000 сообщений',  price: 299 },
      { key: 'CHAT_10000', label: '10 000 сообщений', price: 999 },
    ],
  },
  {
    title: 'Документы',
    Icon: IconDoc,
    color: 'text-emerald-400',
    packs: [
      { key: 'DOCS_10', label: '10 документов', price: 99 },
      { key: 'DOCS_50', label: '50 документов', price: 349 },
    ],
  },
  {
    title: 'Код',
    Icon: IconCode,
    color: 'text-orange-400',
    packs: [
      { key: 'CODE_200',  label: '200 запросов',   price: 149 },
      { key: 'CODE_1000', label: '1 000 запросов', price: 499 },
    ],
  },
];

export default function BillingPage() {
  const { user } = useAuthStore();
  const { show } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleBuy(type: 'SUBSCRIPTION' | 'ADDON' | 'TOKEN_PACK', key: string) {
    setLoading(key);
    try {
      const { paymentUrl } = await api.payments.create({ type, key });
      window.location.href = paymentUrl;
    } catch (err: any) {
      show(err.message, 'error');
    } finally {
      setLoading(null);
    }
  }

  const balance = (user?.balanceChat ?? 0) + (user?.balanceImages ?? 0) + (user?.balanceDocs ?? 0) + (user?.balanceCode ?? 0)
    + (user?.addonChat ?? 0) + (user?.addonImages ?? 0) + (user?.addonDocs ?? 0) + (user?.addonCode ?? 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium text-white">Тарифы и пополнение</h1>
        <p className="text-sm text-[rgba(255,255,255,0.3)] mt-1">
          Подписка или аддон-паки без смены тарифа
        </p>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-6 space-y-8">

        {/* Balance */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <TokenIcon size={18} className="text-accent" />
            <span className="font-medium text-white">Текущий баланс</span>
          </div>
          <div className="text-3xl font-medium text-accent">{balance.toLocaleString('ru-RU')} токенов</div>
          <p className="text-xs text-[rgba(255,255,255,0.3)] mt-2">
            Чат — 1 токен &nbsp;·&nbsp; Код — 2 &nbsp;·&nbsp; Документ — 3 &nbsp;·&nbsp; Картинка — 10
          </p>
        </div>

        {/* Subscriptions */}
        <div>
          <h2 className="text-sm font-medium text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-4">Подписки</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {SUBSCRIPTIONS.map(({ key, name, price, badge, features }) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('card relative flex flex-col', badge === 'Максимум' && 'border-accent', badge === 'Популярный' && 'border-accent/60')}
              >
                {badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-black text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap">
                    {badge}
                  </div>
                )}
                <h3 className="font-medium text-white mb-1">{name}</h3>
                <div className="text-2xl font-medium mb-4">{price} ₽<span className="text-sm text-[rgba(255,255,255,0.3)]">/мес</span></div>
                <ul className="space-y-1.5 mb-5 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-[rgba(255,255,255,0.4)]">
                      <CheckIcon size={12} className="text-accent flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleBuy('SUBSCRIPTION', key)}
                  disabled={loading === key}
                  className={cn('w-full btn h-9 text-sm', (badge === 'Максимум' || badge === 'Популярный') ? 'btn-primary' : 'btn-ghost')}
                >
                  {loading === key ? 'Загрузка...' : 'Подключить'}
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Addons */}
        <div>
          <h2 className="text-sm font-medium text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-4">Аддон-паки <span className="normal-case text-[rgba(255,255,255,0.3)]">— не сгорают, копятся</span></h2>
          <div className="space-y-4">
            {ADDON_GROUPS.map(({ title, Icon, color, packs }) => (
              <div key={title} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4">
                <div className={`flex items-center gap-2 mb-3 ${color}`}>
                  <Icon />
                  <span className="text-sm font-medium text-white">{title}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {packs.map(({ key, label, price }) => (
                    <button
                      key={key}
                      onClick={() => handleBuy('ADDON', key)}
                      disabled={loading === key}
                      className="flex items-center gap-2 bg-[var(--bg-elevated)] hover:border-accent border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
                    >
                      <span className="text-white">{label}</span>
                      <span className="text-accent font-medium">{price} ₽</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
