const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ModbusRTU = require('modbus-serial');
const { SerialPort } = require('serialport');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Prevent garbage collection of main window
let mainWindow = null;

// Modbus & Hardware state
let modbusClient = null;
let currentPort = null;
let isConnected = false;
let isLoopRunning = false;
let consecutiveErrors = 0;

let regZValue = 0;
let processRunning = false;
let tearActive = false;
let tearTimer = null;
let normalTimer = null;
let tareTimer = null;

// Cache of last good reads
let lastDistance = 0;
let lastForce = 0.0;
let lastR100 = 0;
let lastR101 = 0;

// Manual Mode Coils, Registers & State (UTM)
const COIL_MANUAL = 2010;        // M10: Manual Mode master
const COIL_MOTOR_UP = 2011;      // M11: Motor Up
const COIL_MOTOR_DOWN = 2012;    // M12: Motor Down
const COIL_HOMING = 2013;        // M13: Homing
const REG_MANUAL_DISTANCE = 6002; // D2: Distance (Fatek offset 6000 + 2)
const REG_FORCE = 154;            // R154 (+ R155): Force (32-bit Float LE, used across all modes)
const REG_MANUAL_FORCE = 154;     // Backwards-compatibility alias
const INPUT_X1 = 1001;           // X1: Homing / Lower limit switch (Fatek offset 1000 + 1)

let manualModeActive = false;
let motorUpState = false;
let motorDownState = false;
let homingState = false;
let lastManualDistance = 0;
let lastManualForce = 0;
let lastX1 = false;

// Synchronized Command Queue (Eliminates half-duplex serial collisions)
const commandQueue = [];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeExecute(commandName, action) {
  return new Promise((resolve, reject) => {
    if (!isConnected || !modbusClient || !modbusClient.isOpen) {
      return resolve({ success: false, message: 'Not connected to PLC' });
    }
    commandQueue.push({
      commandName,
      task: async () => {
        try {
          const res = await action();
          return { success: true, ...res };
        } catch (err) {
          throw err;
        }
      },
      resolve,
      reject,
    });
  });
}

// =========================================================================
// CSV Logging State - Stored in User Documents/UTM Logs (matching CTTM-VD & FTM-Web)
// =========================================================================
let logsDir = '';

function initLogsDirectory() {
  try {
    logsDir = path.join(app.getPath('documents'), 'UTM Logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log(`📁 Created UTM Logs folder at: ${logsDir}`);
    }

    // Auto-migrate any legacy logs from the project folder
    const legacyLogsDir = path.join(process.cwd(), 'logs');
    if (fs.existsSync(legacyLogsDir) && legacyLogsDir !== logsDir) {
      const files = fs.readdirSync(legacyLogsDir).filter((f) => f.endsWith('.csv'));
      for (const file of files) {
        const src = path.join(legacyLogsDir, file);
        const dest = path.join(logsDir, file);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          console.log(`📋 Migrated log to Documents/UTM Logs: ${file}`);
        }
      }
    }
  } catch (err) {
    console.error('Error initializing UTM Logs directory:', err);
    // Fallback to local logs if documents folder fails
    logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  }
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

