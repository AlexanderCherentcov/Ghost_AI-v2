import { CasperCoin } from '@/components/icons';
import type { CostDisplay } from './costs';

// Переиспользуемый бейдж стоимости — показывает либо "N бесплатно/дн", либо "N + значок Caspers".
export function CostBadge({ cost, size = 12 }: { cost: CostDisplay; size?: number }) {
  if (!cost) return null;
  if (cost.type === 'free') {
    return (
      <span className="text-[11px] font-medium" style={{ color: '#4ade80' }}>
        {cost.label}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[12px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
      {cost.amount}
      <CasperCoin size={size} />
    </span>
  );
}
