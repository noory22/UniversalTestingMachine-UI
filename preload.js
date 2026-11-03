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

  // Event Subscriptions
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
});
