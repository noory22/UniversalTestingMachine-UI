// vite.renderer.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  root: 'src',                     // where index.html & renderer.jsx live
  base: './',                      // important for Electron relative paths
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, '.vite/build/renderer/main_window'), // final production folder
    emptyOutDir: true,             // clear folder before build
    assetsDir: '.',                // put CSS/JS next to index.html
    rollupOptions: {
      input: path.resolve(__dirname, 'src/index.html'), // entry HTML
      output: {
        entryFileNames: 'renderer.js',   // match index.html script
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',  // CSS, images, etc
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
  },
});
