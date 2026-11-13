import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  ArrowLeft,
  Power,
  Usb,
  Play,
  Square,
  RotateCcw,
  Scale,
  Ruler,
  Gauge,
  Activity,
  AlertCircle,
  X,
  FastForward,
  Sliders,
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ProcessMode() {
  const navigate = useNavigate();

  // Hardware states
  const [connectionStatus, setConnectionStatus] = useState({ connected: false, message: 'Disconnected', port: null });
  const [processState, setProcessState] = useState({ processRunning: false, tearActive: false, regZ: 0 });
  const [telemetry, setTelemetry] = useState({ distance: 0, force: 0, r100: 0, r101: 0, regZ: 0 });
  const [dataPoints, setDataPoints] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('chart'); // 'chart' | 'table'

  // Loaded configuration profile (written prior to entering this screen)
  const [activeConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('selectedConfig');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const chartRef = useRef(null);
  const processStateRef = useRef(processState);

  useEffect(() => {
    processStateRef.current = processState;
  }, [processState]);

  // Initialize and register event listeners (Turn ON M20 on mount, turn OFF on unmount)
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        if (window.api && window.api.getConnectionStatus) {
          const status = await window.api.getConnectionStatus();
          setConnectionStatus({
            connected: status.connected,
            message: status.connected ? 'Connected' : 'Disconnected',
            port: status.port,
          });
          setProcessState({
            processRunning: status.processRunning || false,
            tearActive: status.tearActive || false,
            regZ: status.regZ || 0,
          });
        }
      } catch (err) {
        console.error('Error fetching initial status:', err);
      }
    };

    fetchInitial();
    // NOTE: M20 is turned ON by the Main Menu button click before navigation.
    // We do NOT re-trigger enterProcessMode here to avoid toggling M20 on
    // every React mount/re-render.

    let unsubTelemetry = () => {};
    let unsubConnection = () => {};
    let unsubProcess = () => {};
    let unsubError = () => {};

    if (window.api) {
      if (window.api.onTelemetry) {
        unsubTelemetry = window.api.onTelemetry((data) => {
          setTelemetry(data);
          if (data.regZ !== undefined) {
            setProcessState((prev) => ({ ...prev, regZ: data.regZ }));
          }

          // Collect data points only when fresh telemetry arrives during an active test run
          const isRunning = data.processRunning !== undefined ? data.processRunning : processStateRef.current.processRunning;
          const isTear = data.tearActive !== undefined ? data.tearActive : processStateRef.current.tearActive;
          if (isRunning && !isTear && data.distance !== undefined && data.force !== undefined) {
            setDataPoints((prev) => {
              const next = [...prev, { distance: data.distance, force: data.force }];
              return next.length > 1500 ? next.slice(-1500) : next;
            });
          }
        });
      }

      if (window.api.onConnectionStatus) {
        unsubConnection = window.api.onConnectionStatus((status) => {
          setConnectionStatus({
            connected: status.connected,
            message: status.connected ? 'Connected' : `Disconnected: ${status.message || ''}`,
            port: status.port,
          });
          if (!status.connected) {
            setProcessState((prev) => ({ ...prev, processRunning: false, tearActive: false }));
          }
        });
      }

      if (window.api.onProcessState) {
        unsubProcess = window.api.onProcessState((state) => {
          setProcessState(state);
        });
      }

      if (window.api.onError) {
        unsubError = window.api.onError((err) => {
          setErrorMessage(typeof err === 'string' ? err : err.message || 'Unknown error');
        });
      }
    }

    const handleBeforeUnload = () => {
      if (window.api && window.api.leaveProcessMode) {
        window.api.leaveProcessMode().catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubTelemetry();
      unsubConnection();
      unsubProcess();
      unsubError();
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Turn OFF M20 on the PLC when leaving Tensile Test screen
      if (window.api && window.api.leaveProcessMode) {
        window.api.leaveProcessMode().catch((err) => {
          console.error('Error leaving Process Mode (M20):', err);
        });
      }
    };
  }, []);



  const handleReconnect = async () => {
    try {
      if (window.api && window.api.reconnect) {
        await window.api.reconnect();
        if (window.api.enterProcessMode) {
          await window.api.enterProcessMode();
        }
      }
    } catch (e) {
      console.error('Reconnect error:', e);
    }
  };

  const handleStart = async () => {
    if (!connectionStatus.connected) {
      setErrorMessage('Not connected to PLC!');
      return;
    }

    try {
      setActionLoading(true);
      setDataPoints([]);
      const res = await window.api.startProcess();
      if (!res.success) {
        setErrorMessage(res.message || 'Failed to start testing process');
      }
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setActionLoading(true);
      const res = await window.api.stopProcess();
      if (!res.success && res.message) {
        setErrorMessage(res.message);
      }
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      setActionLoading(true);
      setDataPoints([]);
      const res = await window.api.resetProcess();
      if (!res.success && res.message) {
        setErrorMessage(res.message);
      }
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTare = async () => {
    if (!connectionStatus.connected) {
      setErrorMessage('Not connected to PLC!');
      return;
    }
    try {
      setActionLoading(true);
      const res = await window.api.activateTare();
      if (!res.success && res.message) {
        setErrorMessage(res.message);
      }
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExit = () => {
    const confirmed = window.confirm('Are you sure you want to exit?');
    if (confirmed && window.api && window.api.leaveProcessMode) {
      window.api.leaveProcessMode().catch(() => {});
    }
    if (confirmed) {
      if (window.api && window.api.closeApp) {
        window.api.closeApp();
      } else {
        window.close();
      }
    }
  };

  // Chart Setup
  const chartData = {
    datasets: [
      {
        label: 'Force (mN)',
        data: dataPoints.map((pt) => ({ x: pt.distance, y: pt.force })),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        fill: true,
        borderWidth: 2.5,
        pointRadius: dataPoints.length > 200 ? 1 : 3,
        pointHoverRadius: 6,
        showLine: true,
        tension: 0.1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: true,
          text: 'Distance (mm)',
          font: { weight: 'bold', size: 13 },
          color: '#475569',
        },
        grid: { color: 'rgba(226, 232, 240, 0.8)' },
      },
      y: {
        title: {
          display: true,
          text: 'Force (mN)',
          font: { weight: 'bold', size: 13 },
          color: '#475569',
        },
        grid: { color: 'rgba(226, 232, 240, 0.8)' },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { font: { weight: 'bold', size: 12 }, boxWidth: 16 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `Force: ${ctx.parsed.y.toFixed(3)} mN at ${ctx.parsed.x.toFixed(1)} mm`,
        },
      },
    },
  };

  const isConnected = connectionStatus.connected;
  const isRunning = processState.processRunning;
  const isTearActive = processState.tearActive;
  const isRegZReady = processState.regZ === 1;

  const displayDistance = isTearActive
    ? '--'
    : Number(telemetry?.distance ?? telemetry?.manualDistance ?? 0).toFixed(2);
  const displayForce = isTearActive
    ? '--'
    : isRunning && dataPoints.length === 0
    ? 'Reading...'
    : telemetry?.force !== undefined
    ? Number(telemetry.force).toFixed(3)
    : '0.000';

  const canStart = isConnected && !isRunning && !isTearActive;
  const canStop = isRunning;
  const canReset = isConnected;
  const canTare = isConnected && !isTearActive;

  // Status text & style
  const getStatusBadge = () => {
    if (!isConnected) {
      return { text: 'DISCONNECTED', bg: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (isTearActive) {
      return { text: 'TARE ACTIVE (M9)', bg: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    if (isRunning) {
      return { text: 'TENSILE RUNNING (M6)', bg: 'bg-green-100 text-green-700 border-green-200 animate-pulse' };
    }
    return { text: 'TENSILE READY (M20)', bg: 'bg-blue-100 text-blue-700 border-blue-200' };
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="min-h-screen h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 select-none overflow-hidden">
      {/* Error Alert Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-red-200 overflow-hidden transform animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-r from-red-600 to-rose-700 p-5 flex items-center justify-between text-white">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-6 h-6" />
                <h3 className="text-lg font-bold">Alert Notification</h3>
              </div>
              <button onClick={() => setErrorMessage('')} className="p-1.5 hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 text-gray-700 font-medium">{errorMessage}</div>
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setErrorMessage('')}
                className="px-5 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-bold rounded-xl transition-all shadow-sm"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
        {/* Real-time Chart Glass Card */}
        <div className="flex-1 bg-white/70 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-gray-800">Force vs. Distance Real-Time Response</h2>
              <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-800 rounded-md border border-blue-200">
                Coil: M20
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`px-2.5 py-1 rounded-lg border text-xs font-bold tracking-wider ${statusBadge.bg}`}>
                {statusBadge.text}
              </div>
              <div className="text-xs font-medium text-gray-500">
                {dataPoints.length} recorded points
              </div>
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Parameter Inputs & Live Telemetry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
          {/* Distance Readout Card (R161) */}
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/50 p-3.5 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center">
                <Ruler className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Distance</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-black text-green-700 font-mono">{displayDistance}</span>
                  <span className="text-xs font-bold text-gray-500">mm</span>
                </div>
              </div>
            </div>
          </div>

          {/* Force Readout Card */}
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/50 p-3.5 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Force</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-black text-blue-700 font-mono">{displayForce}</span>
                  <span className="text-xs font-bold text-gray-500">mN</span>
                </div>
              </div>
            </div>
          </div>

          {/* Speed Config Card (R161 — read-only, written before entering this screen) */}
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/50 p-3.5 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <FastForward className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Speed</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-black text-indigo-700 font-mono">
                    {activeConfig?.speed !== undefined ? Number(activeConfig.speed).toFixed(1) : '--'}
                  </span>
                  <span className="text-xs font-bold text-gray-500">mm/s</span>
                </div>
              </div>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
              DD54
            </span>
          </div>

          {/* Force Diff Config Card (R206 — read-only, written before entering this screen) */}
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/50 p-3.5 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Force Diff</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-black text-cyan-700 font-mono">
                    {activeConfig?.forceDiff !== undefined ? Number(activeConfig.forceDiff) : '--'}
                  </span>
                  <span className="text-xs font-bold text-gray-500">gf</span>
                </div>
              </div>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-50 text-cyan-700 rounded border border-cyan-200">
              R206
            </span>
          </div>
        </div>

        {/* Process Control Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 shrink-0">
            {/* TARE */}
            <button
              onClick={handleTare}
              disabled={!canTare || actionLoading}
              className={`h-14 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                canTare
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white hover:-translate-y-0.5'
                  : 'bg-amber-200 text-amber-700 cursor-not-allowed opacity-60'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>{isTearActive ? 'TARING (M9)...' : 'TARE (M9)'}</span>
            </button>

            {/* START */}
            <button
              onClick={handleStart}
              disabled={!canStart || actionLoading}
              className={`h-14 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                canStart
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white hover:-translate-y-0.5'
                  : 'bg-green-200 text-green-700 cursor-not-allowed opacity-60'
              }`}
            >
              <Play className="w-4 h-4 fill-white" />
              <span>START (M6)</span>
            </button>

            {/* STOP */}
            <button
              onClick={handleStop}
              disabled={!canStop || actionLoading}
              className={`h-14 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                canStop
                  ? 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white hover:-translate-y-0.5'
                  : 'bg-red-200 text-red-700 cursor-not-allowed opacity-50'
              }`}
            >
              <Square className="w-4 h-4 fill-white" />
              <span>STOP (M8)</span>
            </button>

            {/* RESET */}
            <button
              onClick={handleReset}
              disabled={!canReset || actionLoading}
              className={`h-14 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                canReset
                  ? 'bg-gradient-to-r from-slate-600 to-gray-700 hover:from-slate-700 hover:to-gray-800 text-white hover:-translate-y-0.5'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed opacity-50'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>RESET (M7)</span>
            </button>
          </div>
      </main>
    </div>
  );
}
