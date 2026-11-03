import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  root: '.',
  base:'.',
  build: {
    outDir: path.resolve(__dirname, '.vite/build/renderer/main_window'),      // <-- Put production HTML/assets here
    emptyOutDir: true,            // <-- Clears the folder before each build
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'), // Entry point
    },
  },
  server:{
    port:5173,
  },
  resolve:{
    alias:{
      '@':path.resolve(__dirname,'src')
    },
  },
})