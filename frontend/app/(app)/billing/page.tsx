'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/Toast';
import { api, type PlansResponse } from '@/lib/api';
import { calculateCasperPrice, pricePerCasper, fakeCyclePrice, freeTierTagline, cheapestCosts, maxGenerations } from '@/lib/pricing';
import { CheckIcon, CasperCoin } from '@/components/icons';
import { PlanFeatureList } from '@/components/billing/PlanFeatureList';
import { cn, formatNumber } from '@/lib/utils';

export default function BillingPage() {
  const { user, setUser } = useAuthStore();
  const { show } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [casperSlider, setCasperSlider] = useState(100);

  // Тарифы и тиры цен на Caspers — только с бэкенда (GET /plans), без локальных копий цифр
  const [plansData, setPlansData] = useState<PlansResponse | null>(null);
  useEffect(() => {
    api.payments.plans().then(setPlansData).catch(() => show('Не удалось загрузить тарифы', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const plans = plansData?.plans ?? [];
  const casperTiers = plansData?.casper_price_tiers ?? [];
  const cheapest = plansData
    ? cheapestCosts(plansData.models.image, plansData.models.video, plansData.casper_costs.music_generate ?? 5)
    : null;

  // ── Промокод на скидку (применяется при оплате тарифа) ────────────────────
  const [promoCode, setPromoCode] = useState('');
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoDiscounts, setPromoDiscounts] = useState<Record<string, number>>({});
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);

  // ── Промокод на Caspers (активируется сразу) ───────────────────────────────
  const [casperPromoCode, setCasperPromoCode] = useState('');
  const [casperPromoLoading, setCasperPromoLoading] = useState(false);

  const plan = user?.plan ?? 'FREE';
  const isPaid = plan !== 'FREE';

  async function handleApplyPromo() {
    const code = promoCode.trim();
    if (!code) return;
    setPromoApplying(true);
    setPromoDiscounts({});
    try {
      const results = await Promise.allSettled(
        plans.map((p) => api.promo.preview(code, p.key).then((r) => [p.key, r.discountPercent] as const))
      );
      const discounts: Record<string, number> = {};
      let firstError: string | null = null;
      for (const r of results) {
        if (r.status === 'fulfilled') discounts[r.value[0]] = r.value[1];
        else if (!firstError) firstError = r.reason?.message ?? 'Не удалось применить промокод';
      }
      if (Object.keys(discounts).length === 0) {
        show(firstError ?? 'Промокод не подходит ни для одного тарифа', 'error');
        setAppliedPromoCode(null);
        return;
      }
      setPromoDiscounts(discounts);
      setAppliedPromoCode(code);
      show('Промокод применён', 'success');
    } finally {
      setPromoApplying(false);
    }
  }

  async function handleRedeemCasperPromo() {
    const code = casperPromoCode.trim();
    if (!code) return;
    setCasperPromoLoading(true);
    try {
      const { casperAmount } = await api.promo.redeem(code);
      const me = await api.auth.me();
      setUser(me);
      setCasperPromoCode('');
      show(`+${casperAmount} Caspers начислено!`, 'success');
    } catch (err: any) {
      show(err.message ?? 'Не удалось активировать промокод', 'error');
    } finally {
      setCasperPromoLoading(false);
    }
  }

  async function handleBuy(planKey: string) {
    setLoading(planKey);
    try {
      const hasDiscount = appliedPromoCode && promoDiscounts[planKey] !== undefined;
      const { paymentUrl } = await api.payments.create({
        plan: planKey,
        billing: billingCycle,
        ...(hasDiscount ? { promoCode: appliedPromoCode! } : {}),
      });
      window.location.href = paymentUrl;
    } catch (err: any) {
      show(err.message, 'error');
    } finally {
      setLoading(null);
    }
  }

  async function handleBuyCaspers() {
    if (!isPaid) return;
    setLoading('caspers');
    try {
      const { paymentUrl } = await api.payments.createCaspers({ amount: casperSlider });
      window.location.href = paymentUrl;
    } catch (err: any) {
      show(err.message, 'error');
    } finally {
      setLoading(null);
    }
  }

  const casperTotal = calculateCasperPrice(casperSlider, casperTiers);
  const casperPPU = pricePerCasper(casperSlider, casperTiers);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium text-white">Тарифы</h1>
        <p className="text-sm text-[rgba(255,255,255,0.3)] mt-1">
          Текущий план: <span className="text-accent">{plan}</span>
        </p>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-6 space-y-8">

        {/* Отображение баланса Caspers */}
        {user && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">
                  Баланс Caspers
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-medium text-white">
                    {formatNumber(user.caspers_balance)}
                  </span>
                  <span className="text-[rgba(255,255,255,0.5)] text-sm">Caspers</span>
                </div>
                {plan !== 'FREE' && (
                  <p className="text-xs text-[rgba(255,255,255,0.3)] mt-1">
                    {user.caspers_monthly} Caspers начисляется каждый месяц
                  </p>
                )}
              </div>
              {plan === 'FREE' && plansData && (
                <div className="text-right">
                  <p className="text-xs text-[rgba(255,255,255,0.6)] font-medium mb-1 flex items-center justify-end gap-1">
                    <CasperCoin size={12} />
                    {plansData.free.welcome_caspers} Caspers при регистрации
                  </p>
                  <p className="text-xs text-[rgba(255,255,255,0.4)]">Безлимитный чат</p>
                  <p className="text-xs text-[rgba(255,255,255,0.4)]">Остальное — за Caspers</p>
                </div>
              )}
            </div>

            {/* Промокод на Caspers — активируется сразу */}
            <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-2">
              <input
                type="text"
                value={casperPromoCode}
                onChange={(e) => setCasperPromoCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRedeemCasperPromo()}
                placeholder="Промокод на Caspers"
                className="input-ghost h-9 text-sm flex-1"
                style={{ height: '36px' }}
              />
              <button
                onClick={handleRedeemCasperPromo}
                disabled={!casperPromoCode.trim() || casperPromoLoading}
                className="btn btn-ghost h-9 px-4 text-sm disabled:opacity-40"
              >
                {casperPromoLoading ? 'Активирую...' : 'Активировать'}
              </button>
            </div>
          </div>
        )}

        {/* Переключатель Месяц/Год */}
        <div className="flex items-center gap-3">
          <span className={cn('text-sm', billingCycle === 'monthly' ? 'text-white' : 'text-[rgba(255,255,255,0.4)]')}>
            Месяц
          </span>
          <button
            onClick={() => setBillingCycle(c => c === 'monthly' ? 'yearly' : 'monthly')}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors',
              billingCycle === 'yearly' ? 'bg-accent' : 'bg-[var(--bg-elevated)]'
            )}
          >
            <span className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
              billingCycle === 'yearly' ? 'translate-x-5' : 'translate-x-0'
            )} />
          </button>
          <span className={cn('text-sm', billingCycle === 'yearly' ? 'text-white' : 'text-[rgba(255,255,255,0.4)]')}>
            Год
          </span>
          {billingCycle === 'yearly' && (
            <span className="text-xs font-medium bg-accent/20 text-accent px-2 py-0.5 rounded-full">
              Скидка 70%
            </span>
          )}
        </div>

        {/* Карточки тарифов — 4 колонки */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-medium text-[rgba(255,255,255,0.5)] uppercase tracking-wider">Подписки</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                placeholder="Промокод на скидку"
                className="input-ghost h-9 text-sm w-48"
                style={{ height: '36px' }}
              />
              <button
                onClick={handleApplyPromo}
                disabled={!promoCode.trim() || promoApplying}
                className="btn btn-ghost h-9 px-4 text-sm disabled:opacity-40"
              >
                {promoApplying ? 'Проверяю...' : 'Применить'}
              </button>
            </div>
          </div>

          {!plansData && (
            <p className="text-sm text-[rgba(255,255,255,0.4)]">Загрузка тарифов...</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map(({ key, label: name, description, price, price_yearly, caspers_monthly: caspers, badge, features }) => {
              const basePrice = billingCycle === 'yearly' ? price_yearly : price;
              const discountPercent = promoDiscounts[key];
              const realPrice = discountPercent
                ? Math.round(basePrice * (1 - discountPercent / 100))
                : basePrice;
              const fakePrice = fakeCyclePrice(price, billingCycle);

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'card relative flex flex-col',
                    badge === 'Популярный' && 'border-accent/60',
                    badge === 'Максимум' && 'border-accent',
                    plan === key && 'border-accent/40 bg-accent/5'
                  )}
                >
                  {badge && (
                    <div className={cn(
                      'absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap',
                      badge === 'Популярный' ? 'bg-accent text-black' : 'bg-accent text-black'
                    )}>
                      {badge}
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-2 min-h-[20px]">
                    <h3 className="font-medium text-white">{name}</h3>
                    {plan === key && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-accent/40 text-accent bg-accent/10 whitespace-nowrap ml-2">
                        Активен
                      </span>
                    )}
                  </div>
                  <p className="text-xs mb-2 leading-relaxed text-[rgba(255,255,255,0.4)]">{description}</p>

                  {/* Цена с фейковой скидкой */}
                  <div className="mb-1">
                    <span className="text-xs text-[rgba(255,255,255,0.3)] line-through mr-2">
                      {formatNumber(fakePrice)} ₽
                    </span>
                    <span className="text-xs font-medium bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                      {billingCycle === 'yearly' ? 'Скидка 70%' : 'Скидка 50%'}
                    </span>
                  </div>
                  <div className="text-2xl font-medium mb-1">
                    {formatNumber(realPrice)} ₽
                    <span className="text-sm text-[rgba(255,255,255,0.3)]">
                      {billingCycle === 'yearly' ? '/год' : '/мес'}
                    </span>
                  </div>
                  {discountPercent && (
                    <p className="text-[11px] text-green-400 mb-1">
                      Промокод: −{discountPercent}%
                    </p>
                  )}

                  <p className="text-[11px] text-accent mb-3">
                    {formatNumber(caspers)} Caspers/мес
                  </p>

                  {cheapest && (
                    <ul className="text-[11px] mb-3 space-y-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      <li>+ До {formatNumber(maxGenerations(caspers, cheapest.image))} изображений</li>
                      <li>+ До {formatNumber(maxGenerations(caspers, cheapest.video))} видео</li>
                      <li>+ До {formatNumber(maxGenerations(caspers, cheapest.music))} треков</li>
                    </ul>
                  )}

                  <PlanFeatureList
                    features={features}
                    checkIcon={<CheckIcon size={12} className="text-accent flex-shrink-0" />}
                    textClassName="text-xs"
                    className="space-y-1.5 mb-5 flex-1 mt-2"
                  />

                  <button
                    onClick={() => handleBuy(key)}
                    disabled={loading !== null}
                    className={cn(
                      'w-full btn h-9 text-sm',
                      plan === key
                        ? 'btn-accent-outline'
                        : badge === 'Популярный' || badge === 'Максимум'
                          ? 'btn-primary'
                          : 'btn-ghost'
                    )}
                  >
                    {loading === key ? 'Загрузка...' : plan === key ? 'Продлить' : 'Подключить'}
                  </button>
                </motion.div>
              );
            })}
          </div>

          {/* Плашка бесплатного плана */}
          <div className="flex items-center justify-between bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-5 py-3 mt-2">
            <div>
              <span className="font-medium text-white text-sm">Бесплатный план</span>
              {plansData && (
                <span className="ml-3 text-xs text-[rgba(255,255,255,0.4)]">
                  {freeTierTagline(plansData.free.welcome_caspers)}
                </span>
              )}
            </div>
            {plan === 'FREE' && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-accent/40 text-accent bg-accent/10 whitespace-nowrap ml-3">
                Активен
              </span>
            )}
          </div>
        </div>

        {/* Секция докупки Caspers */}
        <div className={cn(
          'bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4',
          !isPaid && 'opacity-60'
        )}>
          <div>
            <h2 className="text-base font-medium text-white">Докупить Caspers</h2>
            <p className="text-xs text-[rgba(255,255,255,0.4)] mt-0.5">
              {isPaid
                ? 'Пополните баланс в любое время'
                : 'Доступно с активной подпиской'}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[rgba(255,255,255,0.6)]">Количество:</span>
              <span className="font-medium text-white">{formatNumber(casperSlider)} Caspers</span>
            </div>
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={casperSlider}
              onChange={(e) => setCasperSlider(Number(e.target.value))}
              disabled={!isPaid}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex items-center justify-between text-xs text-[rgba(255,255,255,0.4)]">
              <span>10</span>
              <span>1 000</span>
            </div>
          </div>

          <div className="bg-[var(--bg-elevated)] rounded-xl p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-[rgba(255,255,255,0.5)]">Цена за 1 Casper:</span>
              <span className="text-white">{casperPPU} ₽</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-[rgba(255,255,255,0.7)]">Итого:</span>
              <span className="text-accent">{formatNumber(casperTotal)} ₽</span>
            </div>
          </div>

          <button
            onClick={handleBuyCaspers}
            disabled={!isPaid || loading !== null}
            className="w-full btn btn-primary h-10 text-sm"
          >
            {loading === 'caspers'
              ? 'Загрузка...'
              : `Купить ${formatNumber(casperSlider)} Caspers за ${formatNumber(casperTotal)} ₽`}
          </button>
        </div>

      </div>
    </div>
  );
}
