/** @type {import('tailwindcss').Config} */
// ElevenLabs "parchment command terminal" tokens, mirrored from src/theme.ts so
// utility classes and the constant exports stay in sync. Single source of
// visual truth for the class-based styling path.
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#fdfcfc',
        sand: '#f5f3f1',
        ash: '#e5e5e5',
        ink: '#000000',
        driftwood: '#777169',
        fog: '#a59f97',
        silver: '#b1b0b0',
        // Decorative orb ONLY — never as UI state.
        violet: '#0447ff',
        ember: '#ff4704',
      },
      fontFamily: {
        display: ['var(--font-display)', 'DM Sans', 'sans-serif'], // Waldenburg sub
        ui: ['var(--font-ui)', 'Inter', 'sans-serif'],
        logo: ['var(--font-logo)', 'Space Grotesk', 'sans-serif'], // WaldenburgFH sub
      },
      // Video type scale (their desktop scale lifted ~3.5x).
      fontSize: {
        caption: ['26px', {lineHeight: '1.4'}],
        label: ['30px', {lineHeight: '1.1', letterSpacing: '0.2px'}],
        sub: ['44px', {lineHeight: '1.5', letterSpacing: '0.16px'}],
        h2: ['84px', {lineHeight: '1.12', letterSpacing: '-1.68px'}],
        h1: ['116px', {lineHeight: '1.06', letterSpacing: '-2.32px'}],
        hero: ['168px', {lineHeight: '0.98', letterSpacing: '-3.36px'}],
      },
      borderRadius: {
        pill: '9999px',
        card: '20px',
        cardlg: '24px',
        badge: '18px',
        input: '4px',
      },
      boxShadow: {
        // ElevenLabs hairline vocabulary — never soft blurs.
        ring: 'rgba(0,0,0,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 1px 2px 0px',
        elevated:
          'rgba(0,0,0,0.4) 0px 0px 1px 0px, rgba(0,0,0,0.04) 0px 1px 1px 0px, rgba(0,0,0,0.04) 0px 2px 4px 0px',
        inset: 'rgba(0,0,0,0.075) 0px 0px 0px 0.5px inset',
      },
    },
  },
  plugins: [],
};
