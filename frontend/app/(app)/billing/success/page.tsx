'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { CheckIcon } from '@/components/icons';

export default function BillingSuccessPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', bounce: 0.3 }}
      >
        <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
          <CheckIcon size={28} className="text-green-400" />
        </div>
        <h1 className="text-2xl font-medium text-white mb-3">Оплата прошла!</h1>
        <p className="text-sm text-[rgba(255,255,255,0.4)] mb-8 max-w-sm mx-auto">
          Токены будут начислены в течение нескольких секунд. Обновите страницу.
        </p>
        <Link href="/chat" className="btn btn-primary h-11 px-8">
          Вернуться в чат
        </Link>
      </motion.div>
    </div>
  );
}
