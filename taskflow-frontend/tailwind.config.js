/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7c6af7',
          hover: '#9180f9',
          dim: 'rgba(124,106,247,0.15)',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
