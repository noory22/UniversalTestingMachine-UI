const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listPorts: () => ipcRenderer.invoke('com:list-ports'),
  connectPort: (port) => ipcRenderer.invoke('com:connect', port),
  disconnectPort: () => ipcRenderer.invoke('com:disconnect'),
  getConnectionStatus: () => ipcRenderer.invoke('com:get-status'),
  
  startProcess: () => ipcRenderer.invoke('utm:start-process'),
  stopProcess: () => ipcRenderer.invoke('utm:stop-process'),
  resetProcess: () => ipcRenderer.invoke('utm:reset-process'),
  activateTare: () => ipcRenderer.invoke('utm:activate-tare'),
  
  activateNormal: () => ipcRenderer.invoke('utm:activate-normal'),
  setCalibrateMode: (mode) => ipcRenderer.invoke('utm:set-calibrate-mode', mode),
  sendWeight: (value) => ipcRenderer.invoke('utm:send-weight', value),
  
  listCsvLogs: () => ipcRenderer.invoke('logs:list'),
  readCsvLog: (filename) => ipcRenderer.invoke('logs:read', filename),
  deleteCsvLog: (filename) => ipcRenderer.invoke('logs:delete', filename),
  deleteAllCsvLogs: () => ipcRenderer.invoke('logs:delete-all'),
  
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
  
  closeApp: () => ipcRenderer.invoke('app:close'),
});

