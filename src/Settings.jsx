import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sliders,
  Activity,
  CheckCircle,
  AlertCircle,
  Weight,
  Binary,
  ArrowLeft,
  Power,
  Usb,
} from 'lucide-react';

const CALIBRATION_MODES = [
  { id: 'normal', label: 'Normal', coil: 'M40', description: 'Default normal operating mode' },
  { id: 'tare', label: 'Tare', coil: 'M41', description: 'Zero / Tare the load cell sensor' },
  { id: 'calibrate', label: 'Calibrate', coil: 'M42', description: 'Calibrate load cell register' },
];

export default function Settings() {
  const navigate = useNavigate();

  // Inputs & states
  const [weightValue, setWeightValue] = useState('100');
  const [activeMode, setActiveMode] = useState('normal');
  const [telemetry, setTelemetry] = useState({
    force: '--',
    r100: '--',
    r101: '--',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isModeLoading, setIsModeLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [powerActive, setPowerActive] = useState(false);

  useEffect(() => {
    // Check initial connection
    if (window.api && window.api.getConnectionStatus) {
      window.api.getConnectionStatus().then((status) => {
        const conn = status && status.connected;
        setConnectionStatus(conn ? 'connected' : 'disconnected');
        setPowerActive(conn);
      });
    }

    let unsubConnection = () => {};
    let unsubTelemetry = () => {};

    if (window.api) {
      if (window.api.onConnectionStatus) {
        unsubConnection = window.api.onConnectionStatus((status) => {
          const conn = status && status.connected;
          setConnectionStatus(conn ? 'connected' : 'disconnected');
          setPowerActive(conn);
        });
      }

      if (window.api.onTelemetry) {
        unsubTelemetry = window.api.onTelemetry((data) => {
          setTelemetry({
            force: data?.force !== undefined ? `${Number(data.force).toFixed(3)} mN` : '--',
            r100: data?.r100 !== undefined ? data.r100 : '--',
            r101: data?.r101 !== undefined ? data.r101 : '--',
          });
        });
      }
    }

    // Trigger initial Normal mode
    if (window.api && window.api.activateNormal) {
      window.api.activateNormal().catch(() => {});
    }

    return () => {
      unsubConnection();
      unsubTelemetry();
    };
  }, []);

  const handleReconnect = async () => {
    try {
      if (window.api && window.api.reconnect) {
        const res = await window.api.reconnect();
        if (res && res.success) {
          setConnectionStatus('connected');
          setPowerActive(true);
        }
      }
    } catch (e) {
      console.error('Reconnect failed:', e);
    }
  };

  const handleWeightChange = (e) => {
    const val = e.target.value;
    if (val === '' || (/^\d+$/.test(val) && Number(val) >= 0 && Number(val) <= 1000)) {
      setWeightValue(val);
    }
  };

  const handleSendWeight = async () => {
    setSuccessMessage('');
    setErrorMessage('');

    if (weightValue === '') {
      setErrorMessage('Weight parameter is required');
      return;
    }

    const num = Number(weightValue);
    if (isNaN(num) || num < 0 || num > 1000) {
      setErrorMessage('Weight parameter must be an integer between 0 and 1000');
      return;
    }

    setIsLoading(true);
    try {
      const res = await window.api.sendWeight(num);
      if (res && res.success) {
        setSuccessMessage(res.message || `Weight parameter (${num}) successfully written to register R102.`);
      } else {
        setErrorMessage(res?.message || 'Failed to write weight parameter to R102.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error writing weight parameter.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMode = async (modeId) => {
    setSuccessMessage('');
    setErrorMessage('');
    setIsModeLoading(true);

    const modeConfig = CALIBRATION_MODES.find((m) => m.id === modeId);

    try {
      let res;
      if (modeId === 'normal') {
        res = await window.api.activateNormal();
      } else if (modeId === 'tare') {
        res = await window.api.setCalibrateMode('tare');
      } else if (modeId === 'calibrate') {
        res = await window.api.setCalibrateMode('calibrate');
      }

      if (res && res.success) {
        setActiveMode(modeId);
        setSuccessMessage(`Mode "${modeConfig?.label}" (${modeConfig?.coil}) activated on PLC.`);
      } else {
        setErrorMessage(res?.message || `Failed to activate mode "${modeConfig?.label}".`);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error setting calibration mode.');
    } finally {
      setIsModeLoading(false);
    }
  };

  const handleExit = () => {
    const confirmed = window.confirm('Are you sure you want to exit?');
    if (confirmed) {
      if (window.api && window.api.closeApp) {
        window.api.closeApp();
      } else {
        window.close();
      }
    }
  };

  const activeModeConfig = CALIBRATION_MODES.find((m) => m.id === activeMode) || CALIBRATION_MODES[0];

  return (
    <div className="min-h-screen h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 select-none overflow-hidden">
      {/* Header */}
      <header className="flex items-center px-6 py-3.5 bg-white/80 backdrop-blur-lg shadow-md border-b border-gray-200/50 relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold text-gray-700 bg-white/80 hover:bg-white border border-gray-200 rounded-xl transition-all shadow-xs hover:shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Settings & Calibration
            </h1>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3 mr-3">
          {/* Power Status */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium ${
              powerActive ? 'bg-green-100 border-green-200 text-green-700' : 'bg-red-100 border-red-200 text-red-700'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>POWERED {powerActive ? 'ON' : 'OFF'}</span>
          </div>

          {/* USB Status */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium ${
              connectionStatus === 'connected' ? 'bg-green-100 border-green-200 text-green-700' : 'bg-red-100 border-red-200 text-red-700'
            }`}
          >
            <Usb className="w-4 h-4" />
            <span>{connectionStatus === 'connected' ? 'USB Connected' : 'USB Disconnected'}</span>
          </div>

          {connectionStatus === 'disconnected' && (
            <button
              onClick={handleReconnect}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              Reconnect
            </button>
          )}
        </div>

        <button
          onClick={handleExit}
          title="Exit Application"
          className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all duration-300 hover:-translate-y-0.5 shadow-md border border-red-400/30 cursor-pointer"
        >
          <Power className="w-4 h-4" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-5 overflow-y-auto">
        {/* Banner Section */}
        <section className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-md p-6 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
            <Sliders className="h-4 w-4" />
            CALIBRATION UTILITY
          </p>
          <h2 className="mt-1.5 text-2xl font-bold text-slate-900 tracking-tight">Load Cell Calibration</h2>
          <p className="mt-1 text-sm text-slate-600 leading-relaxed">
            Configure calibration inputs, send weight parameters to PLC register R102, and observe real-time load cell telemetry.
          </p>
        </section>

        {/* Feedback Messages */}
        {successMessage && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-xl shadow-xs flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-emerald-900 font-medium text-sm">{successMessage}</p>
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl shadow-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <p className="text-rose-900 font-medium text-sm">{errorMessage}</p>
          </div>
        )}

        {/* Two-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Left Column: Calibration Parameters */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-6 md:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Calibration Parameters</h3>
                  <p className="text-xs text-slate-500">Configure parameters to send to PLC registers & coils</p>
                </div>
              </div>

              {/* Weight Range Input (R102) */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Weight className="w-4 h-4 text-slate-400" />
                  <span>Weight Parameter (0–1000)</span>
                  <span className="text-xs font-mono font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">R102</span>
                </label>

                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={weightValue}
                      onChange={handleWeightChange}
                      placeholder="Enter weight value (e.g. 100)"
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 placeholder:text-slate-400 font-medium text-slate-800"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendWeight}
                    disabled={isLoading || connectionStatus !== 'connected'}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-7 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                  >
                    {isLoading ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>

              {/* Mode Selection (M40, M41, M42) */}
              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Binary className="w-4 h-4 text-slate-400" />
                  <span>Input Mode Selection</span>
                  <span className="text-xs font-normal text-slate-400">(Trigger PLC calibration coils)</span>
                </label>

                <div className="grid grid-cols-3 gap-3">
                  {CALIBRATION_MODES.map((mode) => {
                    const isSelected = activeMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleSelectMode(mode.id)}
                        disabled={isModeLoading || connectionStatus !== 'connected'}
                        className={`flex flex-col items-center justify-center py-3.5 px-3 rounded-xl border-2 font-bold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/70 text-blue-600 shadow-sm ring-2 ring-blue-200'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-sm font-semibold">{mode.label}</span>
                        <span className={`text-[11px] font-mono mt-0.5 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}>
                          {mode.coil}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Current Mode Indicator */}
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-2">
                  <span>Active Mode:</span>
                  <span className="font-mono font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                    {activeModeConfig.label} ({activeModeConfig.coil})
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 text-xs text-slate-400">
              * Mode actions trigger calibration coils on the PLC for precise load-cell zeroing and reference scaling.
            </div>
          </div>

          {/* Right Column: Live Calibration Telemetry */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-6 md:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Activity className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Live Calibration Reads</h3>
                  <p className="text-xs text-slate-500">Continuous telemetry polled from PLC holding registers</p>
                </div>
              </div>

              {/* Telemetry Cards */}
              <div className="space-y-4 my-auto py-2">
                {/* 1. Real-Time Force */}
                <div className="p-5 bg-slate-50/80 border border-slate-200 rounded-2xl flex items-center justify-between shadow-xs hover:border-emerald-300 transition-colors">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      REAL-TIME FORCE
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Registers R154 & R155 (32-bit Float)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl md:text-3xl font-bold text-emerald-600 font-mono tracking-tight">
                      {telemetry.force}
                    </span>
                  </div>
                </div>

                {/* 2. Raw Force Value (R100) */}
                <div className="p-5 bg-slate-50/80 border border-slate-200 rounded-2xl flex items-center justify-between shadow-xs hover:border-blue-300 transition-colors">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      RAW FORCE VALUE (REG_F)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Register R100</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl md:text-3xl font-bold text-blue-600 font-mono tracking-tight">
                      {telemetry.r100}
                    </span>
                  </div>
                </div>

                {/* 3. Realtime PLC Value (R101) */}
                <div className="p-5 bg-slate-50/80 border border-slate-200 rounded-2xl flex items-center justify-between shadow-xs hover:border-indigo-300 transition-colors">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      REALTIME PLC VALUE (REG_G)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Register R101</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl md:text-3xl font-bold text-indigo-600 font-mono tracking-tight">
                      {telemetry.r101}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 text-xs text-slate-400">
              * Telemetry values refresh automatically at 500 ms intervals from the hardware controller.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

