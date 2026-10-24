/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        joplin: {
          sidebar: '#1e2430',
          list: '#272f3d',
          editor: '#1f242d',
          active: '#3b82f6',
          border: '#333b4d'
        }
      }
    },
  },
  plugins: [],
}
