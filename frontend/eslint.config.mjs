import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// В Next 16 команды `next lint` больше нет — ESLint запускается напрямую (npm run lint).
// Правила, на которые проект пока не переведён, оставлены предупреждениями, чтобы линт
// можно было включить в CI, не заваливая его старым кодом; новые нарушения видны сразу.
const config = [
  ...nextCoreWebVitals,
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'lib/particle-logos-data.js'],
  },
  {
    rules: {
      '@next/next/no-img-element': 'warn', // в проекте везде <img>, next/image не используется
      'react-hooks/exhaustive-deps': 'warn',
      // Новые правила React Compiler в eslint-config-next 16: на существующем коде срабатывают
      // (setState в эффекте для чтения window/localStorage) — переводим в предупреждения.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
];

export default config;
