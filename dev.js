import { spawn } from 'child_process';

const child = spawn('npx', ['electron-forge', 'start'], {
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  process.exit(code);
});

