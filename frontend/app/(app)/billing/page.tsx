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
    price: 499,
    badge: undefined as string | undefined,
    features: ['500 сообщений', '10 картинок'],
  },
  {
    key: 'STANDARD',
    name: 'Стандарт',
    price: 999,
    badge: 'Популярный',
    features: ['1 500 сообщений', '20 картинок'],
  },
  {
    key: 'PRO',
    name: 'Про',
    price: 2190,
    badge: undefined,
    features: ['4 000 сообщений', '50 картинок'],
  },
  {
    key: 'ULTRA',
    name: 'Ультра',
    price: 4490,
    badge: 'Максимум',
    features: ['10 000 сообщений', '120 картинок', 'Приоритетная обработка'],
  },
];

function IconStdMsg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function IconExtMsg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}
function IconImage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="m21 15-5-5L5 21"/>
    </svg>
  );
}

type AddonGroup = {
  title: string;
  subtitle: string;
  Icon: () => JSX.Element;
  color: string;
  packs: { key: string; label: string; price: number }[];
};

const ADDON_GROUPS: AddonGroup[] = [
  {
    title: 'Стандартные сообщения',
    subtitle: 'Claude Haiku · 1 сообщение = 1 токен',
    Icon: IconStdMsg,
    color: 'text-sky-400',
    packs: [
      { key: 'MESSAGES_STD_200',  label: '200 сообщений',   price: 199 },
      { key: 'MESSAGES_STD_500',  label: '500 сообщений',   price: 399 },
      { key: 'MESSAGES_STD_1500', label: '1 500 сообщений', price: 999 },
    ],
  },
  {
    title: 'Расширенные сообщения',
    subtitle: 'DeepSeek · код и документы · 1 сообщение = 2 токена',
    Icon: IconExtMsg,
    color: 'text-violet-400',
    packs: [
      { key: 'MESSAGES_EXT_300',  label: '300 сообщений',   price: 199 },
      { key: 'MESSAGES_EXT_800',  label: '800 сообщений',   price: 399 },
      { key: 'MESSAGES_EXT_2000', label: '2 000 сообщений', price: 799 },
    ],
  },
  {
    title: 'Картинки',
    subtitle: 'Flux 1.1 Pro · 1 картинка = 1 токен',
    Icon: IconImage,
    color: 'text-emerald-400',
    packs: [
      { key: 'IMAGES_10',  label: '10 картинок',  price: 299  },
      { key: 'IMAGES_30',  label: '30 картинок',  price: 699  },
      { key: 'IMAGES_100', label: '100 картинок', price: 1990 },
    ],
  },
];

export default function BillingPage() {
  const { user } = useAuthStore();
  const { show } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleBuy(type: 'SUBSCRIPTION' | 'ADDON', key: string) {
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

  const msgs   = (user?.balanceMessages ?? 0) + (user?.addonMessages ?? 0);
  const images = (user?.balanceImages ?? 0)   + (user?.addonImages ?? 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium text-white">Тарифы и пополнение</h1>
        <p className="text-sm text-[rgba(255,255,255,0.3)] mt-1">Подписка или аддон-паки без смены тарифа</p>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-6 space-y-8">

        {/* Balance */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 flex gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TokenIcon size={14} className="text-accent" />
              <span className="text-xs text-[rgba(255,255,255,0.4)]">Сообщения</span>
            </div>
            <div className="text-2xl font-medium text-white">{msgs.toLocaleString('ru-RU')}</div>
          </div>
          <div className="w-px bg-[var(--border)]" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <IconImage />
              <span className="text-xs text-[rgba(255,255,255,0.4)]">Картинки</span>
            </div>
            <div className="text-2xl font-medium text-white">{images.toLocaleString('ru-RU')}</div>
          </div>
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
                <div className="text-2xl font-medium mb-4">
                  {price.toLocaleString('ru-RU')} ₽
                  <span className="text-sm text-[rgba(255,255,255,0.3)]">/мес</span>
                </div>
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
          <h2 className="text-sm font-medium text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-4">
            Аддон-паки <span className="normal-case text-[rgba(255,255,255,0.3)]">— не сгорают, копятся</span>
          </h2>
          <div className="space-y-4">
            {ADDON_GROUPS.map(({ title, subtitle, Icon, color, packs }) => (
              <div key={title} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4">
                <div className={`flex items-center gap-2 mb-0.5 ${color}`}>
                  <Icon />
                  <span className="text-sm font-medium text-white">{title}</span>
                </div>
                <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3 pl-7">{subtitle}</p>
                <div className="flex flex-wrap gap-3">
                  {packs.map(({ key, label, price }) => (
                    <button
                      key={key}
                      onClick={() => handleBuy('ADDON', key)}
                      disabled={loading === key}
                      className="flex items-center gap-2 bg-[var(--bg-elevated)] hover:border-accent border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
                    >
                      <span className="text-white">{label}</span>
                      <span className="text-accent font-medium">{price.toLocaleString('ru-RU')} ₽</span>
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
