import React from 'react';
import { PlayCircle, FileText, Settings, Activity } from 'lucide-react';

export default function MainMenu({ onNavigate }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-[#E9EEF1]">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Left Action Card */}
        <div className="md:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 flex flex-col gap-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-2">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#00509E] flex items-center justify-center font-bold">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase">Operations</h2>
              <p className="text-xs text-slate-400">Select operation to proceed</p>
            </div>
          </div>

          <button
            onClick={() => onNavigate('process')}
            className="w-full h-14 bg-[#00509E] hover:bg-[#003F7F] active:scale-[0.99] text-white font-bold text-lg rounded-lg transition-all shadow-sm flex items-center justify-center gap-3"
          >
            <PlayCircle className="w-5 h-5" />
            <span>Process Mode</span>
          </button>

          <button
            onClick={() => onNavigate('logs')}
            className="w-full h-14 bg-[#00509E] hover:bg-[#003F7F] active:scale-[0.99] text-white font-bold text-lg rounded-lg transition-all shadow-sm flex items-center justify-center gap-3"
          >
            <FileText className="w-5 h-5" />
            <span>Show Process Logs</span>
          </button>

          <button
            onClick={() => onNavigate('settings')}
            className="w-full h-14 bg-[#00509E] hover:bg-[#003F7F] active:scale-[0.99] text-white font-bold text-lg rounded-lg transition-all shadow-sm flex items-center justify-center gap-3"
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Right Info Section */}
        <div className="md:col-span-7 flex flex-col justify-center pl-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-100 text-[#308DC2] text-xs font-semibold rounded-full w-fit mb-3">
            <span>Precision Material Diagnostics</span>
          </div>
          <h1 className="text-5xl font-extrabold text-[#2F2F2F] tracking-tight mb-1">
            UTM
          </h1>
          <h2 className="text-2xl font-bold text-[#308DC2] mb-5">
            Universal Testing Machine
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed text-justify bg-white/50 backdrop-blur-sm p-5 rounded-xl border border-slate-200/60 shadow-xs">
            A Universal Testing Machine (UTM) is a computer-controlled device used to test the mechanical
            properties of materials by applying tension, compression, or bending forces. It measures force and
            displacement to determine properties like tensile strength, yield strength, and elasticity for quality
            control and material analysis.
          </p>
        </div>
      </div>
    </div>
  );
}

