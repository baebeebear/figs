/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        editorial: ['Newsreader', 'New York', 'Georgia', 'serif'],
        serif: ['Newsreader', 'New York', 'Georgia', 'serif'],
        ui: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: {
          pure: '#FFFFFF',
          bg: '#F5F5F7',
        },
        ink: {
          primary: '#111111',
          secondary: '#6E6E73',
        },
        brand: {
          plum: '#1A0D40',
        },
      },
      boxShadow: {
        'ios-glass': '0 4px 30px rgba(0, 0, 0, 0.015)',
        'ios-card': '0 8px 40px rgba(0, 0, 0, 0.02)',
      },
    },
  },
  plugins: [],
}
