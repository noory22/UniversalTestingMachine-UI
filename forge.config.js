module.exports = {
  buildIdentifier: 'prod',
  packagerConfig: {
    asar: {
      unpack: '**/*.node',
    },
    icon: './rsc/CTTM v1.0.0.ico',
    extraResource: [
      './logs'
    ],
    ignore: (file) => {
      if (!file) return false;
      if (file.startsWith('/.vite')) return false;
      if (file.startsWith('/node_modules')) return false;
      if (file === '/package.json') return false;
      return true;
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'UTM_UI',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
  ],
};

