import React, { useState, useEffect, useRef } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
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

const TCTest = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [isTare, setIsTare] = useState(false);
  const [liveDistance, setLiveDistance] = useState(0);
  const [liveForce, setLiveForce] = useState(0);
  const [peakTension, setPeakTension] = useState(0);
  const [peakCompression, setPeakCompression] = useState(0);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [maxCycles, setMaxCycles] = useState(5);
  const [currentPhase, setCurrentPhase] = useState('IDLE'); // 'TENSION', 'COMPRESSION', 'IDLE'

  // Graph Data
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [
      {
        label: 'Tension / Compression Force (N)',
        data: [],
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 2.5,
        pointRadius: 0,
        fill: true,
        tension: 0.2,
      },
    ],
  });

  const chartRef = useRef(null);

  useEffect(() => {
    // Connect to live telemetry
    let unsubTelemetry = () => {};
    if (window.api && window.api.onTelemetry) {
      unsubTelemetry = window.api.onTelemetry((data) => {
        if (!data) return;
        const dist = typeof data.distance === 'number' ? data.distance : 0;
        const forceVal = typeof data.force === 'number' ? data.force : 0;

        setLiveDistance(dist);
        setLiveForce(forceVal);

        if (forceVal >= 0 && forceVal > peakTension) {
          setPeakTension(forceVal);
        } else if (forceVal < 0 && Math.abs(forceVal) > peakCompression) {
          setPeakCompression(Math.abs(forceVal));
        }

        // Determine phase based on velocity or force sign
        if (isRunning) {
          if (forceVal >= 0) setCurrentPhase('TENSION');
          else setCurrentPhase('COMPRESSION');

          setChartData((prev) => {
            const newLabels = [...prev.labels, dist.toFixed(2)];
            const newData = [...prev.datasets[0].data, forceVal];
            if (newLabels.length > 300) {
              newLabels.shift();
              newData.shift();
            }
            return {
              labels: newLabels,
              datasets: [
                {
                  ...prev.datasets[0],
                  data: newData,
                },
              ],
            };
          });
        }
      });
    }

    return () => {
      unsubTelemetry();
    };
  }, [isRunning, peakTension, peakCompression]);

  const handleStart = async () => {
    try {
      setIsRunning(true);
      setCurrentPhase('TENSION');
      if (window.api && window.api.startProcess) {
        await window.api.startProcess();
      }
    } catch (err) {
      console.error('TC Test start error:', err);
    }
  };

  const handleStop = async () => {
    try {
      setIsRunning(false);
      setCurrentPhase('IDLE');
      if (window.api && window.api.stopProcess) {
        await window.api.stopProcess();
      }
    } catch (err) {
      console.error('TC Test stop error:', err);
    }
  };

  const handleTare = async () => {
    try {
      setIsTare(true);
      if (window.api && window.api.activateTare) {
        await window.api.activateTare();
      }
      setTimeout(() => setIsTare(false), 1500);
    } catch (err) {
      console.error('Tare error:', err);
      setIsTare(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsRunning(false);
      setCurrentPhase('IDLE');
      setPeakTension(0);
      setPeakCompression(0);
      setChartData({
        labels: [],
        datasets: [
          {
            ...chartData.datasets[0],
            data: [],
          },
        ],
      });
      if (window.api && window.api.resetProcess) {
        await window.api.resetProcess();
      }
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        title: { display: true, text: 'Displacement (mm)', color: '#64748b', font: { weight: 'bold' } },
        grid: { color: 'rgba(226, 232, 240, 0.8)' },
      },
      y: {
        title: { display: true, text: 'Force (N)', color: '#64748b', font: { weight: 'bold' } },
        grid: { color: 'rgba(226, 232, 240, 0.8)' },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 lg:p-8 space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <GitCompare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Tension & Compression (TC) Test
            </h1>
            <p className="text-sm text-slate-500 font-medium">
              Bidirectional mechanical evaluation, cyclic stress hysteresis, and combined force analysis
            </p>
          </div>
        </div>

        {/* Phase Pill */}
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Live Distance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Displacement</span>
          <div className="text-2xl lg:text-3xl font-extrabold text-slate-800 font-mono">
            {liveDistance.toFixed(2)} <span className="text-sm font-normal text-slate-500">mm</span>
          </div>
        </div>

        {/* Live Force */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Force</span>
          <div className="text-2xl lg:text-3xl font-extrabold text-blue-600 font-mono">
            {liveForce.toFixed(3)} <span className="text-sm font-normal text-slate-500">N</span>
          </div>
        </div>

        {/* Peak Tension */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <ArrowUp className="w-3.5 h-3.5 text-blue-500" /> Peak Tension (+)
          </span>
          <div className="text-2xl lg:text-3xl font-extrabold text-slate-800 font-mono">
            {peakTension.toFixed(2)} <span className="text-sm font-normal text-slate-500">N</span>
          </div>
        </div>

        {/* Peak Compression */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <ArrowDown className="w-3.5 h-3.5 text-purple-500" /> Peak Compression (-)
          </span>
          <div className="text-2xl lg:text-3xl font-extrabold text-slate-800 font-mono">
            {peakCompression.toFixed(2)} <span className="text-sm font-normal text-slate-500">N</span>
          </div>
        </div>
      </div>

      {/* Main Graph & Control Section */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Real-time Curve Card */}
        <div className="xl:col-span-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Bidirectional Force vs. Displacement Curve
            </h3>
            <span className="text-xs text-slate-400 font-mono">Real-time sampling</span>
          </div>

          <div className="h-96 w-full">
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Action Controls Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 text-base pb-3 border-b border-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              Test Controls
            </h3>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleStart}
                disabled={isRunning}
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Start TC Test</span>
              </button>

              <button
                type="button"
                onClick={handleStop}
                disabled={!isRunning}
                className="w-full py-4 px-6 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-2xl font-bold shadow-lg shadow-red-500/25 transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Square className="w-5 h-5 fill-current" />
                <span>Stop Test</span>
              </button>

              <button
                type="button"
                onClick={handleTare}
                disabled={isTare}
                className="w-full py-3.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98"
              >
                <Scale className="w-5 h-5" />
                <span>{isTare ? 'Taring Load Cell...' : 'Tare (Zero)'}</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3.5 px-6 border-2 border-slate-200 hover:border-slate-300 text-slate-600 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98"
              >
                <RotateCcw className="w-5 h-5" />
                <span>Reset Curve</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs text-slate-500 space-y-1">
            <span className="font-bold text-slate-700 block">TC Operation Note:</span>
            <span>Applies cyclic tensile displacement followed by compressive reversal across the configured gauge limit.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TCTest;

