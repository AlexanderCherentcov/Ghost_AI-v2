'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageViewerProps {
  url: string | null;
  onClose: () => void;
}

async function downloadImageFile(url: string) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `ghostline-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}

export function ImageViewer({ url, onClose }: ImageViewerProps) {
  // Close on Escape
  useEffect(() => {
    if (!url) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          {/* Image */}
          <motion.img
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.2 }}
            src={url}
            alt="Generated image"
            className="max-w-[90vw] max-h-[75vh] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Bottom toolbar */}
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="flex items-center gap-3 mt-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => downloadImageFile(url)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ background: '#7B5CF0', color: 'white' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v9M4 7l3 3 3-3M2 12h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Скачать
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Закрыть
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