// =========================================================================
// Single Continuous Modbus Coordinator Loop (Matching Python Architecture)
// =========================================================================
async function processModbusLoop() {
  if (isLoopRunning) return;
  isLoopRunning = true;

  while (true) {
    // 0. Check unexpected port closure
    if (isConnected && (!modbusClient || !modbusClient.isOpen)) {
      console.warn('⚠️ Port closed unexpectedly.');
      isConnected = false;
      consecutiveErrors = 0;
      sendConnectionStatus(false, 'Disconnected');
    }

    // 1. Idle wait if disconnected
    if (!isConnected || !modbusClient || !modbusClient.isOpen) {
      await delay(500);
      continue;
    }

    try {
      // 2. Process High Priority Commands FIRST (Writes, Modes, Start/Stop/Reset/Tare)
      if (commandQueue.length > 0) {
        const cmd = commandQueue.shift();
        try {
          const result = await cmd.task();
          cmd.resolve(result);
        } catch (e) {
          console.error(`❌ Command ${cmd.commandName} failed:`, e.message);
          cmd.reject(e);
        }
        await delay(30); // 30ms inter-frame silence
        continue;
      }

      // 3. Telemetry Read Cycle (Sequential, matching Python main.py)
      let cycleSuccess = false;

      // 3a. Read REG_Z (R5)
      try {
        const respZ = await modbusClient.readHoldingRegisters(5, 1);
        if (respZ && respZ.data && respZ.data.length > 0) {
          const newZ = respZ.data[0];
          if (newZ !== regZValue) {
            regZValue = newZ;
            sendProcessState();
          }
          cycleSuccess = true;
        }
      } catch (e) {
        // Individual catch prevents timeout cascade
      }

      await delay(20); // 20ms inter-frame gap

      // 3b. Read Distance REG_X (R10)
      let distance = lastDistance;
      try {
        const respX = await modbusClient.readHoldingRegisters(10, 1);
        if (respX && respX.data && respX.data.length > 0) {
          distance = respX.data[0];
          lastDistance = distance;
          cycleSuccess = true;
        }
      } catch (e) {}

      await delay(20);

      // 3c. Read Force: R154 + R155 (32-bit float LE, unified for all modes)
      let force = lastForce;
      try {
        const respForce = await modbusClient.readHoldingRegisters(REG_FORCE, 2);
        if (respForce && respForce.data && respForce.data.length >= 2) {
          const r154 = respForce.data[0]; // low word
          const r155 = respForce.data[1]; // high word
          const buf = Buffer.alloc(4);
          buf.writeUInt16LE(r154, 0);
          buf.writeUInt16LE(r155, 2);
          const f = buf.readFloatLE(0);
          if (!isNaN(f)) {
            force = f;
            lastForce = force;
            lastManualForce = force;
            cycleSuccess = true;
          }
        }
      } catch (e) {}

      await delay(20);

      // 3d. Read Settings Registers: R100 (REG_F) & R101 (REG_G)
      let r100 = lastR100;
      let r101 = lastR101;
      try {
        const respSettings = await modbusClient.readHoldingRegisters(100, 2);
        if (respSettings && respSettings.data && respSettings.data.length >= 2) {
          let raw100 = respSettings.data[0];
          let raw101 = respSettings.data[1];
          r100 = raw100 > 32767 ? raw100 - 65536 : raw100;
          r101 = raw101 > 32767 ? raw101 - 65536 : raw101;
          lastR100 = r100;
          lastR101 = r101;
          cycleSuccess = true;
        }
      } catch (e) {}

      await delay(20);

      // 3e. Read Manual Distance: D2 (6002)
      let manualDistance = lastManualDistance;
      try {
        const respD2 = await modbusClient.readHoldingRegisters(REG_MANUAL_DISTANCE, 1);
        if (respD2 && respD2.data && respD2.data.length > 0) {
          const rawD2 = respD2.data[0];
          manualDistance = rawD2 > 32767 ? rawD2 - 65536 : rawD2;
          lastManualDistance = manualDistance;
          cycleSuccess = true;
        }
      } catch (e) {}

      // 3f. Manual force is unified with R154 32-bit float
      let manualForce = force;

      await delay(20);

      // 3g. Read X1 Discrete Input: Homing / Lower Limit Sensor (Fatek 1001)
      let x1 = lastX1;
      try {
        const respX1 = await modbusClient.readDiscreteInputs(INPUT_X1, 1);
        if (respX1 && respX1.data && respX1.data.length > 0) {
          x1 = Boolean(respX1.data[0]);
          lastX1 = x1;
          cycleSuccess = true;
        }
      } catch (e) {
        try {
          const respCoil = await modbusClient.readCoils(INPUT_X1, 1);
          if (respCoil && respCoil.data && respCoil.data.length > 0) {
            x1 = Boolean(respCoil.data[0]);
            lastX1 = x1;
            cycleSuccess = true;
          }
        } catch (e2) {}
      }

      // Safety Guard: If machine reaches X1 home limit while moving down, halt Motor Down (M12)
      if (x1 && motorDownState) {
        console.warn('⚠️ X1 limit switch active while moving Down! Automatically halting Motor Down (M12).');
        motorDownState = false;
        try {
          await modbusClient.writeCoil(2012, false);
        } catch (e) {}
      }

      // Homing Completion Guard: If X1 limit reached, homing sequence is finished
      if (x1 && homingState) {
        console.log('✅ Homing completed (X1 active). Deactivating homing coil M13 and clearing homingState.');
        homingState = false;
        try {
          await modbusClient.writeCoil(2013, false);
        } catch (e) {}
      }

      // Connection health check
      if (cycleSuccess) {
        consecutiveErrors = 0;
      } else {
        consecutiveErrors++;
        if (consecutiveErrors >= 6) {
          console.warn('⚠️ 6 consecutive Modbus read cycles failed. Disconnecting...');
          await disconnectModbus();
          consecutiveErrors = 0;
          continue;
        }
      }

      // Broadcast telemetry to UI
      sendTelemetry({
        distance,
        force,
        r100,
        r101,
        regZ: regZValue,
        processRunning,
        tearActive,
        manualDistance,
        manualForce,
        manualModeActive,
        motorUp: motorUpState,
        motorDown: motorDownState,
        homing: homingState && !lastX1,
        x1: lastX1,
        atHome: lastX1,
      });

      // Record CSV row if process is active and tare is not running
      if (processRunning && !tearActive && activeCsvStream) {
        const ts = formatTimestamp();
        const forceN = (force / 1000.0).toFixed(6);
        const row = `${ts},${distance},${force.toFixed(3)},${forceN}\n`;
        activeCsvStream.write(row);
        forceAccumulator.push(force);
      }
    } catch (err) {
      console.error('Modbus coordinator error:', err.message);
      await delay(200);
      continue;
    }

    // 500ms cycle interval matching Python update_interval = 500
    await delay(500);
  }
}

