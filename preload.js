const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Connection & Port Management
  listPorts: () => ipcRenderer.invoke('com:list-ports'),
  connectPort: (port) => ipcRenderer.invoke('com:connect', port),
  disconnectPort: () => ipcRenderer.invoke('com:disconnect'),
  getConnectionStatus: () => ipcRenderer.invoke('com:get-status'),
  checkConnection: () => ipcRenderer.invoke('com:get-status'),
  reconnect: () => ipcRenderer.invoke('com:reconnect'),

  // Process Controls (UTM)
  enterProcessMode: () => ipcRenderer.invoke('utm:enter-process-mode'),
  leaveProcessMode: () => ipcRenderer.invoke('utm:leave-process-mode'),

  // Compression Test Controls
  enterCompressionMode: () => ipcRenderer.invoke('compression:enter'),
  leaveCompressionMode: () => ipcRenderer.invoke('compression:leave'),
  startCompressionTest: () => ipcRenderer.invoke('compression:start'),
  stopCompressionTest: () => ipcRenderer.invoke('compression:stop'),
  resetCompressionTest: () => ipcRenderer.invoke('compression:reset'),
  tareCompressionTest: () => ipcRenderer.invoke('compression:tare'),

  sendSpeed: (value) => ipcRenderer.invoke('utm:send-speed', value),
  sendForceDiff: (value) => ipcRenderer.invoke('utm:send-force-diff', value),
  startProcess: () => ipcRenderer.invoke('utm:start-process'),
  stopProcess: () => ipcRenderer.invoke('utm:stop-process'),
  resetProcess: () => ipcRenderer.invoke('utm:reset-process'),
  activateTare: () => ipcRenderer.invoke('utm:activate-tare'),

  // Settings & Calibration
  activateNormal: () => ipcRenderer.invoke('utm:activate-normal'),
  setCalibrateMode: (mode) => ipcRenderer.invoke('utm:set-calibrate-mode', mode),
  sendWeight: (value) => ipcRenderer.invoke('utm:send-weight', value),

  // Log Management
  listCsvLogs: () => ipcRenderer.invoke('logs:list'),
  getLogFiles: () => ipcRenderer.invoke('logs:list'),
  readCsvLog: (filename) => ipcRenderer.invoke('logs:read', filename),
  readLogFile: (filename) => ipcRenderer.invoke('logs:read', filename),
  deleteCsvLog: (filename) => ipcRenderer.invoke('logs:delete', filename),
  deleteLogFile: (filename) => ipcRenderer.invoke('logs:delete', filename),
  deleteAllCsvLogs: () => ipcRenderer.invoke('logs:delete-all'),
  downloadLogFile: (filename) => ipcRenderer.invoke('logs:download', filename),
  downloadLog: (filename) => ipcRenderer.invoke('logs:download', filename),
  exportCsvLog: (filename) => ipcRenderer.invoke('logs:download', filename),

  // Event Subscriptions
  // Manual Mode Controls (UTM)
  manual: () => ipcRenderer.invoke('manual'),
  activateManualMode: () => ipcRenderer.invoke('manual'),
  disableManualMode: () => ipcRenderer.invoke('disable-manual-mode'),
  motorUp: () => ipcRenderer.invoke('motor-up'),
  insertion: () => ipcRenderer.invoke('insertion'),
  motorDown: () => ipcRenderer.invoke('motor-down'),
  ret: () => ipcRenderer.invoke('ret'),
  motorStop: () => ipcRenderer.invoke('motor-stop'),
  home: () => ipcRenderer.invoke('home'),
  homeManual: () => ipcRenderer.invoke('home'),
  readData: () => ipcRenderer.invoke('read-data'),
  checkPowerStatus: async () => {
    try {
      const status = await ipcRenderer.invoke('com:get-status');
      return { active: status && status.connected };
    } catch {
      return { active: false };
    }
  },
  onTelemetry: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('utm:telemetry', subscription);
    return () => ipcRenderer.removeListener('utm:telemetry', subscription);
  },

  onConnectionStatus: (callback) => {
    const subscription = (_event, status) => callback(status);
    ipcRenderer.on('com:connection-status', subscription);
    return () => ipcRenderer.removeListener('com:connection-status', subscription);
  },

  onError: (callback) => {
    const subscription = (_event, error) => callback(error);
    ipcRenderer.on('utm:error', subscription);
    return () => ipcRenderer.removeListener('utm:error', subscription);
  },

  onProcessState: (callback) => {
    const subscription = (_event, state) => callback(state);
    ipcRenderer.on('utm:process-state', subscription);
    return () => ipcRenderer.removeListener('utm:process-state', subscription);
  },

  // App lifecycle
  closeApp: () => ipcRenderer.invoke('app:close'),

  // ============= AUTO-UPDATE API =============
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateAvailable: (callback) => {
    const subscription = (_event, info) => callback(info);
    ipcRenderer.on('update-available', subscription);
    return () => ipcRenderer.removeListener('update-available', subscription);
  },
  onUpdateStatus: (callback) => {
    const subscription = (_event, status) => callback(status);
    ipcRenderer.on('update-status', subscription);
    return () => ipcRenderer.removeListener('update-status', subscription);
  },
  onUpdateProgress: (callback) => {
    const subscription = (_event, progress) => callback(progress);
    ipcRenderer.on('update-progress', subscription);
    return () => ipcRenderer.removeListener('update-progress', subscription);
  },
});

// Listen for update status updates
ipcRenderer.on('update-status', (event, status) => {
  window.dispatchEvent(new CustomEvent('update-status-change', {
    detail: status
  }));
});

// Listen for update progress updates
ipcRenderer.on('update-progress', (event, progress) => {
  window.dispatchEvent(new CustomEvent('update-progress', {
    detail: progress
  }));
});
