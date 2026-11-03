const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ModbusRTU = require('modbus-serial');
const { SerialPort } = require('serialport');

// Prevent garbage collection of main window
let mainWindow = null;

// Modbus & Hardware state
let modbusClient = null;
let currentPort = null;
let isConnected = false;
let pollingTimer = null;
let isPolling = false;

let regZValue = 0;
let processRunning = false;
let tearActive = false;
let tearTimer = null;
let normalTimer = null;
let tareTimer = null;

// CSV logging state
const logsDir = path.join(app.isPackaged ? path.dirname(process.execPath) : process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

let activeCsvPath = null;
let activeCsvStream = null;
let forceAccumulator = [];

// Helper: send status to renderer
function sendConnectionStatus(connected, message, port = currentPort) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('com:connection-status', {
      connected,
      message,
      port,
      regZ: regZValue,
    });
  }
}

function sendTelemetry(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('utm:telemetry', data);
  }
}

function sendError(error) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('utm:error', error);
  }
}

function sendProcessState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('utm:process-state', {
      processRunning,
      tearActive,
      regZ: regZValue,
    });
  }
}

// Format timestamp: YYYY-MM-DD HH:mm:ss.SSS
function formatTimestamp(d = new Date()) {
  const pad = (n, s = 2) => String(n).padStart(s, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const ms = pad(d.getMilliseconds(), 3);
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}.${ms}`;
}

// Start polling loop
function startPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  
  pollingTimer = setInterval(async () => {
    if (!isConnected || !modbusClient || isPolling) return;
    
    isPolling = true;
    try {
      // 1. Read REG_Z (R5)
      try {
        const respZ = await modbusClient.readHoldingRegisters(5, 1);
        if (respZ && respZ.data && respZ.data.length > 0) {
          const newZ = respZ.data[0];
          if (newZ !== regZValue) {
            regZValue = newZ;
            sendProcessState();
          }
        }
      } catch (e) {
        // Continue to other reads
      }

      // 2. Read Distance REG_X (R10)
      let distance = 0;
      try {
        const respX = await modbusClient.readHoldingRegisters(10, 1);
        if (respX && respX.data && respX.data.length > 0) {
          distance = respX.data[0];
        }
      } catch (e) {}

      // 3. Read Force REG_Y (R14 + R15) - 32-bit float LE
      let force = 0.0;
      try {
        const respY = await modbusClient.readHoldingRegisters(14, 2);
        if (respY && respY.data && respY.data.length >= 2) {
          const r14 = respY.data[0]; // low word
          const r15 = respY.data[1]; // high word
          const buf = Buffer.alloc(4);
          buf.writeUInt16LE(r14, 0);
          buf.writeUInt16LE(r15, 2);
          force = buf.readFloatLE(0);
          if (isNaN(force)) force = 0.0;
        }
      } catch (e) {}

      // 4. Read Settings Registers: R100 (REG_F) & R101 (REG_G)
      let r100 = 0;
      let r101 = 0;
      try {
        const respSettings = await modbusClient.readHoldingRegisters(100, 2);
        if (respSettings && respSettings.data && respSettings.data.length >= 2) {
          let raw100 = respSettings.data[0];
          let raw101 = respSettings.data[1];
          r100 = raw100 > 32767 ? raw100 - 65536 : raw100;
          r101 = raw101 > 32767 ? raw101 - 65536 : raw101;
        }
      } catch (e) {}

      // Send telemetry
      sendTelemetry({
        distance,
        force,
        r100,
        r101,
        regZ: regZValue,
        processRunning,
        tearActive,
      });

      // If test process is running and tear is not active, record CSV row
      if (processRunning && !tearActive && activeCsvStream) {
        const ts = formatTimestamp();
        const forceN = (force / 1000.0).toFixed(6);
        const row = `${ts},${distance},${force.toFixed(3)},${forceN}\n`;
        activeCsvStream.write(row);
        forceAccumulator.push(force);
      }
    } catch (err) {
      console.error('Polling error:', err);
    } finally {
      isPolling = false;
    }
  }, 500); // 500ms update interval as in UTM Python
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  isPolling = false;
}

// Disconnect helper
async function disconnectModbus() {
  stopPolling();
  
  if (tearTimer) {
    clearTimeout(tearTimer);
    tearTimer = null;
  }
  if (normalTimer) {
    clearTimeout(normalTimer);
    normalTimer = null;
  }
  if (tareTimer) {
    clearTimeout(tareTimer);
    tareTimer = null;
  }

  if (processRunning) {
    await stopProcessLogging();
  }

  if (modbusClient) {
    try {
      if (modbusClient.isOpen) {
        await new Promise((resolve) => modbusClient.close(resolve));
      }
    } catch (e) {
      console.warn('Error closing modbus client:', e);
    }
    modbusClient = null;
  }

  isConnected = false;
  currentPort = null;
  sendConnectionStatus(false, 'Disconnected');
  sendProcessState();
}

// CSV Session Helpers
function startProcessLogging() {
  try {
    // Generate filename matching Python format: process_data_YYYYMMDD_HHmmss.csv
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const filename = `process_data_${yyyy}${MM}${dd}_${hh}${mm}${ss}.csv`;
    
    activeCsvPath = path.join(logsDir, filename);
    forceAccumulator = [];
    
    activeCsvStream = fs.createWriteStream(activeCsvPath, { encoding: 'utf8' });
    activeCsvStream.write('Timestamp,Distance (mm),Force (mN),Force (N)\n');
    return { success: true, filename, path: activeCsvPath };
  } catch (err) {
    console.error('Failed to start CSV logging:', err);
    return { success: false, error: err.message };
  }
}

async function stopProcessLogging() {
  if (!activeCsvStream) return;
  
  try {
    if (forceAccumulator.length > 0) {
      const sum = forceAccumulator.reduce((a, b) => a + b, 0);
      const avgMn = sum / forceAccumulator.length;
      const avgN = avgMn / 1000.0;
      
      // Two blank separator rows for visual spacing, then Average Force row
      activeCsvStream.write('\n\n');
      activeCsvStream.write(`Average Force,,${avgMn.toFixed(3)},${avgN.toFixed(6)}\n`);
    }
    
    await new Promise((resolve) => activeCsvStream.end(resolve));
  } catch (err) {
    console.error('Error stopping CSV logging:', err);
  } finally {
    activeCsvStream = null;
    activeCsvPath = null;
    forceAccumulator = [];
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 640,
    minWidth: 980,
    minHeight: 580,
    title: 'Catheter Trackability Testing Machine',
    icon: path.join(__dirname, 'assets', 'CTTM v1.0.0.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  // Log renderer load failures for diagnostics
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer] Failed to load: ${errorDescription} (code ${errorCode}) URL: ${validatedURL}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Renderer] Process gone:', details.reason, details.exitCode);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const rendererPath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    console.log('[Main] Loading renderer from:', rendererPath);
    mainWindow.loadFile(rendererPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await disconnectModbus();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Setup IPC Handlers
function setupIpcHandlers() {
  // 1. List Ports
  ipcMain.handle('com:list-ports', async () => {
    try {
      const ports = await SerialPort.list();
      const availablePorts = ports.map((p) => {
        const desc = (p.friendlyName || p.manufacturer || p.path || '').toLowerCase();
        const isConverter = /ch340|usb|serial|ftdi|prolific|cp210|rs-232|rs232/.test(desc);
        return {
          device: p.path,
          description: p.friendlyName || p.manufacturer || p.path,
          isConverter,
        };
      });

      // Sort by COM port number
      availablePorts.sort((a, b) => {
        const numA = parseInt((a.device.match(/COM(\d+)/i) || [])[1] || '999', 10);
        const numB = parseInt((b.device.match(/COM(\d+)/i) || [])[1] || '999', 10);
        return numA - numB;
      });

      return { success: true, ports: availablePorts };
    } catch (err) {
      return { success: false, error: err.message, ports: [] };
    }
  });

  // 2. Connect
  ipcMain.handle('com:connect', async (_event, portName) => {
    if (!portName) return { success: false, message: 'No COM port specified' };
    
    await disconnectModbus();

    try {
      modbusClient = new ModbusRTU();
      modbusClient.setTimeout(1000);

      await modbusClient.connectRTUBuffered(portName, {
        baudRate: 9600,
        dataBits: 8,
        parity: 'even',
        stopBits: 1,
      });

      modbusClient.setID(1);
      isConnected = true;
      currentPort = portName;

      sendConnectionStatus(true, `Connected to ${portName}`);
      startPolling();

      return { success: true, message: `Connected to ${portName}` };
    } catch (err) {
      isConnected = false;
      currentPort = null;
      if (modbusClient) {
        try { modbusClient.close(); } catch (e) {}
        modbusClient = null;
      }
      sendConnectionStatus(false, `Failed to connect: ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  // 3. Disconnect
  ipcMain.handle('com:disconnect', async () => {
    await disconnectModbus();
    return { success: true, message: 'Disconnected' };
  });

  // 4. Get Status
  ipcMain.handle('com:get-status', () => {
    return {
      connected: isConnected,
      port: currentPort,
      regZ: regZValue,
      processRunning,
      tearActive,
    };
  });

  // 5. Start Process (M3 = 2003)
  ipcMain.handle('utm:start-process', async () => {
    if (!isConnected || !modbusClient) {
      return { success: false, message: 'Not connected to PLC!' };
    }
    if (regZValue !== 1) {
      return { success: false, message: 'Cannot start process: REG_Z is not 1!' };
    }

    try {
      const logResult = startProcessLogging();
      if (!logResult.success) {
        return { success: false, message: logResult.error };
      }

      // Write coils according to Python UTM logic:
      // COIL_START (2003)=true, COIL_RESET (2004)=false, COIL_STOP (2006)=false, COIL_TEAR (2007)=false
      await modbusClient.writeCoil(2003, true);
      await modbusClient.writeCoil(2004, false);
      await modbusClient.writeCoil(2006, false);
      await modbusClient.writeCoil(2007, false);

      processRunning = true;
      tearActive = false;
      sendProcessState();

      return { success: true, filename: logResult.filename };
    } catch (err) {
      await stopProcessLogging();
      sendError(`Error starting process: ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  // 6. Stop Process (M6 = 2006)
  ipcMain.handle('utm:stop-process', async () => {
    if (!isConnected || !modbusClient) {
      processRunning = false;
      await stopProcessLogging();
      sendProcessState();
      return { success: true };
    }

    try {
      // COIL_STOP (2006)=true, COIL_START (2003)=false, COIL_RESET (2004)=false, COIL_TEAR (2007)=false
      await modbusClient.writeCoil(2006, true);
      await modbusClient.writeCoil(2003, false);
      await modbusClient.writeCoil(2004, false);
      await modbusClient.writeCoil(2007, false);

      processRunning = false;
      await stopProcessLogging();
      sendProcessState();

      return { success: true };
    } catch (err) {
      processRunning = false;
      await stopProcessLogging();
      sendProcessState();
      sendError(`Error stopping process: ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  // 7. Reset Process (M4 = 2004)
  ipcMain.handle('utm:reset-process', async () => {
    if (processRunning) {
      processRunning = false;
      await stopProcessLogging();
    }

    if (!isConnected || !modbusClient) {
      sendProcessState();
      return { success: true };
    }

    try {
      // COIL_RESET (2004)=true, COIL_STOP (2006)=false, COIL_START (2003)=false, COIL_TEAR (2007)=false
      await modbusClient.writeCoil(2004, true);
      await modbusClient.writeCoil(2006, false);
      await modbusClient.writeCoil(2003, false);
      await modbusClient.writeCoil(2007, false);

      sendProcessState();
      return { success: true };
    } catch (err) {
      sendError(`Error resetting process: ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  // 8. Tare (M7 = 2007) - 1 second timed pulse
  ipcMain.handle('utm:activate-tare', async () => {
    if (!isConnected || !modbusClient) {
      return { success: false, message: 'Not connected to PLC!' };
    }
    if (tearActive) {
      return { success: false, message: 'Tare is already active!' };
    }

    try {
      if (processRunning) {
        processRunning = false;
        await stopProcessLogging();
      }

      await modbusClient.writeCoil(2007, true);
      await modbusClient.writeCoil(2003, false);
      await modbusClient.writeCoil(2006, false);
      await modbusClient.writeCoil(2004, false);

      tearActive = true;
      sendProcessState();

      if (tearTimer) clearTimeout(tearTimer);
      tearTimer = setTimeout(async () => {
        try {
          if (modbusClient && isConnected) {
            await modbusClient.writeCoil(2007, false);
          }
        } catch (e) {
          console.error('Error turning off Tare M7:', e);
        } finally {
          tearActive = false;
          tearTimer = null;
          sendProcessState();
        }
      }, 1000);

      return { success: true };
    } catch (err) {
      tearActive = false;
      sendProcessState();
      sendError(`Error turning on Tare (M7): ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  // 9. Calibration: Normal Mode (M100 = 2100) - 1-second pulse
  ipcMain.handle('utm:activate-normal', async () => {
    if (!isConnected || !modbusClient) {
      return { success: false, message: 'Not connected to PLC!' };
    }

    try {
      await modbusClient.writeCoil(2100, true);
      if (normalTimer) clearTimeout(normalTimer);
      normalTimer = setTimeout(async () => {
        try {
          if (modbusClient && isConnected) {
            await modbusClient.writeCoil(2100, false);
          }
        } catch (e) {
          console.error('Error turning off Normal M100:', e);
        } finally {
          normalTimer = null;
        }
      }, 1000);

      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 10. Calibration: Set Mode Coil (M100 / M102)
  ipcMain.handle('utm:set-calibrate-mode', async (_event, mode) => {
    if (!isConnected || !modbusClient) {
      return { success: false, message: 'Not connected to PLC!' };
    }

    try {
      if (mode === 'normal') {
        await modbusClient.writeCoil(2100, true);
        await modbusClient.writeCoil(2102, false);
      } else if (mode === 'calibrate') {
        await modbusClient.writeCoil(2100, false);
        await modbusClient.writeCoil(2102, true);
      } else if (mode === 'tare') {
        await modbusClient.writeCoil(2101, true);
        if (tareTimer) clearTimeout(tareTimer);
        tareTimer = setTimeout(async () => {
          try {
            if (modbusClient && isConnected) {
              await modbusClient.writeCoil(2101, false);
            }
          } catch (e) {}
        }, 1000);
      }
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 11. Calibration: Send Weight to R102 (REG_WEIGHT)
  ipcMain.handle('utm:send-weight', async (_event, value) => {
    if (!isConnected || !modbusClient) {
      return { success: false, message: 'Not connected to PLC or error writing register.' };
    }

    const intVal = parseInt(value, 10);
    if (isNaN(intVal) || intVal < 0 || intVal > 1000) {
      return { success: false, message: 'Weight parameter must be between 0 and 1000.' };
    }

    try {
      await modbusClient.writeRegister(102, intVal);
      return { success: true, message: `Weight parameter ${intVal} sent to register R102!` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 12. List CSV Logs
  ipcMain.handle('logs:list', async () => {
    try {
      if (!fs.existsSync(logsDir)) {
        return { success: true, files: [] };
      }

      const fileNames = fs.readdirSync(logsDir).filter((f) => f.endsWith('.csv'));
      const fileList = fileNames.map((name) => {
        const fullPath = path.join(logsDir, name);
        const stats = fs.statSync(fullPath);
        return {
          name,
          path: fullPath,
          size: stats.size,
          mtime: stats.mtimeMs,
        };
      });

      // Sort newest first
      fileList.sort((a, b) => b.mtime - a.mtime);

      return { success: true, files: fileList };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  });

  // 13. Read CSV Log & parse points
  ipcMain.handle('logs:read', async (_event, filename) => {
    try {
      const fullPath = path.isAbsolute(filename) ? filename : path.join(logsDir, filename);
      if (!fs.existsSync(fullPath)) {
        return { success: false, message: 'File not found' };
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      
      const distance = [];
      const force = [];
      const points = [];
      let avgForce = null;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('Average Force')) {
          const parts = line.split(',');
          if (parts[2]) avgForce = parseFloat(parts[2]);
          continue;
        }

        const parts = line.split(',');
        if (parts.length >= 3) {
          const d = parseFloat(parts[1]);
          const f = parseFloat(parts[2]);
          if (!isNaN(d) && !isNaN(f)) {
            distance.push(d);
            force.push(f);
            points.push({ time: parts[0], distance: d, force: f });
          }
        }
      }

      return {
        success: true,
        filename: path.basename(fullPath),
        path: fullPath,
        distance,
        force,
        points,
        avgForce,
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 14. Delete single CSV Log
  ipcMain.handle('logs:delete', async (_event, filename) => {
    try {
      const fullPath = path.isAbsolute(filename) ? filename : path.join(logsDir, filename);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 15. Delete all CSV Logs
  ipcMain.handle('logs:delete-all', async () => {
    try {
      if (!fs.existsSync(logsDir)) return { success: true, count: 0 };
      const fileNames = fs.readdirSync(logsDir).filter((f) => f.endsWith('.csv'));
      let count = 0;
      for (const f of fileNames) {
        fs.unlinkSync(path.join(logsDir, f));
        count++;
      }
      return { success: true, count };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 16. App controls
  ipcMain.handle('app:close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });
}

