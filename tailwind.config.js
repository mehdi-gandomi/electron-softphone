/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0F0E17',
          surface: '#1A1928',
          'surface-2': '#232136',
          'surface-3': '#2C2A3E',
        },
        text: {
          DEFAULT: '#FFFFFE',
          secondary: '#A7A9BE',
          muted: '#6B6D80',
        },
        accent: {
          DEFAULT: '#7F5AF0',
          hover: '#6B46E5',
          glow: 'rgba(127, 90, 240, 0.25)',
          dim: 'rgba(127, 90, 240, 0.10)',
        },
        success: {
          DEFAULT: '#2CB67D',
          glow: 'rgba(44, 182, 125, 0.25)',
        },
        error: {
          DEFAULT: '#E53170',
          glow: 'rgba(229, 49, 112, 0.25)',
        },
        warning: {
          DEFAULT: '#FF8906',
          glow: 'rgba(255, 137, 6, 0.25)',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.06)',
          hover: 'rgba(255, 255, 255, 0.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        'glow-accent': '0 0 20px rgba(127, 90, 240, 0.3)',
        'glow-success': '0 0 20px rgba(44, 182, 125, 0.3)',
        'glow-error': '0 0 20px rgba(229, 49, 112, 0.3)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4)',
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
