/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ---- Surfaces -------------------------------------------------------
        // Paired light/dark. Use as `bg-bg dark:bg-bg-dark`.
        bg: { DEFAULT: '#FBFBFD', dark: '#0E1116' },
        surface: { DEFAULT: '#FFFFFF', dark: '#161A21' },
        raised: { DEFAULT: '#F4F5F8', dark: '#1E242D' },
        border: { DEFAULT: '#E4E7EC', dark: '#2A313C' },

        // ---- Text -----------------------------------------------------------
        ink: { DEFAULT: '#12151A', dark: '#F2F4F8' },
        muted: { DEFAULT: '#667085', dark: '#98A2B3' },
        faint: { DEFAULT: '#98A2B3', dark: '#667085' },

        accent: { DEFAULT: '#3B6FF5', dark: '#6E97FF' },

        // ---- Status ---------------------------------------------------------
        // These four are the domain, not decoration. R2 in doc/01-product-requirements.md.
        // `open`  — committed, unresolved. Neutral: no judgement yet.
        // `c`     — completed. The only green in the app, so it reads instantly.
        // `n`     — not completed. Red, but muted; this is a fact, not an alarm.
        // `nc`    — not counted. Deliberately dull and grey. It must never feel like a
        //           reward, because it is the one status that can make a bad week look
        //           good (see guardrails, §6).
        status: {
          open: '#5B6B84',
          'open-dark': '#8FA3C0',
          c: '#2E9E6B',
          'c-dark': '#4ECB92',
          n: '#C24A5C',
          'n-dark': '#F08094',
          nc: '#8A94A6',
          'nc-dark': '#6E7889',
        },

        // Warning used by the NC-rate banner and the late_add tag. Not an error colour.
        warn: { DEFAULT: '#B77A17', dark: '#E0A63F' },
      },
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