// Disconnect helper
async function disconnectModbus() {
  manualModeActive = false;
  motorUpState = false;
  motorDownState = false;
  homingState = false;
  lastForce = 0.0;
  lastManualForce = 0.0;
  lastX1 = false;
  commandQueue.length = 0;

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
      console.error('Error closing modbus client:', e);
    }
    modbusClient = null;
  }

  isConnected = false;
  currentPort = null;
  consecutiveErrors = 0;
  sendConnectionStatus(false, 'Disconnected');
}

// Connect helper
async function connectPortInternal(portName) {
  if (!portName) return { success: false, message: 'No COM port specified' };
  
  await disconnectModbus();

  try {
    modbusClient = new ModbusRTU();
    modbusClient.setTimeout(1000); // 1000ms timeout matching Python TIMEOUT = 1

    modbusClient.on('error', (err) => {
      console.warn('⚠️ Modbus background client warning:', err?.message || err);
    });

    await modbusClient.connectRTUBuffered(portName, {
      baudRate: 9600,
      dataBits: 8,
      parity: 'even', // Even parity matching Python parity='E'
      stopBits: 1,
    });

    modbusClient.setID(1);

    // Initial read to verify device communication before reporting connected
    try {
      const resp = await modbusClient.readHoldingRegisters(5, 1);
      if (resp && resp.data && resp.data.length > 0) {
        regZValue = resp.data[0];
      }
    } catch (e) {
      console.warn('Initial register check warning:', e.message);
    }

    isConnected = true;
    currentPort = portName;
    consecutiveErrors = 0;

    sendConnectionStatus(true, `Connected to ${portName}`);
    processModbusLoop(); // Ensure polling loop is active

    return { success: true, message: `Connected to ${portName}` };
  } catch (err) {
    isConnected = false;
    currentPort = null;
    if (modbusClient) {
      try { await modbusClient.close(); } catch (e) {}
      modbusClient = null;
    }
    sendConnectionStatus(false, `Failed to connect: ${err.message}`);
    return { success: false, message: err.message };
  }
}

