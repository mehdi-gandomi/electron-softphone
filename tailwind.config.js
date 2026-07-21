/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'rgb(var(--c-bg) / <alpha-value>)',
          surface: 'rgb(var(--c-bg-surface) / <alpha-value>)',
          'surface-2': 'rgb(var(--c-bg-surface-2) / <alpha-value>)',
          'surface-3': 'rgb(var(--c-bg-surface-3) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'rgb(var(--c-text) / <alpha-value>)',
          secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          hover: 'rgb(var(--c-accent-hover) / <alpha-value>)',
          glow: 'var(--c-accent-glow)',
          dim: 'var(--c-accent-dim)',
        },
        success: {
          DEFAULT: 'rgb(var(--c-success) / <alpha-value>)',
          glow: 'var(--c-success-glow)',
        },
        error: {
          DEFAULT: 'rgb(var(--c-error) / <alpha-value>)',
          glow: 'var(--c-error-glow)',
        },
        warning: {
          DEFAULT: 'rgb(var(--c-warning) / <alpha-value>)',
          glow: 'var(--c-warning-glow)',
        },
        border: {
          DEFAULT: 'var(--c-border)',
          hover: 'var(--c-border-hover)',
        },
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        vazir: ['Vazirmatn', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        'glow-accent': '0 0 20px var(--c-accent-glow)',
        'glow-success': '0 0 20px var(--c-success-glow)',
        'glow-error': '0 0 20px var(--c-error-glow)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4)',
        // "Real phone" device frame shadows
        'phone': '0 30px 60px -15px rgba(0, 0, 0, 0.55), 0 10px 24px -8px rgba(0, 0, 0, 0.35)',
        'phone-screen': 'inset 0 2px 10px rgba(0, 0, 0, 0.35)',
      },
      backdropBlur: {
        'glass': '12px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ripple': 'ripple 0.6s linear',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'ring': 'ring 1.5s ease-in-out infinite',
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(0)', opacity: '0.5' },
          '100%': { transform: 'scale(4)', opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        ring: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.5)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
