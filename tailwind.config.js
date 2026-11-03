/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        utm: {
          blue: '#00509E',
          'blue-hover': '#003F7F',
          cyan: '#308DC2',
          red: '#dc3545',
          'red-hover': '#c82333',
          darkred: '#AA0000',
          'darkred-hover': '#8C0000',
          green: '#28a745',
          'green-hover': '#218838',
          yellow: '#ffc107',
          'yellow-hover': '#e0a800',
          bg: '#E9EEF1',
          card: '#F8FAFC',
          border: '#E2E8F0',
        }
      },
      fontFamily: {
        sf: ['"SF Pro Display"', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

