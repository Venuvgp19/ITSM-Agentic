/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        now: {
          header: '#1b2733',
          subnav: '#202d3a',
          surface: '#111a24',
          card: '#16222f',
          border: '#283848',
          borderLight: '#384d63',
          green: '#30bb7b',
          greenHover: '#28a76d',
          darkGreen: '#1e6844',
          blue: '#3b82f6',
          blueLink: '#4da3ff',
          text: '#d1dbe5',
          muted: '#8599ad',
          p1: '#ef4444',
          p2: '#f97316',
          p3: '#eab308',
          p4: '#22c55e',
        },
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#30bb7b',
          600: '#28a76d',
          700: '#1e6844',
          900: '#064e3b',
        },
        slate: {
          850: '#151e2e',
          900: '#111a24',
          950: '#0b1219',
        },
      },
    },
  },
  plugins: [],
};
