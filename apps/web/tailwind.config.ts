import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f8f5ee',
          100: '#eee6d5',
          200: '#dfceab',
          300: '#cdae79',
          400: '#bd914f',
          500: '#a87534',
          600: '#8b5a28',
          700: '#704422',
          800: '#5f3921',
          900: '#52311f',
        },
        steel: {
          50: '#f6f8f8',
          100: '#e9eeee',
          200: '#d6dfdf',
          300: '#b7c7c7',
          400: '#91a8aa',
          500: '#728d90',
          600: '#5a7276',
          700: '#4a5d61',
          800: '#3f4f52',
          900: '#263335',
        },
      },
      boxShadow: {
        premium: '0 24px 80px rgba(15, 23, 42, 0.12)',
        insetline: 'inset 0 1px 0 rgba(255, 255, 255, 0.72)',
      },
    },
  },
  plugins: [],
};

export default config;
