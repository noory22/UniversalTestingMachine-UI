import React, { useState } from 'react';
import { Sliders, Activity, Send, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsScreen({ connectionStatus, telemetry, onError }) {
  const [weightValue, setWeightValue] = useState(100);
  const [currentMode, setCurrentMode] = useState('Normal');
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', text: string }
  const [sending, setSending] = useState(false);

  const isConnected = connectionStatus.connected;

  const showFeedback = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleSendWeight = async () => {
    if (!isConnected) {
      showFeedback('error', 'Not connected to PLC or error writing register.');
      return;
    }
    const val = parseInt(weightValue, 10);
    if (isNaN(val) || val < 0 || val > 1000) {
      showFeedback('error', 'Weight parameter must be between 0 and 1000.');
      return;
    }

    try {
      setSending(true);
      const res = await window.api.sendWeight(val);
      if (res.success) {
        showFeedback('success', `Weight parameter ${val} sent to register R102!`);
      } else {
        showFeedback('error', res.message || 'Error writing register.');
      }
    } catch (e) {
      showFeedback('error', e.message);
    } finally {
      setSending(false);
    }
  };

  const handleSetMode = async (mode) => {
    if (!isConnected) {
      showFeedback('error', 'Not connected to PLC!');
      return;
    }

    setCurrentMode(mode);
    try {
      if (mode === 'Normal') {
        const res = await window.api.activateNormal();
        if (res.success) {
          showFeedback('success', 'Normal mode (M100) triggered');
        }
      } else if (mode === 'Tare') {
        const res = await window.api.setCalibrateMode('tare');
        if (res.success) {
          showFeedback('success', 'Tare mode (M101) triggered');
        }
      } else if (mode === 'Calibrate') {
        const res = await window.api.setCalibrateMode('calibrate');
        if (res.success) {
          showFeedback('success', 'Calibration mode (M102) active');
        }
      }
    } catch (e) {
      showFeedback('error', e.message);
    }
  };

  const realTimeForce = isConnected && telemetry?.force !== undefined ? Number(telemetry.force).toFixed(3) : '--';
  const rawForceVal = isConnected && telemetry?.r100 !== undefined ? telemetry.r100 : '--';
  const plcRealtimeVal = isConnected && telemetry?.r101 !== undefined ? telemetry.r101 : '--';

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 bg-[#F8FAFC] overflow-y-auto">
      {/* Header Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <span className="text-[#3B82F6] text-xs font-bold tracking-widest uppercase">
          ⚙ CALIBRATION UTILITY
        </span>
        <h1 className="text-2xl font-extrabold text-[#0F172A] mt-1 mb-1">
          Load Cell Calibration
        </h1>
        <p className="text-xs text-slate-500">
          Configure load cell calibration inputs and monitor real-time force register telemetry.
        </p>

        {feedback && (
          <div
            className={`mt-3 p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Cards Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
        {/* Left Card: Calibration Parameters */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-6 flex flex-col gap-5 shadow-xs">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <span className="text-lg text-[#3B82F6]">🎛</span>
            <h2 className="text-base font-bold text-[#0F172A]">Calibration Parameters</h2>
          </div>

          {/* Weight Range Section */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-700">
              🔒 Weight Range (0-1000)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                max="1000"
                value={weightValue}
                onChange={(e) => setWeightValue(e.target.value)}
                className="flex-1 h-11 px-3 rounded-lg border border-slate-300 text-sm font-mono text-slate-800 focus:outline-hidden focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]"
              />
              <button
                onClick={handleSendWeight}
                disabled={sending}
                className="h-11 px-6 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] active:bg-[#4338CA] text-white font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
              </button>
            </div>
          </div>

          {/* Input Mode Selection */}
          <div className="flex flex-col gap-2 pt-2">
            <label className="text-xs font-semibold text-slate-700">
              🎛 Input Mode Selection
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['Normal', 'Tare', 'Calibrate'].map((mode) => {
                const isActive = currentMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => handleSetMode(mode)}
                    className={`h-11 rounded-lg text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-[#EFF6FF] border-2 border-[#3B82F6] text-[#2563EB] shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-500">Current:</span>
              <span className="text-xs font-bold bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded border border-slate-200">
                {currentMode}
              </span>
            </div>
          </div>
        </div>

        {/* Right Card: Live Calibration Reads */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-6 flex flex-col gap-4 shadow-xs">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <span className="text-lg text-[#10B981]">📈</span>
            <h2 className="text-base font-bold text-[#0F172A]">Live Calibration Reads</h2>
          </div>

          {/* Metric 1: Real-time Force */}
          <div className="h-14 bg-[#F8FAFC] border border-slate-200/80 rounded-lg px-4 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 tracking-wider">REAL-TIME FORCE (R14)</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold font-mono text-[#10B981]">{realTimeForce}</span>
              <span className="text-xs font-bold text-slate-400">mN</span>
            </div>
          </div>

          {/* Metric 2: Raw Force Value */}
          <div className="h-14 bg-[#F8FAFC] border border-slate-200/80 rounded-lg px-4 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 tracking-wider">RAW FORCE VALUE (R100)</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold font-mono text-[#2563EB]">{rawForceVal}</span>
              <span className="text-xs font-bold text-slate-400">g</span>
            </div>
          </div>

          {/* Metric 3: PLC Real-time Value */}
          <div className="h-14 bg-[#F8FAFC] border border-slate-200/80 rounded-lg px-4 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 tracking-wider">PLC REAL-TIME VALUE (R101)</span>
            <span className="text-xl font-bold font-mono text-[#D97706]">{plcRealtimeVal}</span>
          </div>

          <div className="mt-auto p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Telemetry updates continuously when connected at 500ms intervals.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

