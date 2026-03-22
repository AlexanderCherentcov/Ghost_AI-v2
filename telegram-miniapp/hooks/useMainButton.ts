'use client';

import { useEffect } from 'react';
import { useTelegram } from './useTelegram';

interface UseMainButtonOptions {
  text: string;
  onClick: () => void;
  isVisible?: boolean;
  isLoading?: boolean;
  isActive?: boolean;
}

export function useMainButton({
  text,
  onClick,
  isVisible = true,
  isLoading = false,
  isActive = true,
}: UseMainButtonOptions) {
  const tg = useTelegram();

  useEffect(() => {
    if (!tg?.MainButton) return;
    const btn = tg.MainButton;

    btn.setText(text);
    btn.setParams({ color: '#7B5CF0', text_color: '#FFFFFF', is_active: isActive });

    if (isLoading) btn.showProgress(true);
    else btn.hideProgress();

    if (isVisible) btn.show();
    else btn.hide();

    btn.onClick(onClick);
    return () => btn.offClick(onClick);
  }, [text, onClick, isVisible, isLoading, isActive, tg]);
}
