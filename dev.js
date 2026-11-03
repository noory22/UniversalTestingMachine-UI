const { spawn } = require('child_process');
const http = require('http');

console.log('Starting Vite development server...');

// Spawn Vite dev server using the renderer config
const vite = spawn('npx', ['vite', '--config', 'vite.renderer.config.mjs'], {
  shell: true,
  stdio: 'inherit'
});

let viteExited = false;
vite.on('close', (code) => {
  viteExited = true;
  if (code !== 0) {
    console.error(`Vite dev server exited with code ${code}`);
    process.exit(code || 1);
  }
});

function pollServer() {
  if (viteExited) return;

  http.get('http://localhost:5173', (res) => {
    console.log('Vite dev server is ready! Starting Electron...');
    
    const electron = spawn('npx', ['cross-env', 'NODE_ENV=development', 'electron', '.'], {
      shell: true,
      stdio: 'inherit'
    });
    
    electron.on('close', (code) => {
      console.log(`Electron process exited with code ${code}. Closing dev server...`);
      vite.kill();
      process.exit(code || 0);
    });
  }).on('error', () => {
    // Retry in 100ms
    setTimeout(pollServer, 100);
  });
}

// Start polling after a short delay
setTimeout(pollServer, 500);
