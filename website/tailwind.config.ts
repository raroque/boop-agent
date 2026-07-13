import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base:  '#0e0e0e',
          card:  '#161616',
          hover: '#1f1f1f',
        },
        border: '#272727',
        accent: {
          DEFAULT: '#f97316',
          dim:     '#7c3515',
        },
        text: {
          primary:   '#f0f0f0',
          secondary: '#888888',
          muted:     '#555555',
        },
        status: {
          green: '#22c55e',
          red:   '#ef4444',
          blue:  '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
