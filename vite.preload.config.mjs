import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/preload.js'),
      name: 'preload',
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    outDir: path.resolve(__dirname, '.vite/build/preload'),
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron'],
    },
  },
});