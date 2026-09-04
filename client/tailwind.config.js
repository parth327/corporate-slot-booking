/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6ff',
          200: '#bccfff',
          300: '#93aeff',
          400: '#6b88fb',
          500: '#4f6ef7',
          600: '#3b54e0',
          700: '#2f43b4',
          800: '#28398c',
          900: '#1b2560',
        },
        ink: {
          50: '#f7f8fb',
          100: '#eceef3',
          200: '#d7dbe4',
          300: '#b9bfcd',
          400: '#8a93a6',
          500: '#5a6478',
          600: '#3c4557',
          700: '#242c40',
          800: '#161d2e',
          900: '#0d1220',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#0ea5e9',
      },
      fontFamily: {
        sans: [
          'Poppins',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,18,32,.04), 0 8px 24px -12px rgba(13,18,32,.12)',
        pop: '0 12px 40px -12px rgba(13,18,32,.28)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { transform: 'scale(1.25)', opacity: '0' },
        },
        floatOrb: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(24px, -24px) scale(1.08)' },
          '66%': { transform: 'translate(-16px, 16px) scale(0.95)' },
        },
        pulseDot: {
          '0%': { boxShadow: '0 0 0 0 rgba(79, 110, 247, 0.5)' },
          '70%': { boxShadow: '0 0 0 8px rgba(79, 110, 247, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(79, 110, 247, 0)' },
        },
        badgeIn: {
          from: { opacity: '0', transform: 'scale(0.85)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shake: {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulseRing 1.8s cubic-bezier(0.24,0,0.38,1) infinite',
        'float-orb': 'floatOrb 16s ease-in-out infinite',
        'pulse-dot': 'pulseDot 2.2s ease-in-out infinite',
        'badge-in': 'badgeIn 0.35s cubic-bezier(0.22,1,0.36,1) both',
        shake: 'shake 0.4s ease both',
      },
    },
  },
  plugins: [],
};
