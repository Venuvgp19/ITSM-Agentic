/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          dark: 'var(--bg-dark)',
          card: 'var(--bg-card)',
          cardHover: 'var(--bg-card-hover)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          highlight: 'var(--border-highlight)',
        },
        accent: {
          cyan: 'var(--primary-cyan)',
          emerald: 'var(--primary-emerald)',
          amber: 'var(--primary-amber)',
          rose: 'var(--primary-rose)',
          violet: 'var(--primary-violet)',
        },
        risk: {
          low: 'var(--risk-low)',
          medium: 'var(--risk-medium)',
          high: 'var(--risk-high)',
          critical: 'var(--risk-critical)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px' }],
      },
    },
  },
  plugins: [],
}
