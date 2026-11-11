import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Database,
  Layers,
  Activity,
  Play,
  FileText,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Gauge,
  Zap,
  TrendingUp,
  FilePlus,
  RotateCcw,
} from 'lucide-react';

const MainMenu = () => {
  const navigate = useNavigate();

  const [configs, setConfigs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeConfig, setActiveConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);

  const [telemetry, setTelemetry] = useState({
    distance: 0,
    force: 0,
    connected: false,
    processRunning: false,
    compressionRunning: false,
    manualModeActive: false,
  });

  // Load Configurations, Logs, and LocalStorage
  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // 1. Saved Configurations across Tensile, Compression, TC
      if (window.api && window.api.readConfigFile) {
        const [tensileList, compList, tcList] = await Promise.all([
          window.api.readConfigFile('tensile').catch(() => []),
          window.api.readConfigFile('compression').catch(() => []),
          window.api.readConfigFile('tc').catch(() => []),
        ]);

        const combined = [
          ...(Array.isArray(tensileList) ? tensileList.map((c) => ({ ...c, testType: 'tensile' })) : []),
          ...(Array.isArray(compList) ? compList.map((c) => ({ ...c, testType: 'compression' })) : []),
          ...(Array.isArray(tcList) ? tcList.map((c) => ({ ...c, testType: 'tc' })) : []),
        ];
        setConfigs(combined);
      }

      // 2. CSV Logs
      if (window.api && (window.api.listCsvLogs || window.api.getLogFiles)) {
        const fetchLogs = window.api.listCsvLogs || window.api.getLogFiles;
        const res = await fetchLogs();
        if (res && res.success && Array.isArray(res.files)) {
          setLogs(res.files);
        } else if (Array.isArray(res)) {
          setLogs(res);
        }
      }

      // 3. Stored Active Config
      const savedStored = localStorage.getItem('selectedConfig');
      if (savedStored) {
        try {
          setActiveConfig(JSON.parse(savedStored));
        } catch (e) {
          console.warn('Failed parsing stored selectedConfig', e);
        }
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

    // Telemetry & connection listeners
    let unsubTelemetry = () => {};
    let unsubConnection = () => {};

    if (window.api) {
      if (window.api.getConnectionStatus) {
        window.api.getConnectionStatus().then((st) => {
          if (st && st.connected) {
            setTelemetry((prev) => ({ ...prev, connected: true }));
          }
        }).catch(() => {});
      }

      if (window.api.onConnectionStatus) {
        unsubConnection = window.api.onConnectionStatus((st) => {
          setTelemetry((prev) => ({ ...prev, connected: Boolean(st && st.connected) }));
        });
      }

      if (window.api.onTelemetry) {
        unsubTelemetry = window.api.onTelemetry((data) => {
          if (data) {
            setTelemetry((prev) => ({
              ...prev,
              distance: typeof data.distance === 'number' ? data.distance : prev.distance,
              force: typeof data.force === 'number' ? data.force : prev.force,
              processRunning: Boolean(data.processRunning),
              compressionRunning: Boolean(data.compressionRunning),
              manualModeActive: Boolean(data.manualModeActive),
            }));
          }
        });
      }
    }

    return () => {
      unsubTelemetry();
      unsubConnection();
    };
  }, []);

  // Handle direct "Load & Run" for a configuration
  const handleStartTest = async (cfg) => {
    if (!cfg) return;
    setIsApplying(true);
    try {
      const type = (cfg.testType || 'tensile').toLowerCase();
      let res = null;

      if (type === 'tensile' && window.api && window.api.sendTensileConfig) {
        res = await window.api.sendTensileConfig(cfg);
      } else if (type === 'compression' && window.api && window.api.sendCompressionConfig) {
        res = await window.api.sendCompressionConfig(cfg);
      } else if (type === 'tc' && window.api && window.api.sendTcConfig) {
        res = await window.api.sendTcConfig(cfg);
      } else if (window.api && window.api.sendProcessMode) {
        res = await window.api.sendProcessMode(cfg);
      }

      if (res && !res.success) {
        alert(res.message || 'Failed to dispatch configuration to PLC');
        setIsApplying(false);
        return;
      }

      localStorage.setItem('selectedConfig', JSON.stringify(cfg));
      setActiveConfig(cfg);

      if (type === 'tensile') {
        navigate('/process-mode');
      } else if (type === 'compression') {
        navigate('/compression-test');
      } else {
        navigate('/tc-test');
      }
    } catch (err) {
      console.error('Failed to send configuration to PLC:', err);
      alert('Failed to send configuration to PLC: ' + (err.message || 'Unknown error'));
    } finally {
      setIsApplying(false);
    }
  };

  const isMachineRunning = telemetry.processRunning || telemetry.compressionRunning;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto select-none">
      {/* Top Banner / Welcome Card */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>Machine Analytics & Diagnostics</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Universal Testing Machine Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time telemetry, configuration archives, and test execution analytics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadDashboardData}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer border border-slate-200"
            title="Refresh dashboard metrics"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate('/create-config')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-xs cursor-pointer"
          >
            <FilePlus className="w-3.5 h-3.5" />
            New Config
          </button>
        </div>
      </section>

      {/* Analytics KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Saved Configurations */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Configurations</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono">{configs.length}</span>
            <span className="text-xs text-slate-500 font-medium">Saved Profiles</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Managed in configurations.csv</p>
        </div>

        {/* Metric 2: Process Logs */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Historical Logs</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono">{logs.length}</span>
            <span className="text-xs text-slate-500 font-medium">Recorded Tests</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Archived in UTM Logs</p>
        </div>

        {/* Metric 3: Live Position */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Position (Displacement)</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono">
              {telemetry.distance.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 font-medium">mm</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Live high-speed encoder readout</p>
        </div>

        {/* Metric 4: Live Force */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Load Cell Force</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono">
              {telemetry.force.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 font-medium">gf</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">24-bit ADC Modbus synchronized</p>
        </div>
      </div>

      {/* Active / Loaded Configuration Spotlight */}
      <section className="bg-gradient-to-r from-blue-900 to-indigo-950 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 w-64 h-64 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-semibold text-blue-200">
              <Zap className="w-3 h-3 text-amber-400" />
              Active Loaded Test Profile
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              {activeConfig ? activeConfig.configName : 'No Active Configuration Selected'}
            </h2>
            <p className="text-xs md:text-sm text-blue-200/80 max-w-xl">
              {activeConfig
                ? `Ready for automated cycle test. Speed: ${activeConfig.speed} mm/s | Up: ${activeConfig.distanceUp} mm | Down: ${activeConfig.distanceDown} mm | Force Limit: ${activeConfig.force} gf | Cycles: ${activeConfig.cycles}`
                : 'Choose a configuration below to send parameters to PLC registers (R402-R406) and initiate tensile or compression tests.'}
            </p>
          </div>

          {activeConfig && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isApplying}
                onClick={() => handleStartTest(activeConfig, 'tensile')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Run Tensile Test
              </button>
              <button
                type="button"
                disabled={isApplying}
                onClick={() => handleStartTest(activeConfig, 'compression')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
              >
                <Layers className="w-3.5 h-3.5" />
                Run Compression Test
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Main Grid: Configurations Table (Left) & Recent Logs Table (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Saved Configurations Table (Span 2) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Saved Configurations</h3>
              <p className="text-xs text-slate-500">Profiles stored in CSV ready to load to registers R402-R406</p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-400">
              {configs.length} {configs.length === 1 ? 'Profile' : 'Profiles'}
            </span>
          </div>

          {configs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <Database className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold">No saved configurations found.</p>
              <p className="text-xs text-slate-400 mt-1">Click "New Config" to create test parameters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Type</th>
                    <th className="pb-3 font-semibold">Name</th>
                    <th className="pb-3 font-semibold">Speed (mm/s)</th>
                    <th className="pb-3 font-semibold">Parameters</th>
                    <th className="pb-3 font-semibold text-right">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {configs.map((cfg, idx) => {
                    const type = (cfg.testType || 'tensile').toLowerCase();
                    const typeBadge =
                      type === 'tensile'
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : type === 'compression'
                        ? 'bg-purple-100 text-purple-800 border-purple-200'
                        : 'bg-indigo-100 text-indigo-800 border-indigo-200';

                    const paramsDesc =
                      type === 'tc'
                        ? `Up: ${cfg.distanceUp || '-'}mm | Down: ${cfg.distanceDown || '-'}mm | Force: ${cfg.force || '-'}gf | ${cfg.cycles || 1}c`
                        : `Force Diff: ${cfg.forceDiff || cfg.force || '-'}gf | Height: ${cfg.height || '-'}mm`;

                    return (
                      <tr key={`${cfg.configName}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${typeBadge}`}>
                            {type}
                          </span>
                        </td>
                        <td className="py-3 font-bold text-slate-900 truncate max-w-[140px]">
                          {cfg.configName}
                        </td>
                        <td className="py-3 font-mono text-slate-600">{cfg.speed}</td>
                        <td className="py-3 font-mono text-slate-500 text-[11px] truncate max-w-[200px]">
                          {paramsDesc}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            disabled={isApplying}
                            onClick={() => handleStartTest(cfg)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            Start
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Process Logs (Span 1) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Recent Test Logs</h3>
              <p className="text-xs text-slate-500">Historical CSV exports</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/process-logs')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
            >
              View All <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold">No test logs recorded yet.</p>
              <p className="text-xs text-slate-400 mt-1">Run tests to generate process logs.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {logs.slice(0, 7).map((logItem, idx) => {
                const name = typeof logItem === 'string' ? logItem : logItem.name || `log_${idx}.csv`;
                const date = typeof logItem === 'object' && logItem.date ? logItem.date : 'Recent';
                return (
                  <div
                    key={`${name}-${idx}`}
                    className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{name}</p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {date}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/process-logs')}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      Inspect
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
