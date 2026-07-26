import type { ReactNode } from 'react';

// Список фич тарифа — переиспользуется на лендинге и странице /billing.
// checkIcon передаётся снаружи, чтобы сохранить видимую разницу между
// страницами (billing — SVG CheckIcon, лендинг — текстовый "✓") без риска
// визуальной регрессии на платёжной странице.

interface PlanFeatureListProps {
  features: string[];
  checkIcon: ReactNode;
  textClassName?: string;
  className?: string;
}

export function PlanFeatureList({ features, checkIcon, textClassName = 'text-sm', className = 'space-y-1.5 flex-1 mb-5' }: PlanFeatureListProps) {
  return (
    <ul className={className}>
      {features.map((f) => (
        <li key={f} className={`${textClassName} text-[rgba(255,255,255,0.4)] flex items-center gap-2`}>
          {checkIcon} {f}
        </li>
      ))}
    </ul>
  );
}
