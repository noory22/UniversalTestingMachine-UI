import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'serialport',
        '@serialport/bindings-cpp',
        'modbus-serial',
        'electron',
      ],
    },
  },
  resolve: {
    // Some libraries that borrow from Node.js might need this
    browserField: false,
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});

