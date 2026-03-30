import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // GhostLine design system
        'bg-void':      '#06060B',
        'bg-primary':   '#0A0A12',
        'bg-surface':   '#0E0E1A',
        'bg-elevated':  '#13131F',
        'bg-input':     '#161625',
        'accent':       '#7B5CF0',
        'accent-dim':   'rgba(123,92,240,0.12)',
        'accent-glow':  'rgba(123,92,240,0.15)',
        'accent-border':'rgba(123,92,240,0.25)',
        'text-pri':     'rgba(255,255,255,0.90)',
        'text-sec':     'rgba(255,255,255,0.45)',
        'text-muted':   'rgba(255,255,255,0.20)',
        'text-ghost':   'rgba(255,255,255,0.08)',
        'border-def':   'rgba(255,255,255,0.06)',
        'border-hover': 'rgba(255,255,255,0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'display': ['64px', { lineHeight: '1.05', letterSpacing: '-0.04em' }],
        'h1':      ['36px', { lineHeight: '1.15', letterSpacing: '-0.03em' }],
        'h2':      ['24px', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        'h3':      ['18px', { lineHeight: '1.4' }],
        'body':    ['15px', { lineHeight: '1.75' }],
        'small':   ['12px', { lineHeight: '1.5' }],
        'micro':   ['11px', { lineHeight: '1.4', letterSpacing: '0.04em' }],
      },
      animation: {
        'float':   'float 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.4s ease forwards',
        'bounce-slow': 'bounce 2s infinite',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
      borderRadius: {
        DEFAULT: '12px',
        'xl': '16px',
        '2xl': '20px',
      },
      boxShadow: {
        'accent': '0 0 30px rgba(123,92,240,0.15)',
        'accent-sm': '0 0 20px rgba(123,92,240,0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
