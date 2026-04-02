/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        macaron: {
          bg: '#fdf2f8',
          pink: '#fbcfe8',
          'pink-border': '#f9a8d4',
          blue: '#bfdbfe',
          'blue-border': '#93c5fd',
          green: '#bbf7d0',
          'green-border': '#86efac',
          yellow: '#fef9c3',
          text: '#334155',
          border: '#94a3b8',
        },
      },
      boxShadow: {
        'macaron-window': '4px 4px 0px 0px #e2e8f0',
        'macaron-window-green': '6px 6px 0px 0px #d1fae5',
        'macaron-button-pink': '2px 2px 0px 0px #fbcfe8',
        'macaron-button-blue': '2px 2px 0px 0px #bfdbfe',
        'macaron-button-slate': '2px 2px 0px 0px #e2e8f0',
        'macaron-button-yellow': '2px 2px 0px 0px #fef9c3',
      },
      backgroundImage: {
        'macaron-grid':
          'linear-gradient(to_right,#fbcfe8 1px,transparent 1px),linear-gradient(to_bottom,#fbcfe8 1px,transparent 1px)',
        'window-grid':
          'linear-gradient(to_right,#e2e8f0 1px,transparent 1px),linear-gradient(to_bottom,#e2e8f0 1px,transparent 1px)',
      },
      backgroundSize: {
        'macaron-grid': '2rem 2rem',
        'window-grid': '1rem 1rem',
      },
      fontFamily: {
        sans: ['"Nunito"', '"Trebuchet MS"', '"Segoe UI"', '"Microsoft YaHei"', 'sans-serif'],
        serif: ['"Georgia"', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [],
};
