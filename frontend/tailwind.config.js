/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Lora', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // "paper" — the warm, calm neutral scale everything sits on
        // (SRS §29.1: book-centric, clean, calm) instead of stark
        // white/gray.
        paper: {
          50: '#FBF8F3',
          100: '#F4EEE3',
          200: '#E8DFCF',
          300: '#D8CBAF',
          400: '#B7A98A',
          500: '#93855F',
          700: '#5B5347',
          800: '#3D3830',
          900: '#26221D',
        },
        // "moss" — the primary accent: a muted forest green standing in
        // for the default Tailwind indigo/blue.
        moss: {
          50: '#EEF3EE',
          100: '#D6E4D8',
          300: '#8FB08F',
          500: '#4F7A5C',
          600: '#3E6249',
          700: '#2F4B38',
          900: '#1B2B20',
        },
        // "ember" — a warm secondary accent used sparingly (streaks,
        // ratings, saved quotes).
        ember: {
          400: '#C97B4A',
          500: '#B35F2E',
          600: '#93481F',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(38, 34, 29, 0.06), 0 4px 12px rgba(38, 34, 29, 0.05)',
      },
    },
  },
  plugins: [],
};
