// tauri-bridge.js
// Adapts the Electron IPC bridge to Tauri v2 (Rust backend) while preserving
// the exact same window.api interface used by all React components.

function getTauri() {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    return window.__TAURI__;
  }
  return null;
}

function invoke(cmd, args = {}) {
  const tauri = getTauri();
  if (tauri && tauri.core && typeof tauri.core.invoke === 'function') {
    return tauri.core.invoke(cmd, args);
  }
  console.warn(`[Tauri Bridge] invoke called outside Tauri: ${cmd}`, args);
  return Promise.resolve({ success: false, message: 'Tauri runtime not detected' });
}

function listen(event, callback) {
  const tauri = getTauri();
  if (tauri && tauri.event && typeof tauri.event.listen === 'function') {
    let unlistenFn = null;
    tauri.event
      .listen(event, (evt) => {
        callback(evt.payload);
      })
      .then((unlisten) => {
        unlistenFn = unlisten;
      })
      .catch((err) => {
        console.error(`[Tauri Bridge] Failed to listen to ${event}:`, err);
      });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }
  return () => {};
}

// Check if running under Tauri or if window.api is missing
const isTauriEnv = typeof window !== 'undefined' && (Boolean(window.__TAURI__) || !window.api);

if (isTauriEnv && typeof window !== 'undefined') {
  const api = {
    // Connection & Port Management
    listPorts: () => invoke('com_list_ports'),
    connectPort: (port) => invoke('com_connect', { port }),
    disconnectPort: () => invoke('com_disconnect'),
    getConnectionStatus: () => invoke('com_get_status'),
    checkConnection: () => invoke('com_get_status'),
    reconnect: () => invoke('com_reconnect'),

    // Process Controls (UTM)
    enterProcessMode: () => invoke('utm_enter_process_mode'),
    leaveProcessMode: () => invoke('utm_leave_process_mode'),

    // Compression Test Controls
    enterCompressionMode: () => invoke('compression_enter'),
    leaveCompressionMode: () => invoke('compression_leave'),
    startCompressionTest: () => invoke('compression_start'),
    stopCompressionTest: () => invoke('compression_stop'),
    resetCompressionTest: () => invoke('compression_reset'),
    tareCompressionTest: () => invoke('compression_tare'),

    sendSpeed: (value) => invoke('utm_send_speed', { value }),
    sendForceDiff: (value) => invoke('utm_send_force_diff', { value }),
    startProcess: () => invoke('utm_start_process'),
    stopProcess: () => invoke('utm_stop_process'),
    resetProcess: () => invoke('utm_reset_process'),
    activateTare: () => invoke('utm_activate_tare'),

    // Settings & Calibration
    activateNormal: () => invoke('utm_activate_normal'),
    setCalibrateMode: (mode) => invoke('utm_set_calibrate_mode', { mode }),
    sendWeight: (value) => invoke('utm_send_weight', { value }),

    // Log Management
    listCsvLogs: () => invoke('logs_list'),
    getLogFiles: () => invoke('logs_list'),
    readCsvLog: (filename) => invoke('logs_read', { filename }),
    readLogFile: (filename) => invoke('logs_read', { filename }),
    deleteCsvLog: (filename) => invoke('logs_delete', { filename }),
    deleteLogFile: (filename) => invoke('logs_delete', { filename }),
    deleteAllCsvLogs: () => invoke('logs_delete_all'),
    downloadLogFile: (filename, savePath) => invoke('logs_download', { filename, savePath }),
    downloadLog: (filename, savePath) => invoke('logs_download', { filename, savePath }),
    exportCsvLog: (filename, savePath) => invoke('logs_download', { filename, savePath }),

    // Manual Mode Controls (UTM)
    manual: () => invoke('manual_activate'),
    activateManualMode: () => invoke('manual_activate'),
    disableManualMode: () => invoke('manual_disable'),
    motorUp: () => invoke('motor_up'),
    insertion: () => invoke('motor_up'),
    motorDown: () => invoke('motor_down'),
    ret: () => invoke('motor_down'),
    motorStop: () => invoke('motor_stop'),
    home: () => invoke('home'),
    homeManual: () => invoke('home'),
    readData: () => invoke('read_data'),
    checkPowerStatus: async () => {
      try {
        const status = await invoke('com_get_status');
        return { active: status && status.connected };
      } catch {
        return { active: false };
      }
    },

    // Event Subscriptions
    onTelemetry: (callback) => listen('utm:telemetry', callback),
    onConnectionStatus: (callback) => listen('com:connection-status', callback),
    onError: (callback) => listen('utm:error', callback),
    onProcessState: (callback) => listen('utm:process-state', callback),

    // App lifecycle
    closeApp: () => invoke('app_close'),

    // ============= CONFIGURATION FILE API =============
    readConfigFile: (testType = 'tensile') => invoke('read_config_file', { testType }),
    writeConfigFile: (arg1, arg2) => {
      if (Array.isArray(arg1)) {
        return invoke('write_config_file', { testType: 'tensile', configs: arg1, rawConfigs: arg1 });
      }
      return invoke('write_config_file', { testType: arg1, configs: arg2, rawConfigs: arg2 });
    },
    deleteConfigFile: (arg1, arg2) => {
      if (arg2 !== undefined) {
        return invoke('delete_config_file', { testType: arg1, configName: arg2, nameOnly: null });
      }
      return invoke('delete_config_file', { testType: 'tensile', configName: arg1, nameOnly: arg1 });
    },
    sendTensileConfig: (config) => invoke('send_tensile_config', { config }),
    sendCompressionConfig: (config) => invoke('send_compression_config', { config }),
    sendTcConfig: (config) => invoke('send_tc_config', { config }),
    sendProcessMode: (config) => invoke('send_process_mode', { config }),

    // ============= AUTO-UPDATE API =============
    checkForUpdates: () => invoke('check_for_updates'),
    downloadUpdate: () => invoke('download_update'),
    quitAndInstall: () => invoke('quit_and_install'),
    onUpdateAvailable: (callback) => listen('update-available', callback),
    onUpdateStatus: (callback) =>
      listen('update-status', (status) => {
        callback(status);
        window.dispatchEvent(
          new CustomEvent('update-status-change', {
            detail: status,
          })
        );
      }),
    onUpdateProgress: (callback) =>
      listen('update-progress', (progress) => {
        callback(progress);
        window.dispatchEvent(
          new CustomEvent('update-progress', {
            detail: progress,
          })
        );
      }),
  };

  window.api = api;
}

export default window.api;
