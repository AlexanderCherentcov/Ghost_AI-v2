'use client';

import { useEffect } from 'react';
import { useTelegram } from './useTelegram';

export function useBackButton(onBack: () => void) {
  const tg = useTelegram();

  useEffect(() => {
    if (!tg?.BackButton) return;
    tg.BackButton.show();
    tg.BackButton.onClick(onBack);
    return () => {
      tg.BackButton.hide();
      tg.BackButton.offClick(onBack);
    };
  }, [onBack, tg]);
}
