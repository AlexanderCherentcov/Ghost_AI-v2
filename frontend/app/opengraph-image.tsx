import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'GhostLine — Ваш AI-дух';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#06060B',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Radial glow background */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(123,92,240,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(90deg, transparent 0%, #7B5CF0 30%, #9B7CF0 50%, #7B5CF0 70%, transparent 100%)',
          }}
        />

        {/* Ghost icon — inline SVG representation using divs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
          {/* Body */}
          <div
            style={{
              width: 72,
              height: 86,
              borderRadius: '36px 36px 0 0',
              background: 'rgba(123,92,240,0.18)',
              border: '2px solid rgba(123,92,240,0.7)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingTop: 20,
            }}
          >
            {/* Eyes row */}
            <div style={{ display: 'flex', gap: 18, marginTop: 4 }}>
              {/* Left eye */}
              <div style={{ position: 'relative', width: 16, height: 16 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#7B5CF0' }} />
                <div style={{ position: 'absolute', top: 4, left: 4, width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.75)' }} />
              </div>
              {/* Right eye */}
              <div style={{ position: 'relative', width: 16, height: 16 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#7B5CF0' }} />
                <div style={{ position: 'absolute', top: 4, left: 4, width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.75)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            color: 'white',
            fontSize: 80,
            fontWeight: 500,
            letterSpacing: '-3px',
            lineHeight: 1,
            marginBottom: 20,
          }}
        >
          GhostLine
        </div>

        {/* Divider */}
        <div
          style={{
            width: 80,
            height: 2,
            background: 'rgba(123,92,240,0.5)',
            marginBottom: 20,
            borderRadius: 1,
          }}
        />

        {/* Tagline */}
        <div
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 28,
            letterSpacing: '-0.5px',
            textAlign: 'center',
          }}
        >
          Думает. Создаёт. Исчезает в тишине.
        </div>

        {/* Bottom badges */}
        <div style={{ display: 'flex', gap: 16, marginTop: 48 }}>
          {['Chat', 'Vision', 'Sound', 'Reel', 'Think'].map((label) => (
            <div
              key={label}
              style={{
                background: 'rgba(123,92,240,0.12)',
                border: '1px solid rgba(123,92,240,0.25)',
                borderRadius: 100,
                padding: '8px 20px',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 16,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            color: 'rgba(255,255,255,0.2)',
            fontSize: 18,
            letterSpacing: '0.5px',
          }}
        >
          ghostlineai.ru
        </div>
      </div>
    ),
    { ...size }
  );
}
