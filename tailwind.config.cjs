/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,js,css}'],
  theme: {
    extend: {
      keyframes: {
        'wl-in': {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'wl-out': {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.96)' },
        },
      },
      animation: {
        'wl-in': 'wl-in 0.22s ease-out both',
        'wl-out': 'wl-out 0.18s ease-in both',
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['night', 'dark', 'business'],
    darkTheme: 'night',
  },
}
