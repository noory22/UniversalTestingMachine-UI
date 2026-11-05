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
  Layers,
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

export default function CompressionTest() {
  const navigate = useNavigate();

  // Hardware states
  const [connectionStatus, setConnectionStatus] = useState({ connected: false, message: 'Disconnected', port: null });
  const [testRunning, setTestRunning] = useState(false);
  const [tareActive, setTareActive] = useState(false);
  const [telemetry, setTelemetry] = useState({ compDistance: 0, compForce: 0 });
  const [dataPoints, setDataPoints] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const chartRef = useRef(null);
  const runningRef = useRef(testRunning);
  const tareRef = useRef(tareActive);
  const hasLeftRef = useRef(false);

  useEffect(() => {
    runningRef.current = testRunning;
    tareRef.current = tareActive;
  }, [testRunning, tareActive]);

  const leaveCompression = () => {
    if (!hasLeftRef.current) {
      hasLeftRef.current = true;
      if (window.api && window.api.leaveCompressionMode) {
        window.api.leaveCompressionMode().catch((err) => {
          console.error('Error leaving Compression Mode (M30):', err);
        });
      }
    }
  };

  // Lifecycle: Turn ON M30 on mount, turn OFF on unmount (matching M20 Process Mode)
  useEffect(() => {
    let isMounted = true;
    hasLeftRef.current = false;

    const fetchInitial = async () => {
      try {
        if (window.api && window.api.getConnectionStatus) {
          const status = await window.api.getConnectionStatus();
          if (isMounted) {
            setConnectionStatus({
              connected: Boolean(status && status.connected),
              message: status && status.connected ? 'Connected' : 'Disconnected',
              port: status ? status.port : null,
            });
          }
        }
      } catch (err) {
        console.error('Error fetching initial status in Compression Test:', err);
      }
    };

    fetchInitial();

    // NOTE: M30 is turned ON by the Main Menu button click before navigation.
    // We do NOT re-trigger enterCompressionMode here to avoid toggling M30 on
    // every React mount/re-render.

    let unsubTelemetry = () => {};
    let unsubConnection = () => {};

    if (window.api) {
      if (window.api.onTelemetry) {
        unsubTelemetry = window.api.onTelemetry((data) => {
          if (!isMounted || !data) return;

          const liveForce = data.compForce !== undefined ? data.compForce : (data.force !== undefined ? data.force : 0);
          setTelemetry({
            compDistance: data.compDistance !== undefined ? data.compDistance : 0,
            compForce: liveForce,
          });

          if (data.compressionRunning !== undefined) {
            setTestRunning(Boolean(data.compressionRunning));
          }
          if (data.compressionTareActive !== undefined) {
            setTareActive(Boolean(data.compressionTareActive));
          }

          // Accumulate curve points when test is running and not taring
          const isRun = data.compressionRunning !== undefined ? data.compressionRunning : runningRef.current;
          const isTare = data.compressionTareActive !== undefined ? data.compressionTareActive : tareRef.current;
          if (isRun && !isTare && data.compDistance !== undefined) {
            setDataPoints((prev) => {
              const next = [...prev, { distance: data.compDistance, force: liveForce }];
              return next.length > 1500 ? next.slice(-1500) : next;
            });
          }
        });
      }

      if (window.api.onConnectionStatus) {
        unsubConnection = window.api.onConnectionStatus((status) => {
          if (!isMounted) return;
          const isConn = Boolean(status && status.connected);
          setConnectionStatus({
            connected: isConn,
            message: isConn ? 'Connected' : `Disconnected: ${status?.message || ''}`,
            port: status?.port,
          });
          if (!isConn) {
            setTestRunning(false);
            setTareActive(false);
          }
        });
      }
    }

    return () => {
      isMounted = false;
      unsubTelemetry();
      unsubConnection();

      // NOTE: M30 is turned OFF only by the explicit back-button handler (leaveCompression).
      // Do NOT call leaveCompression() here — React unmount fires on every
      // navigation event, which would inadvertently kill M30.
    };
  }, []);

  const handleReconnect = async () => {
    try {
      if (window.api && window.api.reconnect) {
        await window.api.reconnect();
        if (window.api.enterCompressionMode) {
          await window.api.enterCompressionMode();
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
      setDataPoints([]); // Fresh curve
      const res = await window.api.startCompressionTest();
      if (res && res.success) {
        setTestRunning(true);
      } else {
        setErrorMessage(res?.message || 'Failed to start compression test (M6)');
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
      const res = await window.api.stopCompressionTest();
      if (res && res.success) {
        setTestRunning(false);
      } else if (res?.message) {
        setErrorMessage(res.message);
      }
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    if (!connectionStatus.connected) {
      setErrorMessage('Not connected to PLC!');
      return;
    }
    try {
      setActionLoading(true);
      const res = await window.api.resetCompressionTest();
      if (res && res.success) {
        setDataPoints([]);
        setTestRunning(false);
      } else if (res?.message) {
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
      const res = await window.api.tareCompressionTest();
      if (!res?.success && res?.message) {
        setErrorMessage(res.message);
      }
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBack = () => {
    leaveCompression();
    navigate('/');
  };

  const handleExit = () => {
    const confirmed = window.confirm('Are you sure you want to exit?');
    if (confirmed) {
      leaveCompression();
      if (window.api && window.api.closeApp) {
        window.api.closeApp();
      } else {
        window.close();
      }
    }
  };

  // Chart configuration
  const chartData = {
    datasets: [
      {
        label: 'Compression Force (mN)',
        data: dataPoints.map((pt) => ({ x: pt.distance, y: pt.force })),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.08)',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
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
        title: {
          display: true,
          text: 'Distance (mm) [D104]',
          font: { weight: 'bold', size: 12 },
          color: '#475569',
        },
        grid: { color: 'rgba(226, 232, 240, 0.8)' },
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: 'Force (mN) [R154]',
          font: { weight: 'bold', size: 12 },
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
          label: (ctx) => `Force: ${ctx.parsed.y.toFixed(2)} mN at ${ctx.parsed.x.toFixed(1)} mm`,
        },
      },
    },
  };

  const isConnected = connectionStatus.connected;
  const isRunning = testRunning;
  const isTearActive = tareActive;

  const displayDistance = isTearActive ? '--' : (telemetry?.compDistance ?? 0);
  const displayForce = isTearActive
    ? '--'
    : isRunning && dataPoints.length === 0
    ? 'Reading...'
    : telemetry?.compForce !== undefined
    ? Number(telemetry.compForce).toFixed(3)
    : '0.000';

  const canStart = isConnected && !isRunning && !isTearActive;
  const canStop = isRunning;
  const canReset = isConnected;
  const canTare = isConnected && !isTearActive;

  const getStatusBadge = () => {
    if (!isConnected) {
      return { text: 'DISCONNECTED', bg: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (isTearActive) {
      return { text: 'TARE ACTIVE (M9)', bg: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    if (isRunning) {
      return { text: 'COMPRESSION RUNNING (M6)', bg: 'bg-purple-100 text-purple-700 border-purple-200 animate-pulse' };
    }
    return { text: 'COMPRESSION READY (M30)', bg: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="min-h-screen h-screen flex flex-col bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-100 select-none overflow-hidden">
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
                className="px-5 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-bold rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center px-6 py-3.5 bg-white/80 backdrop-blur-lg shadow-md border-b border-gray-200/50 relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold text-gray-700 bg-white/80 hover:bg-white border border-gray-200 rounded-xl transition-all shadow-xs hover:shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-800 to-indigo-700 bg-clip-text text-transparent">
              Compression Test
            </h1>
            <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-800 rounded-md border border-purple-200">
              Coil: M30
            </span>
          </div>
        </div>

        <div className="flex-1" />

        {/* Status Indicators */}
        <div className="flex items-center gap-3 mr-3">
          {/* Machine State Pill */}
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold tracking-wider ${statusBadge.bg}`}>
            {statusBadge.text}
          </div>

          {/* USB Indicator */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium ${
              isConnected ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
            }`}
          >
            <Usb className="w-4 h-4" />
            <span>{isConnected ? 'USB Connected' : 'USB Disconnected'}</span>
          </div>

          {!isConnected && (
            <button
              onClick={handleReconnect}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
            >
              Reconnect
            </button>
          )}
        </div>

        {/* Exit Power Button */}
        <button
          onClick={handleExit}
          title="Exit Application"
          className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all duration-300 hover:-translate-y-0.5 shadow-md border border-red-400/30 cursor-pointer"
        >
          <Power className="w-4 h-4" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
        {/* Real-time Chart Glass Card */}
        <div className="flex-1 bg-white/70 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-600" />
              <h2 className="text-base font-bold text-gray-800">
                Compression Response: Force vs. Distance Curve
              </h2>
            </div>
            <div className="text-xs font-medium text-gray-500">
              {dataPoints.length} recorded points
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Telemetry Readout Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 shrink-0">
          {/* Distance Card (D102) */}
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/50 p-3.5 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Ruler className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Distance</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-black text-purple-700 font-mono">{displayDistance}</span>
                  <span className="text-xs font-bold text-gray-500">mm</span>
                </div>
              </div>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-purple-50 text-purple-700 rounded border border-purple-200">
              D102 (6102)
            </span>
          </div>

          {/* Force Card (D154) */}
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/50 p-3.5 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Force</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-black text-indigo-700 font-mono">{displayForce}</span>
                  <span className="text-xs font-bold text-gray-500">mN</span>
                </div>
              </div>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
              R154
            </span>
          </div>

          {/* Mode Status Card (M30) */}
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/50 p-3.5 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Master Mode</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg font-black text-violet-700">COMPRESSION</span>
                </div>
              </div>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-violet-50 text-violet-700 rounded border border-violet-200">
              M30 (2030)
            </span>
          </div>
        </div>

        {/* Compression Control Action Buttons (M9, M6, M8, M7) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 shrink-0">
          {/* TARE (M9) */}
          <button
            onClick={handleTare}
            disabled={!canTare || actionLoading}
            className={`h-13 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
              canTare
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white hover:-translate-y-0.5'
                : 'bg-amber-200 text-amber-700 cursor-not-allowed opacity-60'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>{isTearActive ? 'TARING (M9)...' : 'TARE (M9)'}</span>
          </button>

          {/* START (M6) */}
          <button
            onClick={handleStart}
            disabled={!canStart || actionLoading}
            className={`h-13 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
              canStart
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white hover:-translate-y-0.5 shadow-purple-500/20'
                : 'bg-purple-200 text-purple-700 cursor-not-allowed opacity-60'
            }`}
          >
            <Play className="w-4 h-4 fill-white" />
            <span>START (M6)</span>
          </button>

          {/* STOP (M8) */}
          <button
            onClick={handleStop}
            disabled={!canStop || actionLoading}
            className={`h-13 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
              canStop
                ? 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white hover:-translate-y-0.5'
                : 'bg-red-200 text-red-700 cursor-not-allowed opacity-50'
            }`}
          >
            <Square className="w-4 h-4 fill-white" />
            <span>STOP (M8)</span>
          </button>

          {/* RESET (M7) */}
          <button
            onClick={handleReset}
            disabled={!canReset || actionLoading}
            className={`h-13 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
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

