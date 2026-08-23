'use client';

// Полноэкранная заглушка на время тех.работ — перекрывает всё приложение целиком
// (см. Providers.tsx), пока backend/src/lib/maintenance.ts отдаёт active:true.
// Фон — тот же приём, что в hero на лендинге (app/page.tsx): радиальные градиенты
// + дрейфующая сетка, но без canvas с частицами — там он завязан на скролл
// секции #hero, здесь просто статичная декоративная композиция.

export function MaintenancePage({ until }: { until: string | null }) {
  const untilText = until
    ? new Date(until).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }) + ' МСК'
    : null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center px-6 overflow-hidden" style={{ background: 'var(--bg-void)' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 18% 12%, rgba(123,92,240,.24), transparent 42%),' +
            'radial-gradient(circle at 84% 8%, rgba(45,212,191,.14), transparent 38%),' +
            'radial-gradient(circle at 78% 78%, rgba(242,181,68,.08), transparent 40%),' +
            'radial-gradient(circle at 12% 82%, rgba(91,63,214,.18), transparent 42%),' +
            'linear-gradient(165deg, var(--bg-primary) 0%, var(--bg-void) 46%, var(--bg-primary) 100%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(167,139,250,.08) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(167,139,250,.08) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          animation: 'gridDrift 14s linear infinite',
          maskImage: 'radial-gradient(circle at 50% 40%, rgba(0,0,0,.9), transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 40%, rgba(0,0,0,.9), transparent 72%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-[480px]">
        <img
          src="/ghostline-logo-icon.png"
          alt=""
          className="w-20 h-20 rounded-3xl object-cover animate-float mb-7"
          style={{ filter: 'drop-shadow(0 0 28px rgba(123,92,240,.55))' }}
        />

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6 text-xs font-semibold tracking-wide" style={{ borderColor: 'var(--accent-border)', background: 'var(--panel-glass)', color: '#c4b5fd' }}>
          ✦ ТЕХНИЧЕСКИЕ РАБОТЫ
        </div>

        <h1 className="font-display text-[clamp(28px,5vw,42px)] font-bold leading-[1.1] tracking-[-0.02em] mb-4" style={{ color: 'var(--text-primary)' }}>
          GhostLine ненадолго<br />ушёл в тишину
        </h1>

        <p className="text-base leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>
          Мы обновляем сервис — скоро всё снова заработает.
        </p>

        {untilText && (
          <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Ориентировочно вернёмся: <span style={{ color: '#c4b5fd', fontWeight: 600 }}>{untilText}</span>
          </p>
        )}

        <p className="text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          Спасибо за терпение 🙏
        </p>
      </div>
    </div>
  );
}
