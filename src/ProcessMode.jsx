import React, { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Play, Square, RotateCcw, Scale } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function ProcessMode({ connectionStatus, telemetry, processState, onError }) {
  const [dataPoints, setDataPoints] = useState([]); // [{ distance, force }]
  const [actionLoading, setActionLoading] = useState(false);
  const chartRef = useRef(null);

  const isConnected = connectionStatus.connected;
  const isRunning = processState.processRunning;
  const isTearActive = processState.tearActive;
  const isRegZReady = processState.regZ === 1;

  // Append new telemetry to chart if process is running
  useEffect(() => {
    if (isRunning && !isTearActive && telemetry) {
      setDataPoints((prev) => {
        const next = [...prev, { distance: telemetry.distance, force: telemetry.force }];
        // Limit to last 1000 points as in Python UTM
        return next.length > 1000 ? next.slice(-1000) : next;
      });
    }
  }, [telemetry, isRunning, isTearActive]);

  const handleStart = async () => {
    if (!isConnected) {
      onError('Not connected to PLC!');
      return;
    }
    if (!isRegZReady) {
      onError('Cannot start process: REG_Z is not 1!');
      return;
    }

    try {
      setActionLoading(true);
      setDataPoints([]); // Clear previous run chart data
      const res = await window.api.startProcess();
      if (!res.success) {
        onError(res.message || 'Failed to start process');
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setActionLoading(true);
      const res = await window.api.stopProcess();
      if (!res.success && res.message) {
        onError(res.message);
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      setActionLoading(true);
      setDataPoints([]); // Clear real-time graph
      const res = await window.api.resetProcess();
      if (!res.success && res.message) {
        onError(res.message);
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTare = async () => {
    if (!isConnected) {
      onError('Not connected to PLC!');
      return;
    }
    try {
      setActionLoading(true);
      const res = await window.api.activateTare();
      if (!res.success && res.message) {
        onError(res.message);
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Chart configuration
  const chartData = {
    datasets: [
      {
        label: 'Real-time Data',
        data: dataPoints.map((pt) => ({ x: pt.distance, y: pt.force })),
        borderColor: '#0037FF',
        backgroundColor: '#0037FF',
        borderWidth: 2.5,
        pointRadius: dataPoints.length > 150 ? 2 : 4,
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
          font: { weight: 'bold', size: 12 },
          color: '#334155',
        },
        grid: { color: '#e2e8f0' },
      },
      y: {
        title: {
          display: true,
          text: 'Force (mN)',
          font: { weight: 'bold', size: 12 },
          color: '#334155',
        },
        grid: { color: '#e2e8f0' },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { font: { weight: 'bold' } },
      },
      title: {
        display: true,
        text: 'Force vs Distance - Real Time',
        font: { size: 14, weight: 'bold' },
        color: '#0f172a',
      },
    },
  };

  const displayDistance = isTearActive ? '--' : isRunning && dataPoints.length === 0 ? 'Reading...' : (telemetry?.distance ?? 0);
  const displayForce = isTearActive ? '--' : isRunning && dataPoints.length === 0 ? 'Reading...' : (telemetry?.force !== undefined ? Number(telemetry.force).toFixed(3) : '0.000');

  const canStart = isConnected && !isRunning && !isTearActive && isRegZReady;
  const canStop = isRunning;
  const canReset = isConnected;
  const canTare = isConnected && !isTearActive;

  return (
    <div className="flex-1 flex flex-col p-4 gap-3 bg-[#E9EEF1] overflow-hidden">
      {/* Real-time Graph Box */}
      <div className="flex-1 bg-white rounded-xl shadow-xs border border-slate-200/90 p-3 min-h-[300px]">
        <div className="w-full h-full">
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Bottom Controls & Readout Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Distance Readout Box */}
        <div className="md:col-span-3 bg-white rounded-xl border border-slate-200/80 p-3 flex items-center justify-between shadow-xs">
          <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">Distance</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-[#28a745] font-mono">{displayDistance}</span>
            <span className="text-xs font-bold text-slate-500">mm</span>
          </div>
        </div>

        {/* Force Readout Box */}
        <div className="md:col-span-3 bg-white rounded-xl border border-slate-200/80 p-3 flex items-center justify-between shadow-xs">
          <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">Force</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-[#00509E] font-mono">{displayForce}</span>
            <span className="text-xs font-bold text-slate-500">mN</span>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="md:col-span-6 grid grid-cols-4 gap-2">
          {/* Tare */}
          <button
            onClick={handleTare}
            disabled={!canTare || actionLoading}
            className={`h-13 rounded-lg font-bold text-sm tracking-wide text-white transition-all shadow-xs flex items-center justify-center gap-1.5 ${
              canTare
                ? 'bg-[#ffc107] hover:bg-[#e0a800] active:scale-[0.98]'
                : 'bg-amber-200 cursor-not-allowed opacity-60'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>{isTearActive ? 'Tear Active...' : 'TARE'}</span>
          </button>

          {/* Start */}
          <button
            onClick={handleStart}
            disabled={!canStart || actionLoading}
            className={`h-13 rounded-lg font-bold text-base tracking-wide text-white transition-all shadow-xs flex items-center justify-center gap-1.5 ${
              canStart
                ? 'bg-[#28a745] hover:bg-[#218838] active:scale-[0.98]'
                : 'bg-[#A5D6A7] cursor-not-allowed'
            }`}
          >
            <Play className="w-4 h-4 fill-white" />
            <span>START</span>
          </button>

          {/* Emergency Stop */}
          <button
            onClick={handleStop}
            disabled={!canStop || actionLoading}
            className={`h-13 rounded-lg font-bold text-sm tracking-wide text-white transition-all shadow-xs flex items-center justify-center gap-1.5 ${
              canStop
                ? 'bg-[#dc3545] hover:bg-[#c82333] active:scale-[0.98]'
                : 'bg-red-200 cursor-not-allowed opacity-50'
            }`}
          >
            <Square className="w-4 h-4 fill-white" />
            <span>STOP</span>
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            disabled={!canReset || actionLoading}
            className={`h-13 rounded-lg font-bold text-sm tracking-wide text-white transition-all shadow-xs flex items-center justify-center gap-1.5 ${
              canReset
                ? 'bg-[#dc3545] hover:bg-[#c82333] active:scale-[0.98]'
                : 'bg-red-200 cursor-not-allowed opacity-50'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>RESET</span>
          </button>
        </div>
      </div>
    </div>
  );
}

