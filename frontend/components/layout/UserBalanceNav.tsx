'use client';

import Link from 'next/link';
import { TokenIcon } from '@/components/icons';
import { formatNumber } from '@/lib/utils';

// Раньше баланс Caspers и переход в чат были ОДНОЙ кнопкой ("1234 Caspers" вело
// в /chat) — по прямому замечанию Александра, неочевидно, что клик по цифре
// баланса открывает чат, а не страницу баланса. Разделено на два понятных
// действия: бейдж баланса ведёт в /billing (где ему логично быть), отдельная
// кнопка с ясной подписью — в чат. Общий компонент — тот же блок был
// продублирован в шапке лендинга и в шапке /gallery.
export function UserBalanceNav({ caspersBalance }: { caspersBalance: number }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/billing"
        className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
        style={{ background: 'var(--panel-glass)', border: '1px solid var(--panel-glass-border)', color: 'var(--text-primary)' }}
      >
        <TokenIcon size={14} />
        {formatNumber(caspersBalance)}
      </Link>
      <Link href="/chat" className="btn btn-primary text-sm h-9 px-5">
        В чат
      </Link>
    </div>
  );
}
