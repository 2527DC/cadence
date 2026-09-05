const colors = require('./src/constants/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      borderRadius: {
        card: '14px',
        sheet: '22px',
      },
      spacing: {
        gutter: '16px',
        card: '14px',
      },
      fontSize: {
        // Tuned for a list-dense app read at arm's length.
        micro: ['11px', { lineHeight: '14px' }],
        meta: ['13px', { lineHeight: '18px' }],
      },
      borderWidth: {
        // A draft task is dashed, a finalized task is solid. That single visual
        // difference carries rule R1, so it gets its own token.
        draft: '1.5px',
      },
    },
  },
  plugins: [],
};
