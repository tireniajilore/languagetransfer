import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2937',
        mist: '#eff6ff',
        sun: '#f59e0b',
        coral: '#f97316',
        leaf: '#16a34a'
      },
      fontFamily: {
        sans: ['"Avenir Next"', 'Avenir', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        panel: '0 18px 60px rgba(15, 23, 42, 0.12)'
      }
    }
  },
  plugins: []
};

export default config;
