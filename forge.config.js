const path = require('path');

module.exports = {
  buildIdentifier: 'prod',
  packagerConfig: {
    asar: {
      unpack: '**/*.node',
    },
    icon: path.resolve(__dirname, 'src/assets/icon.ico'),
    win32metadata: {
      CompanyName: 'Revive Medical Technologies',
      FileDescription: 'Desktop App',
      OriginalFileName: 'Universal Testing Machine',
      ProductName: 'UTM',
      InternalName: 'Universal Testing Machine',
    },
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
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'noory22',
          name: 'UniversalTestingMachine-UI',
        },
        prerelease: false,
      },
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
