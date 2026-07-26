'use client';

import { motion } from 'framer-motion';
import { ImageIcon } from '@/components/icons';
import type { VideoOptions } from './types';
import type { CasperCosts } from './costs';
import { getCostDisplay } from './costs';
import { CostBadge } from './CostBadge';

export function ImageWidget({ userPlan, userImages, casperCosts }: { userPlan?: string; userImages?: number; casperCosts: CasperCosts }) {
  const cost = getCostDisplay('images', {} as VideoOptions, casperCosts, userPlan, userImages, undefined, undefined);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border mb-2 px-4 py-3 flex items-center justify-between"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
        <ImageIcon size={13} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
        Опишите изображение в строке ниже
      </p>
      <CostBadge cost={cost} size={13} />
    </motion.div>
  );
}
