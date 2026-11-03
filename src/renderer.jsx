import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import MainMenu from './MainMenu';
import ProcessMode from './ProcessMode';
import ProcessLogs from './ProcessLogs';
import SettingsScreen from './SettingsScreen';
import { ArrowLeft, RefreshCw, AlertTriangle, X } from 'lucide-react';
import backIcon from './assets/rsc3.png';

export function App() {
  const [currentScreen, setCurrentScreen] = useState('main'); // 'main' | 'process' | 'logs' | 'settings'
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    message: 'Status: Not Connected',
    port: null,
  });
  const [processState, setProcessState] = useState({
    processRunning: false,
    tearActive: false,
    regZ: 0,
  });
  const [telemetry, setTelemetry] = useState({
    distance: 0,
    force: 0,
    r100: 0,
    r101: 0,
    regZ: 0,
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [exitDialog, setExitDialog] = useState(false);

  // Load available COM ports
  const fetchPorts = async () => {
    try {
      const res = await window.api.listPorts();
      if (res.success) {
        setPorts(res.ports);
        if (res.ports.length > 0) {
          // Auto-select best port (USB converter) or first
          const best = res.ports.find((p) => p.isConverter);
          setSelectedPort((prev) => (prev && res.ports.some((p) => p.device === prev) ? prev : best ? best.device : res.ports[0].device));
        } else {
          setSelectedPort('');
        }
      }
    } catch (e) {
      console.error('Error listing ports:', e);
    }
  };

  useEffect(() => {
    fetchPorts();

    // Listeners
    const unsubTelemetry = window.api.onTelemetry((data) => {
      setTelemetry(data);
      if (data.regZ !== undefined) {
        setProcessState((prev) => ({ ...prev, regZ: data.regZ }));
      }
    });

    const unsubConnection = window.api.onConnectionStatus((status) => {
      setConnectionStatus({
        connected: status.connected,
        message: status.connected ? 'Status: Connected' : `Status: ${status.message || 'Not Connected'}`,
        port: status.port,
      });
      if (!status.connected) {
        setProcessState((prev) => ({ ...prev, processRunning: false, tearActive: false }));
      }
    });

    const unsubProcess = window.api.onProcessState((state) => {
      setProcessState(state);
    });

    const unsubError = window.api.onError((err) => {
      setErrorMessage(err);
    });

    return () => {
      unsubTelemetry();
      unsubConnection();
      unsubProcess();
      unsubError();
    };
  }, []);

  const handleToggleConnection = async () => {
    if (connectionStatus.connected) {
      setConnecting(true);
      try {
        await window.api.disconnectPort();
      } finally {
        setConnecting(false);
      }
    } else {
      if (!selectedPort) {
        setErrorMessage('Please select a COM port first!');
        return;
      }
      setConnecting(true);
      setConnectionStatus((prev) => ({
        ...prev,
        message: `Status: Connecting to ${selectedPort}...`,
      }));
      try {
        const res = await window.api.connectPort(selectedPort);
        if (!res.success) {
          setErrorMessage(res.message || 'Connection failed');
        }
      } catch (e) {
        setErrorMessage(e.message);
      } finally {
        setConnecting(false);
      }
    }
  };

  const handleBack = async () => {
    if (currentScreen === 'process') {
      // If leaving process screen, stop process and tear if active
      if (processState.processRunning) {
        await window.api.stopProcess();
      }
      setCurrentScreen('main');
    } else if (currentScreen === 'logs' || currentScreen === 'settings') {
      setCurrentScreen('main');
    } else {
      // If already on main menu, show exit prompt
      setExitDialog(true);
    }
  };

  const screenTitle = {
    main: 'Main Menu',
    process: 'Process Mode',
    logs: 'Process Logs',
    settings: 'Settings',
  }[currentScreen];

  return (
    <div className="flex flex-col h-screen w-screen bg-[#E9EEF1] text-slate-800 font-sf overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-[70px] bg-white border-b border-slate-200/90 px-6 flex items-center justify-between shadow-2xs z-20 shrink-0">
        {/* Left: Back Button & Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-lg hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center p-1.5"
            title={currentScreen === 'main' ? 'Exit Application' : 'Back to Main Menu'}
          >
            {backIcon ? (
              <img src={backIcon} alt="Back" className="w-7 h-7 object-contain" />
            ) : (
              <ArrowLeft className="w-6 h-6 text-[#308DC2]" />
            )}
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-[#2F2F2F] tracking-tight">{screenTitle}</h1>
          </div>
        </div>

        {/* Center: Error/Alert Banner */}
        {errorMessage && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg max-w-md truncate">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="truncate">{errorMessage}</span>
            <button
              onClick={() => setErrorMessage('')}
              className="ml-auto hover:text-red-900"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right: COM Port UI Controls (Top right corner as in Python UTM) */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700">Select COM Port:</label>
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              disabled={connectionStatus.connected || ports.length === 0}
              className="h-8 px-2 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-hidden focus:border-[#3B82F6] disabled:bg-slate-100 disabled:text-slate-400 min-w-[140px]"
            >
              {ports.length === 0 ? (
                <option value="">No COM ports found</option>
              ) : (
                ports.map((p) => (
                  <option key={p.device} value={p.device}>
                    {p.device} {p.description ? `- ${p.description.slice(0, 20)}` : ''}
                  </option>
                ))
              )}
            </select>

            <button
              onClick={handleToggleConnection}
              disabled={connecting || (!connectionStatus.connected && !selectedPort)}
              className={`h-8 px-4 rounded text-xs font-bold text-white transition-all shadow-2xs ${
                connectionStatus.connected
                  ? 'bg-[#dc3545] hover:bg-[#c82333]'
                  : 'bg-[#4CAF50] hover:bg-[#45a049] disabled:bg-slate-300'
              }`}
            >
              {connecting
                ? '...'
                : connectionStatus.connected
                ? 'Disconnect'
                : 'Connect'}
            </button>

            <button
              onClick={fetchPorts}
              disabled={connectionStatus.connected}
              title="Refresh COM Ports"
              className="h-8 px-2.5 rounded bg-[#008CBA] hover:bg-[#007B9E] text-white text-xs font-bold transition-all disabled:bg-slate-300 shadow-2xs flex items-center justify-center"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Connection Status Text */}
          <div className="text-[11px] font-semibold">
            <span
              className={
                connectionStatus.connected
                  ? 'text-[#4CAF50]'
                  : connectionStatus.message.includes('Connecting')
                  ? 'text-amber-500'
                  : 'text-red-500'
              }
            >
              {connectionStatus.message}
            </span>
          </div>
        </div>
      </header>

      {/* Screen Body */}
      <main className="flex-1 flex overflow-hidden">
        {currentScreen === 'main' && <MainMenu onNavigate={setCurrentScreen} />}
        {currentScreen === 'process' && (
          <ProcessMode
            connectionStatus={connectionStatus}
            telemetry={telemetry}
            processState={processState}
            onError={setErrorMessage}
          />
        )}
        {currentScreen === 'logs' && <ProcessLogs onError={setErrorMessage} />}
        {currentScreen === 'settings' && (
          <SettingsScreen
            connectionStatus={connectionStatus}
            telemetry={telemetry}
            onError={setErrorMessage}
          />
        )}
      </main>

      {/* Exit Application Dialog */}
      {exitDialog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-200">
            <h3 className="font-bold text-base text-slate-800 mb-2">Exit Application</h3>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Do you want to close the Universal Testing Machine application?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setExitDialog(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                No
              </button>
              <button
                onClick={() => window.api.closeApp()}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[#AA0000] hover:bg-[#8C0000] text-white transition-colors"
              >
                Yes, Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