async function autoConnectPort() {
  try {
    const rawPorts = await SerialPort.list();
    if (!rawPorts || rawPorts.length === 0) return { success: false, message: 'No COM ports found' };

    const converterPort = rawPorts.find((p) => {
      const desc = `${p.friendlyName || ''} ${p.manufacturer || ''}`.toLowerCase();
      return desc.includes('converter') || desc.includes('ch340') || desc.includes('ftdi') || desc.includes('cp210');
    }) || rawPorts[0];

    if (converterPort && converterPort.path) {
      console.log(`Auto-connecting to ${converterPort.path}...`);
      return await connectPortInternal(converterPort.path);
    }
    return { success: false, message: 'No suitable COM port found' };
  } catch (err) {
    console.error('Auto-connect error:', err);
    return { success: false, message: err.message };
  }
}

// CSV test logging helpers
function startProcessLogging() {
  try {
    if (!logsDir) initLogsDirectory();

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `process_data_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
    activeCsvPath = path.join(logsDir, filename);
    forceAccumulator = [];

    activeCsvStream = fs.createWriteStream(activeCsvPath, { flags: 'w' });
    activeCsvStream.write('Timestamp,Distance(mm),Force(mN),Force(N)\n');
    console.log(`[CSV] Started logging to ${activeCsvPath}`);
    return { success: true, filename };
  } catch (err) {
    console.error('[CSV] Failed to start log file:', err);
    return { success: false, error: err.message };
  }
}

async function stopProcessLogging() {
  if (activeCsvStream) {
    if (forceAccumulator.length > 0) {
      const avg = forceAccumulator.reduce((a, b) => a + b, 0) / forceAccumulator.length;
      activeCsvStream.write(`\nAverage Force,,${avg.toFixed(3)},${(avg / 1000.0).toFixed(6)}\n`);
    }
    await new Promise((resolve) => activeCsvStream.end(resolve));
    console.log(`[CSV] Closed ${activeCsvPath}`);
    activeCsvStream = null;
    activeCsvPath = null;
    forceAccumulator = [];
  }
}

function createWindow() {
  const preloadPath = isDev
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, '.vite/build/preload/preload.js');

  const iconPath = path.join(__dirname, 'assets/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 650,
    title: 'Universal Testing Machine',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.setMenu(null);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer] Failed to load: ${errorDescription} (code ${errorCode}) URL: ${validatedURL}`);
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    const prodHtml = path.join(__dirname, '.vite/build/renderer/main_window/index.html');
    mainWindow.loadFile(prodHtml);
  }

  mainWindow.on('ready-to-show', () => {
    setTimeout(() => {
      autoConnectPort();
    }, 1500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  initLogsDirectory();
  setupIpcHandlers();
  createWindow();
  processModbusLoop(); // Start coordinator loop

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

// Setup IPC handlers
function setupIpcHandlers() {
  // 1. List Ports
  ipcMain.handle('com:list-ports', async () => {
    try {
      const rawPorts = await SerialPort.list();
      const availablePorts = rawPorts.map((p) => {
        const desc = `${p.friendlyName || ''} ${p.manufacturer || ''}`.toLowerCase();
        const isConverter =
          desc.includes('converter') ||
          desc.includes('ch340') ||
          desc.includes('ftdi') ||
          desc.includes('cp210') ||
          desc.includes('usb-serial');
        return {
          device: p.path,
          description: p.friendlyName || p.manufacturer || p.path,
          isConverter,
        };
      });

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
    return await connectPortInternal(portName);
  });

  // 3. Disconnect
  ipcMain.handle('com:disconnect', async () => {
    await disconnectModbus();
    return { success: true, message: 'Disconnected' };
  });

  // 4. Reconnect
  ipcMain.handle('com:reconnect', async () => {
    if (currentPort) {
      return await connectPortInternal(currentPort);
    }
    return await autoConnectPort();
  });

  // 5. Connection Status
  ipcMain.handle('com:get-status', () => {
    return {
      connected: isConnected,
      port: currentPort,
      regZ: regZValue,
      processRunning,
      tearActive,
    };
  });

  // 6. Start Process (M3 = 2003) - Queued & Sequential
  ipcMain.handle('utm:start-process', async () => {
    if (!isConnected || !modbusClient || !modbusClient.isOpen) {
      return { success: false, message: 'Not connected to PLC!' };
    }
    if (regZValue !== 1) {
      return { success: false, message: 'Cannot start process: REG_Z is not 1!' };
    }

    const logResult = startProcessLogging();
    if (!logResult.success) {
      return { success: false, message: logResult.error };
    }

    return await safeExecute('start-process', async () => {
      // Reset cached distance and force on start so old test values don't leak
      lastDistance = 0;
      lastForce = 0.0;

      // Sequential coil writes with 25ms inter-frame gap matching Python main.py
      await modbusClient.writeCoil(2003, true);   // COIL_START (M3)
      await delay(25);
      await modbusClient.writeCoil(2004, false);  // COIL_RESET (M4)
      await delay(25);
      await modbusClient.writeCoil(2006, false);  // COIL_STOP (M6)
      await delay(25);
      await modbusClient.writeCoil(2007, false);  // COIL_TEAR (M7)
      await delay(25);

      processRunning = true;
      tearActive = false;
      sendProcessState();

      // Broadcast clean initial telemetry
      sendTelemetry({
        distance: 0,
        force: 0.0,
        r100: lastR100,
        r101: lastR101,
        regZ: regZValue,
        processRunning: true,
        tearActive: false,
      });

      return { filename: logResult.filename };
    });
  });

  // 7. Stop Process (M6 = 2006) - Queued & Sequential
  ipcMain.handle('utm:stop-process', async () => {
    if (!isConnected || !modbusClient || !modbusClient.isOpen) {
      processRunning = false;
      await stopProcessLogging();
      sendProcessState();
      return { success: true };
    }

    return await safeExecute('stop-process', async () => {
      await modbusClient.writeCoil(2006, true);   // COIL_STOP (M6)
      await delay(25);
      await modbusClient.writeCoil(2003, false);  // COIL_START (M3)
      await delay(25);
      await modbusClient.writeCoil(2004, false);  // COIL_RESET (M4)
      await delay(25);
      await modbusClient.writeCoil(2007, false);  // COIL_TEAR (M7)
      await delay(25);

      processRunning = false;
      await stopProcessLogging();
      sendProcessState();

      return {};
    });
  });

  // 8. Reset Process (M4 = 2004) - Queued & Sequential
  ipcMain.handle('utm:reset-process', async () => {
    if (processRunning) {
      processRunning = false;
      await stopProcessLogging();
    }

    // Immediately reset distance and force caches and notify UI
    lastDistance = 0;
    lastForce = 0.0;
    sendProcessState();
    sendTelemetry({
      distance: 0,
      force: 0.0,
      r100: lastR100,
      r101: lastR101,
      regZ: regZValue,
      processRunning: false,
      tearActive: false,
    });

    if (!isConnected || !modbusClient || !modbusClient.isOpen) {
      return { success: true };
    }

    return await safeExecute('reset-process', async () => {
      await modbusClient.writeCoil(2004, true);   // COIL_RESET (M4)
      await delay(25);
      await modbusClient.writeCoil(2006, false);  // COIL_STOP (M6)
      await delay(25);
      await modbusClient.writeCoil(2003, false);  // COIL_START (M3)
      await delay(25);
      await modbusClient.writeCoil(2007, false);  // COIL_TEAR (M7)
      await delay(25);

      // Attempt to zero distance register R10 directly in PLC if writable
      try {
        await modbusClient.writeRegister(10, 0);
      } catch (e) {
        // Silently continue if R10 is read-only in PLC ladder logic
      }

      lastDistance = 0;
      lastForce = 0.0;
      sendProcessState();
      sendTelemetry({
        distance: 0,
        force: 0.0,
        r100: lastR100,
        r101: lastR101,
        regZ: regZValue,
        processRunning: false,
        tearActive: false,
      });

      return {};
    });
  });

  // 9. Tare (M7 = 2007) - 1 second timed pulse, Queued
  ipcMain.handle('utm:activate-tare', async () => {
    if (!isConnected || !modbusClient || !modbusClient.isOpen) {
      return { success: false, message: 'Not connected to PLC!' };
    }
    if (tearActive) {
      return { success: false, message: 'Tare is already active' };
    }

    return await safeExecute('activate-tare', async () => {
      await modbusClient.writeCoil(2007, true);   // COIL_TEAR (M7)
      await delay(25);
      await modbusClient.writeCoil(2003, false);  // COIL_START (M3)
      await delay(25);
      await modbusClient.writeCoil(2006, false);  // COIL_STOP (M6)
      await delay(25);
      await modbusClient.writeCoil(2004, false);  // COIL_RESET (M4)
      await delay(25);

      tearActive = true;
      processRunning = false;
      sendProcessState();

      if (tearTimer) clearTimeout(tearTimer);
      tearTimer = setTimeout(async () => {
        safeExecute('deactivate-tare', async () => {
          try {
            if (modbusClient && isConnected && modbusClient.isOpen) {
              await modbusClient.writeCoil(2007, false);
            }
          } catch (e) {
            console.error('Error turning off tare coil:', e);
          } finally {
            tearActive = false;
            sendProcessState();
          }
          return {};
        });
      }, 1000);

      return {};
    });
  });

  // 10. Activate Normal Mode (M100 = 2100) - 1 second timed pulse, Queued
  ipcMain.handle('utm:activate-normal', async () => {
    if (!isConnected || !modbusClient || !modbusClient.isOpen) {
      return { success: false, message: 'Not connected to PLC!' };
    }

    return await safeExecute('activate-normal', async () => {
      await modbusClient.writeCoil(2100, true);
      await delay(25);

      if (normalTimer) clearTimeout(normalTimer);
      normalTimer = setTimeout(() => {
        safeExecute('deactivate-normal', async () => {
          try {
            if (modbusClient && isConnected && modbusClient.isOpen) {
              await modbusClient.writeCoil(2100, false);
            }
          } catch (e) {}
          return {};
        });
      }, 1000);

      return {};
    });
  });

  // 11. Set Calibrate Mode (tare: M101=2101, calibrate: M102=2102) - Queued
  ipcMain.handle('utm:set-calibrate-mode', async (_event, mode) => {
    if (!isConnected || !modbusClient || !modbusClient.isOpen) {
      return { success: false, message: 'Not connected to PLC!' };
    }

    return await safeExecute(`set-calibrate-mode-${mode}`, async () => {
      if (mode === 'tare') {
        await modbusClient.writeCoil(2101, true);
        await delay(25);

        if (tareTimer) clearTimeout(tareTimer);
        tareTimer = setTimeout(() => {
          safeExecute('deactivate-tare-s', async () => {
            try {
              if (modbusClient && isConnected && modbusClient.isOpen) {
                await modbusClient.writeCoil(2101, false);
              }
            } catch (e) {}
            return {};
          });
        }, 1000);
      } else if (mode === 'calibrate') {
        await modbusClient.writeCoil(2102, true);
        await delay(25);
      }
      return {};
    });
  });

  // 12. Send Weight Parameter (R102) - Queued
  ipcMain.handle('utm:send-weight', async (_event, value) => {
    if (!isConnected || !modbusClient || !modbusClient.isOpen) {
      return { success: false, message: 'Not connected to PLC or error writing register.' };
    }

    const intVal = parseInt(value, 10);
    if (isNaN(intVal) || intVal < 0 || intVal > 1000) {
      return { success: false, message: 'Weight parameter must be between 0 and 1000.' };
    }

    return await safeExecute('send-weight', async () => {
      await modbusClient.writeRegister(102, intVal);
      await delay(25);
      return { message: `Weight parameter ${intVal} sent to register R102!` };
    });
  });

  // 13. List CSV Logs from Documents/UTM Logs
  ipcMain.handle('logs:list', async () => {
    try {
      if (!logsDir) initLogsDirectory();
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

      fileList.sort((a, b) => b.mtime - a.mtime);
      return { success: true, files: fileList };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  });

  // 14. Read CSV Log & parse points
  ipcMain.handle('logs:read', async (_event, filename) => {
    try {
      if (!logsDir) initLogsDirectory();
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

  // 15. Delete single CSV Log
  ipcMain.handle('logs:delete', async (_event, filename) => {
    try {
      if (!logsDir) initLogsDirectory();
      const fullPath = path.isAbsolute(filename) ? filename : path.join(logsDir, filename);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 16. Delete all CSV Logs
  ipcMain.handle('logs:delete-all', async () => {
    try {
      if (!logsDir) initLogsDirectory();
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

  // 17. Download / Export Log File
  ipcMain.handle('logs:download', async (_event, filename) => {
    try {
      if (!logsDir) initLogsDirectory();
      const fullPath = path.isAbsolute(filename) ? filename : path.join(logsDir, filename);
      if (!fs.existsSync(fullPath)) {
        return { success: false, message: 'File not found on disk' };
      }

      const defaultFileName = path.basename(fullPath);
      const defaultSavePath = path.join(app.getPath('downloads'), defaultFileName);

      const { canceled, filePath: savePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Download UTM Process Log CSV',
        defaultPath: defaultSavePath,
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (canceled || !savePath) {
        return { success: false, canceled: true };
      }

      fs.copyFileSync(fullPath, savePath);
      console.log(`📥 Downloaded ${fullPath} to ${savePath}`);
      return { success: true, savePath, filename: defaultFileName };
    } catch (err) {
      console.error('Error downloading log file:', err);
      return { success: false, message: err.message };
    }
  });

  // 18. Manual Mode (M10 = 2010)
  const handleManualActivate = async () => {
    return await safeExecute('manual-mode', async () => {
      manualModeActive = true;
      motorUpState = false;
      motorDownState = false;
      homingState = false;

      await modbusClient.writeCoil(2010, true);  // M10: Manual Mode master
      await delay(25);
      await modbusClient.writeCoil(2011, false); // M11: Motor Up
      await delay(25);
      await modbusClient.writeCoil(2012, false); // M12: Motor Down
      await delay(25);
      await modbusClient.writeCoil(2013, false); // M13: Homing
      await delay(25);

      return { success: true, manualModeActivated: true, manualModeActive: true };
    });
  };
  ipcMain.handle('manual', handleManualActivate);
  ipcMain.handle('utm:manual-mode', handleManualActivate);

  // 19. Motor Up (M11 = 2011) - Toggle with mutual exclusivity
  const handleMotorUp = async () => {
    return await safeExecute('motor-up', async () => {
      motorUpState = !motorUpState;
      if (motorUpState) {
        motorDownState = false; // Mutual exclusivity: starting Up stops Down
      }

      await modbusClient.writeCoil(2010, true);  // Ensure M10 is ON
      await delay(25);
      await modbusClient.writeCoil(2012, false); // Turn OFF Down (M12)
      await delay(25);
      await modbusClient.writeCoil(2011, motorUpState); // Set Up (M11)
      await delay(25);

      return {
        success: true,
        motorUpState: motorUpState ? 'ON' : 'OFF',
        motorUp: motorUpState,
        insertion: motorUpState,
        message: `Motor Up turned ${motorUpState ? 'ON' : 'OFF'}`,
      };
    });
  };
  ipcMain.handle('motor-up', handleMotorUp);
  ipcMain.handle('insertion', handleMotorUp);
  ipcMain.handle('utm:motor-up', handleMotorUp);

  // 20. Motor Down (M12 = 2012) - Toggle with mutual exclusivity
  const handleMotorDown = async () => {
    // Safety check: Machine is at Home (X1 active) -> Downward movement prohibited
    if (lastX1) {
      if (motorDownState) {
        motorDownState = false;
        await safeExecute('stop-down-on-x1', async () => {
          await modbusClient.writeCoil(2012, false);
        });
      }
      return {
        success: false,
        message: 'Cannot move down: Machine is already at the Home limit (X1 active). Only upward movement is permitted.',
      };
    }

    return await safeExecute('motor-down', async () => {
      motorDownState = !motorDownState;
      if (motorDownState) {
        motorUpState = false; // Mutual exclusivity: starting Down stops Up
      }

      await modbusClient.writeCoil(2010, true);  // Ensure M10 is ON
      await delay(25);
      await modbusClient.writeCoil(2011, false); // Turn OFF Up (M11)
      await delay(25);
      await modbusClient.writeCoil(2012, motorDownState); // Set Down (M12)
      await delay(25);

      return {
        success: true,
        motorDownState: motorDownState ? 'ON' : 'OFF',
        motorDown: motorDownState,
        retraction: motorDownState,
        message: `Motor Down turned ${motorDownState ? 'ON' : 'OFF'}`,
      };
    });
  };
  ipcMain.handle('motor-down', handleMotorDown);
  ipcMain.handle('ret', handleMotorDown);
  ipcMain.handle('utm:motor-down', handleMotorDown);

  // 21. Motor Stop (Both M11 and M12 OFF)
  const handleMotorStop = async () => {
    return await safeExecute('motor-stop', async () => {
      motorUpState = false;
      motorDownState = false;

      await modbusClient.writeCoil(2011, false);
      await delay(25);
      await modbusClient.writeCoil(2012, false);
      await delay(25);

      return { success: true, motorUp: false, motorDown: false };
    });
  };
  ipcMain.handle('motor-stop', handleMotorStop);
  ipcMain.handle('utm:motor-stop', handleMotorStop);

  // 22. Homing (M13 = 2013)
  const handleHoming = async () => {
    // Safety check: Machine already at Home (X1 active) -> Homing not needed
    if (lastX1) {
      return {
        success: false,
        message: 'Machine is already at the Homing position (X1 active).',
      };
    }

    return await safeExecute('home', async () => {
      motorUpState = false;
      motorDownState = false;
      homingState = true;

      // Stop any active movement before homing
      await modbusClient.writeCoil(2011, false);
      await delay(25);
      await modbusClient.writeCoil(2012, false);
      await delay(25);
      // Turn ON homing coil M13
      await modbusClient.writeCoil(2013, true);
      await delay(25);

      return { success: true, homing: true };
    });
  };
  ipcMain.handle('home', handleHoming);
  ipcMain.handle('utm:home', handleHoming);

  // 23. Disable Manual Mode (M10, M11, M12, M13 = false)
  const handleDisableManual = async () => {
    return await safeExecute('disable-manual-mode', async () => {
      manualModeActive = false;
      motorUpState = false;
      motorDownState = false;
      homingState = false;

      await modbusClient.writeCoil(2010, false); // M10 = false
      await delay(25);
      await modbusClient.writeCoil(2011, false); // M11 = false
      await delay(25);
      await modbusClient.writeCoil(2012, false); // M12 = false
      await delay(25);
      await modbusClient.writeCoil(2013, false); // M13 = false
      await delay(25);

      return { success: true, manualModeDisabled: true, manualModeActive: false };
    });
  };
  ipcMain.handle('disable-manual-mode', handleDisableManual);
  ipcMain.handle('utm:disable-manual-mode', handleDisableManual);

  // 24. Read PLC Data (for compatibility with CTTM-VD polling pattern)
  ipcMain.handle('read-data', async () => {
    return {
      success: true,
      connected: isConnected,
      distance: lastManualDistance,
      manualDistance: lastManualDistance,
      force: lastForce,
      force_mN: lastForce,
      manualForce: lastForce,
      motorUp: motorUpState,
      motorDown: motorDownState,
      insertion: motorUpState,
      retraction: motorDownState,
      homing: homingState && !lastX1,
      manualMode: manualModeActive,
      x1: lastX1,
      atHome: lastX1,
    };
  });

  // 25. App controls
  ipcMain.handle('app:close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });
}
