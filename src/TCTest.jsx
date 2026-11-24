import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  RotateCcw,
  Square,
  Scale,
  Activity,
  ArrowUp,
  ArrowDown,
  GitCompare,
  TrendingUp,
  Gauge,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Repeat,
  Sliders,
  ArrowLeft
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const TCTest = () => {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [isTare, setIsTare] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState({ connected: false, port: null });

  // Live telemetry metrics
  const [liveDistance, setLiveDistance] = useState(0);
  const [liveForce, setLiveForce] = useState(0);
  const [peakTension, setPeakTension] = useState(0);
  const [peakCompression, setPeakCompression] = useState(0);
  const [peakDistUp, setPeakDistUp] = useState(0);
  const [peakDistDown, setPeakDistDown] = useState(0);

  // Cycle management
  const [currentCycle, setCurrentCycle] = useState(0);
  const [targetCycles, setTargetCycles] = useState(5);
  const [currentPhase, setCurrentPhase] = useState('IDLE'); // 'TENSION', 'COMPRESSION', 'IDLE', 'COMPLETED'

  // Coordinate Data Points for cyclic Hysteresis Loop: { x: distance, y: force }
  const [dataPoints, setDataPoints] = useState([]);
  const prevDistRef = useRef(0);
  const isRunningRef = useRef(false);
  isRunningRef.current = isRunning;

  // Load configured cycles from localStorage if available
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('selectedConfig');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed && parsed.cycles) {
          const cyc = parseInt(parsed.cycles, 10);
          if (!isNaN(cyc) && cyc > 0) {
            setTargetCycles(cyc);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse selectedConfig:', e);
    }
  }, []);

  // Lifecycle: Turn ON M800 (2800) on mount, turn OFF on unmount
  useEffect(() => {
    const enterMode = async () => {
      try {
        if (window.api && window.api.enterTcMode) {
          await window.api.enterTcMode();
        }
      } catch (err) {
        console.error('Error entering TC Mode (M800):', err);
      }
    };
    enterMode();

    const fetchInitialStatus = async () => {
      try {
        if (window.api && window.api.getConnectionStatus) {
          const status = await window.api.getConnectionStatus();
          setConnectionStatus({
            connected: Boolean(status && status.connected),
            port: status ? status.port : null,
          });
        }
      } catch (err) {
        console.error('Initial status check error:', err);
      }
    };
    fetchInitialStatus();

    // Telemetry subscriber
    let unsubTelemetry = () => {};
    if (window.api && window.api.onTelemetry) {
      unsubTelemetry = window.api.onTelemetry((data) => {
        if (!data) return;

        // Use dedicated TC registers if available (R422 distance float, R420 force float, R424 cycle count)
        const distVal = typeof data.tcDistance === 'number'
          ? data.tcDistance
          : typeof data.distance === 'number'
          ? data.distance
          : 0;

        const forceVal = typeof data.tcForce === 'number'
          ? data.tcForce
          : typeof data.force === 'number'
          ? data.force
          : 0;

        const plcCycle = typeof data.tcCycles === 'number' ? data.tcCycles : 0;
        if (plcCycle > 0) {
          setCurrentCycle(plcCycle);
        }

        if (data.tcRunning !== undefined) {
          setIsRunning(data.tcRunning);
        }

        setLiveDistance(distVal);
        setLiveForce(forceVal);

        // Peak tracking
        if (forceVal > 0 && forceVal > peakTension) {
          setPeakTension(forceVal);
        } else if (forceVal < 0 && Math.abs(forceVal) > peakCompression) {
          setPeakCompression(Math.abs(forceVal));
        }

        if (distVal > 0 && distVal > peakDistUp) {
          setPeakDistUp(distVal);
        } else if (distVal < 0 && Math.abs(distVal) > peakDistDown) {
          setPeakDistDown(Math.abs(distVal));
        }

        // Determine current phase based on motion / force direction
        if (isRunningRef.current) {
          const delta = distVal - prevDistRef.current;
          if (forceVal > 0.05 || delta > 0.01) {
            setCurrentPhase('TENSION');
          } else if (forceVal < -0.05 || delta < -0.01) {
            setCurrentPhase('COMPRESSION');
          }

          // Append to cyclic hysteresis curve
          setDataPoints((prev) => {
            const next = [...prev, { distance: distVal, force: forceVal, cycle: plcCycle || 1 }];
            return next.length > 3000 ? next.slice(-3000) : next;
          });
        }

        prevDistRef.current = distVal;
      });
    }

    // Connection status subscriber
    let unsubConnection = () => {};
    if (window.api && window.api.onConnectionStatus) {
      unsubConnection = window.api.onConnectionStatus((status) => {
        setConnectionStatus({
          connected: Boolean(status && status.connected),
          port: status ? status.port : null,
        });
      });
    }

    const handleBeforeUnload = () => {
      if (window.api && window.api.leaveTcMode) {
        window.api.leaveTcMode().catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubTelemetry();
      unsubConnection();
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Deactivate M800 when leaving screen
      if (window.api && window.api.leaveTcMode) {
        window.api.leaveTcMode().catch((err) => {
          console.error('Error leaving TC Mode (M800):', err);
        });
      }
    };
  }, [peakTension, peakCompression, peakDistUp, peakDistDown]);

  // Action Handlers
  const handleStart = async () => {
    if (!connectionStatus.connected) {
      setErrorMessage('PLC is not connected. Please check serial cable.');
      return;
    }
    setErrorMessage(null);
    try {
      setActionLoading(true);
      setIsRunning(true);
      setCurrentPhase('TENSION');

      const startFn = window.api && window.api.startTcTest
        ? window.api.startTcTest
        : window.api && window.api.startProcess;

      if (startFn) {
        const res = await startFn();
        if (res && res.success === false) {
          setErrorMessage(res.message || 'Failed to start TC Test');
          setIsRunning(false);
          setCurrentPhase('IDLE');
        }
      }
    } catch (err) {
      console.error('TC Test start error:', err);
      setErrorMessage(err.message || 'Error starting test');
      setIsRunning(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setActionLoading(true);
      setIsRunning(false);
      setCurrentPhase('IDLE');

      const stopFn = window.api && window.api.stopTcTest
        ? window.api.stopTcTest
        : window.api && window.api.stopProcess;

      if (stopFn) {
        await stopFn();
      }
    } catch (err) {
      console.error('TC Test stop error:', err);
      setErrorMessage(err.message || 'Error stopping test');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTare = async () => {
    try {
      setIsTare(true);
      setErrorMessage(null);

      const tareFn = window.api && window.api.tareTcTest
        ? window.api.tareTcTest
        : window.api && window.api.activateTare;

      if (tareFn) {
        await tareFn();
      }
      setTimeout(() => setIsTare(false), 1200);
    } catch (err) {
      console.error('Tare error:', err);
      setIsTare(false);
      setErrorMessage(err.message || 'Tare error');
    }
  };

  const handleReset = async () => {
    try {
      setActionLoading(true);
      setIsRunning(false);
      setCurrentPhase('IDLE');
      setCurrentCycle(0);
      setPeakTension(0);
      setPeakCompression(0);
      setPeakDistUp(0);
      setPeakDistDown(0);
      setDataPoints([]);
      setErrorMessage(null);

      const resetFn = window.api && window.api.resetTcTest
        ? window.api.resetTcTest
        : window.api && window.api.resetProcess;

      if (resetFn) {
        await resetFn();
      }
    } catch (err) {
      console.error('Reset error:', err);
      setErrorMessage(err.message || 'Reset error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExit = () => {
    if (window.api && window.api.leaveTcMode) {
      window.api.leaveTcMode().catch(() => {});
    }
    navigate('/');
  };

  // Cartesian Chart Setup for Tension (+) & Compression (-)
  const chartData = {
    datasets: [
      {
        label: 'Force vs. Displacement Curve',
        data: dataPoints.map((pt) => ({ x: pt.distance, y: pt.force })),
        borderColor: '#4f46e5', // indigo-600
        backgroundColor: 'rgba(79, 70, 229, 0.05)',
        borderWidth: 2.2,
        pointRadius: dataPoints.length > 250 ? 0 : 2,
        pointHoverRadius: 5,
        showLine: true,
        fill: false,
        tension: 0,
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
          text: 'Displacement (mm)  [ - Compression | + Tension ]',
          color: '#475569',
          font: { weight: 'bold', size: 12 },
        },
        grid: {
          color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? '#94a3b8' : 'rgba(226, 232, 240, 0.8)'),
          lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 0 ? 2 : 1),
        },
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: 'Force (N)  [ - Compression | + Tension ]',
          color: '#475569',
          font: { weight: 'bold', size: 12 },
        },
        grid: {
          color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? '#94a3b8' : 'rgba(226, 232, 240, 0.8)'),
          lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 0 ? 2 : 1),
        },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          font: { weight: 'bold', size: 12 },
          boxWidth: 16,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `Force: ${ctx.parsed.y.toFixed(3)} N at ${ctx.parsed.x.toFixed(2)} mm`,
        },
      },
    },
  };

  const progressPercent = targetCycles > 0 ? Math.min(100, Math.round((currentCycle / targetCycles) * 100)) : 0;

  return (
    <div className="min-h-full bg-slate-100 p-4 lg:p-8 space-y-6">
      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="text-sm font-bold text-red-700">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs text-red-500 hover:text-red-700 underline font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 lg:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <GitCompare className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                Tension & Compression (TC) Cyclic Test
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                Coil M800 Active
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium">
              Cyclic mechanical testing with dual-quadrant (+/-) Force and Displacement recording
            </p>
          </div>
        </div>

        {/* Status Indicators & Phase Pill */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Connection Chip */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700">
            <span className={`w-2.5 h-2.5 rounded-full ${connectionStatus.connected ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
            <span>{connectionStatus.connected ? `PLC Connected (${connectionStatus.port || 'COM'})` : 'Disconnected'}</span>
          </div>

          {/* Phase Pill */}
          <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 font-bold text-sm ${
            currentPhase === 'TENSION'
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : currentPhase === 'COMPRESSION'
              ? 'bg-purple-50 border-purple-200 text-purple-700'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            {currentPhase === 'TENSION' ? (
              <ArrowUp className="w-4 h-4 text-blue-600 animate-bounce" />
            ) : currentPhase === 'COMPRESSION' ? (
              <ArrowDown className="w-4 h-4 text-purple-600 animate-bounce" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            )}
            <span>Phase: {currentPhase}</span>
          </div>

          {/* Return button */}
          <button
            type="button"
            onClick={handleExit}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Live Displacement */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Displacement</span>
          <div className={`text-2xl font-extrabold font-mono ${liveDistance >= 0 ? 'text-blue-600' : 'text-purple-600'}`}>
            {liveDistance >= 0 ? `+${liveDistance.toFixed(2)}` : liveDistance.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-500">mm</span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold block">Register R422</span>
        </div>

        {/* Live Force */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Force</span>
          <div className={`text-2xl font-extrabold font-mono ${liveForce >= 0 ? 'text-blue-600' : 'text-purple-600'}`}>
            {liveForce >= 0 ? `+${liveForce.toFixed(3)}` : liveForce.toFixed(3)}{' '}
            <span className="text-xs font-normal text-slate-500">N</span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold block">Register R420</span>
        </div>

        {/* Completed Cycles / Target */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Repeat className="w-3.5 h-3.5 text-indigo-500" /> Cycle Count
          </span>
          <div className="text-2xl font-extrabold text-indigo-600 font-mono">
            {currentCycle} <span className="text-sm font-normal text-slate-400">/ {targetCycles}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-1.5 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Peak Tension (+F) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <ArrowUp className="w-3.5 h-3.5 text-blue-500" /> Peak Tension (+F)
          </span>
          <div className="text-2xl font-extrabold text-slate-800 font-mono">
            +{peakTension.toFixed(2)} <span className="text-xs font-normal text-slate-500">N</span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold block">Max Upward Force</span>
        </div>

        {/* Peak Compression (-F) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <ArrowDown className="w-3.5 h-3.5 text-purple-500" /> Peak Comp. (-F)
          </span>
          <div className="text-2xl font-extrabold text-slate-800 font-mono">
            -{peakCompression.toFixed(2)} <span className="text-xs font-normal text-slate-500">N</span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold block">Max Downward Force</span>
        </div>

        {/* Max Travel Range */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-slate-500" /> Travel Span
          </span>
          <div className="text-lg font-extrabold text-slate-700 font-mono pt-1">
            +{peakDistUp.toFixed(1)} / -{peakDistDown.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-500">mm</span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold block">Bidirectional Amplitude</span>
        </div>
      </div>

      {/* Main Graph & Control Section */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Real-time Curve Card */}
        <div className="xl:col-span-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Force vs. Displacement Cyclic Curve (Hysteresis)
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-mono">
                Points: {dataPoints.length}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Quadrant I (+) / Quadrant III (-)
              </span>
            </div>
          </div>

          <div className="h-[430px] w-full">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Action Controls Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <h3 className="font-bold text-slate-800 text-base pb-3 border-b border-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              Test Controls
            </h3>

            {/* Cycle Count Selector */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>Target Cycles</span>
                <span className="text-indigo-600 font-mono font-bold text-sm">{targetCycles}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  disabled={isRunning}
                  value={targetCycles}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) {
                      setTargetCycles(val);
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 font-mono disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <span className="text-[10px] text-slate-400 block">
                Each cycle executes 1 Upward (Tension) & 1 Downward (Compression) stroke.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleStart}
                disabled={isRunning || actionLoading || !connectionStatus.connected}
                className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{isRunning ? 'TC Test Running...' : 'Start TC Test (M6)'}</span>
              </button>

              <button
                type="button"
                onClick={handleStop}
                disabled={!isRunning || actionLoading}
                className="w-full py-4 px-6 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-2xl font-bold shadow-lg shadow-red-500/25 transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Square className="w-5 h-5 fill-current" />
                <span>Stop Test (M8)</span>
              </button>

              <button
                type="button"
                onClick={handleTare}
                disabled={isTare || isRunning}
                className="w-full py-3.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Scale className="w-5 h-5" />
                <span>{isTare ? 'Taring Load Cell (M41)...' : 'Tare / Zero (M41)'}</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={actionLoading}
                className="w-full py-3.5 px-6 border-2 border-slate-200 hover:border-slate-300 text-slate-600 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98"
              >
                <RotateCcw className="w-5 h-5" />
                <span>Reset Curve & Counters (M7)</span>
              </button>
            </div>
          </div>

          {/* Operational Note */}
          <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 text-xs text-slate-600 space-y-1">
            <span className="font-bold text-indigo-800 block">TC Hardware Assignment:</span>
            <ul className="space-y-0.5 text-[11px] list-disc list-inside text-slate-500">
              <li>Mode Master: <strong className="text-slate-700">M800 (2800)</strong></li>
              <li>Force: <strong className="text-slate-700">R420</strong> (32-bit Float LE)</li>
              <li>Distance: <strong className="text-slate-700">R422</strong> (32-bit Float LE)</li>
              <li>Completed Cycles: <strong className="text-slate-700">R424</strong> (16-bit Int)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TCTest;
