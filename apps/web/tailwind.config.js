/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Manrope',
          'Noto Sans TC',
          'Microsoft JhengHei',
          'sans-serif',
        ],
        serif: [
          'Newsreader',
          'Noto Serif TC',
          'Songti TC',
          'PMingLiU',
          'serif',
        ],
      },
      colors: {
        brand: {
          50: '#f8ebe6',
          100: '#f1d9d0',
          200: '#e7bbac',
          300: '#da9a86',
          400: '#cd7961',
          500: '#c4664d',
          600: '#b8573e',
          700: '#964530',
          800: '#763726',
          900: '#57291e',
        },
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft-rgb) / <alpha-value>)',
        paper: 'rgb(var(--paper-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
        terracotta: '#b8573e',
        sage: '#6e947d',
        gold: '#d6a848',
      },
      maxWidth: {
        prose: '72ch',
        shell: '1180px',
      },
    },
  },
  plugins: [],
};
