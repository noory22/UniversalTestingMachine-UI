import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  ChevronLeft,
  ArrowLeft,
  Usb,
  Power,
  RefreshCw,
} from 'lucide-react';
import { navigationGroups, pageTitles } from './navigation.js';

const AppShell = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showPowerDropdown, setShowPowerDropdown] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [powerActive, setPowerActive] = useState(false);
  const dropdownRef = useRef(null);

  const [telemetry, setTelemetry] = useState({
    distance: 0,
    force: 0,
    processRunning: false,
    compressionRunning: false,
    manualModeActive: false,
  });

  // Poll connection & telemetry
  useEffect(() => {
    let unsubTelemetry = () => {};
    let unsubConnection = () => {};

    if (window.api) {
      if (window.api.getConnectionStatus) {
        window.api.getConnectionStatus().then((st) => {
          if (st && st.connected) {
            setConnectionStatus('connected');
            setPowerActive(true);
          }
        }).catch(() => {});
      }

      if (window.api.onConnectionStatus) {
        unsubConnection = window.api.onConnectionStatus((st) => {
          setConnectionStatus(st && st.connected ? 'connected' : 'disconnected');
          setPowerActive(Boolean(st && st.connected));
        });
      }

      if (window.api.onTelemetry) {
        unsubTelemetry = window.api.onTelemetry((data) => {
          if (data) {
            setTelemetry({
              distance: typeof data.distance === 'number' ? data.distance : 0,
              force: typeof data.force === 'number' ? data.force : 0,
              processRunning: Boolean(data.processRunning),
              compressionRunning: Boolean(data.compressionRunning),
              manualModeActive: Boolean(data.manualModeActive),
            });
          }
        });
      }
    }

    // Periodic check
    const pollInterval = setInterval(async () => {
      if (window.api && window.api.readData) {
        try {
          const res = await window.api.readData();
          if (res && res.success) {
            setConnectionStatus(res.connected ? 'connected' : 'disconnected');
            setPowerActive(Boolean(res.connected));
            setTelemetry((prev) => ({
              ...prev,
              distance: typeof res.distance === 'number' ? res.distance : prev.distance,
              force: typeof res.force === 'number' ? res.force : prev.force,
            }));
          }
        } catch (e) {}
      }
    }, 1000);

    return () => {
      unsubTelemetry();
      unsubConnection();
      clearInterval(pollInterval);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowPowerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    } catch (err) {
      console.error('Reconnect error:', err);
    }
  };

  const handleUpdateCheck = async () => {
    try {
      window.dispatchEvent(new CustomEvent('manual-check-triggered'));
      if (window.api && window.api.checkForUpdates) {
        await window.api.checkForUpdates();
      }
    } catch (err) {
      console.error('Update check error:', err);
    }
  };

  const handleExit = () => {
    if (window.confirm('Are you sure you want to exit UTM?')) {
      if (window.api && window.api.closeApp) {
        window.api.closeApp();
      } else {
        window.close();
      }
    }
    setShowPowerDropdown(false);
  };

  const isDashboard = location.pathname === '/' || location.pathname === '';
  const currentTitle = pageTitles[location.pathname] || 'Universal Testing Machine';

  // Mode badge detector
  const getActiveModeInfo = () => {
    if (location.pathname.includes('process-mode')) {
      return { label: 'Tensile Test', color: 'bg-blue-600 text-white' };
    }
    if (location.pathname.includes('compression-test')) {
      return { label: 'Compression Test', color: 'bg-purple-600 text-white' };
    }
    if (location.pathname.includes('tc-test')) {
      return { label: 'TC Test Mode', color: 'bg-indigo-600 text-white' };
    }
    if (location.pathname.includes('manual-mode')) {
      return { label: 'Manual Mode', color: 'bg-amber-600 text-white' };
    }
    if (location.pathname.includes('settings')) {
      return { label: 'Calibration', color: 'bg-cyan-600 text-white' };
    }
    return { label: 'UTM System', color: 'bg-slate-700 text-slate-200' };
  };

  const activeMode = getActiveModeInfo();
  const isRunning = telemetry.processRunning || telemetry.compressionRunning;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 select-none overflow-x-hidden">
      <div className="flex min-h-screen">
        {/* ========================================================= */}
        {/* COLLAPSIBLE SIDEBAR                                       */}
        {/* ========================================================= */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } fixed inset-y-0 left-0 z-40 border-r border-slate-800 bg-slate-950 text-white transition-all duration-300 lg:sticky lg:top-0 ${
            sidebarCollapsed ? 'w-20' : 'w-72'
          } lg:translate-x-0 flex flex-col justify-between`}
        >
          <div className="flex flex-col h-full overflow-hidden">
            {/* Sidebar Brand Header */}
            <div className="flex h-16 items-center border-b border-slate-800/80 px-4 justify-between shrink-0">
              {sidebarCollapsed ? (
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-black tracking-widest text-blue-400">UTM</span>
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Expand Sidebar"
                  >
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                      UTM PLATFORM
                    </span>
                    <h1 className="text-sm font-bold truncate text-slate-100">
                      Universal Testing Machine
                    </h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(true)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ml-2"
                    title="Collapse Sidebar"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* Mobile Close Button */}
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-slate-400 hover:text-white ml-2 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Groups */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin">
              {navigationGroups.map((group, gIdx) => (
                <div key={gIdx} className="space-y-1">
                  {!sidebarCollapsed && group.title && (
                    <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {group.title}
                    </div>
                  )}
                  {sidebarCollapsed && (
                    <div className="my-2 border-t border-slate-800 mx-2" />
                  )}

                  <div className="space-y-1">
                    {group.items.map((item, idx) => {
                      const Icon = item.icon;
                      const isActive =
                        location.pathname === item.path ||
                        (item.testPath && location.pathname === item.testPath);

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (item.action === 'manual' && window.api && window.api.manual) {
                              window.api.manual().catch((e) => console.error(e));
                            }
                            if (item.mode === 'compression' && window.api && window.api.enterCompressionMode) {
                              window.api.enterCompressionMode().catch((e) => console.error(e));
                            }
                            navigate(item.path);
                            setSidebarOpen(false);
                          }}
                          className={`flex items-center gap-3.5 w-full rounded-xl py-2.5 text-sm font-medium transition-all cursor-pointer ${
                            sidebarCollapsed ? 'justify-center px-0' : 'px-3'
                          } ${
                            isActive
                              ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/30'
                              : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                          }`}
                          title={sidebarCollapsed ? item.label : ''}
                        >
                          <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          {!sidebarCollapsed && (
                            <span className="truncate">{item.label}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Sidebar Bottom: Check for Updates */}
            <div className="border-t border-slate-800 p-3 shrink-0">
              <button
                type="button"
                onClick={handleUpdateCheck}
                className={`flex items-center gap-3 w-full rounded-xl py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer ${
                  sidebarCollapsed ? 'justify-center px-0' : 'px-3'
                }`}
                title={sidebarCollapsed ? 'Check for Updates' : ''}
              >
                <RefreshCw className="w-5 h-5 shrink-0 text-slate-400" />
                {!sidebarCollapsed && <span>Check for Updates</span>}
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Backdrop */}
        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-xs lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}

        {/* ========================================================= */}
        {/* MAIN APPLICATION CONTAINER                                */}
        {/* ========================================================= */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Sticky Top Header */}
          <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 px-4 lg:px-8 py-3.5 shadow-xs backdrop-blur-md flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile Menu Toggle */}
              <button
                type="button"
                className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Global Back Button */}
              {!isDashboard && (
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  title="Return to Dashboard"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}

              {/* Page Title */}
              <h2 className="text-lg lg:text-xl font-bold text-slate-800 truncate">
                {currentTitle}
              </h2>
            </div>

            {/* Central Hardware Status Chips (Desktop) */}
            <div className="hidden xl:flex items-center gap-4">
              {/* Active Mode Pill */}
              <div className={`px-3 py-1 rounded-lg text-xs font-bold ${activeMode.color} shadow-xs`}>
                {activeMode.label}
              </div>

              {/* Machine Run Status */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 text-xs font-bold text-slate-700">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRunning ? 'bg-blue-600 animate-pulse' : 'bg-green-500'
                  }`}
                />
                <span>{isRunning ? 'RUNNING' : 'READY'}</span>
              </div>

              {/* Live Distance Readout */}
              <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 min-w-[90px]">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Distance</span>
                <span className="text-xs font-bold text-slate-800 font-mono">
                  {telemetry.distance.toFixed(2)} mm
                </span>
              </div>

              {/* Live Force Readout */}
              <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 min-w-[90px]">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Force</span>
                <span className="text-xs font-bold text-blue-600 font-mono">
                  {telemetry.force.toFixed(3)} N
                </span>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-3">
              {/* USB Status */}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  connectionStatus === 'connected'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                <Usb className="w-4 h-4" />
                <span>{connectionStatus === 'connected' ? 'USB Connected' : 'USB Disconnected'}</span>
              </div>

              {/* Reconnect Button */}
              {connectionStatus === 'disconnected' && (
                <button
                  type="button"
                  onClick={handleReconnect}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Reconnect
                </button>
              )}

              {/* Power / Exit Application */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowPowerDropdown((prev) => !prev)}
                  className="p-2 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors cursor-pointer"
                  title="Power Options"
                >
                  <Power className="w-5 h-5" />
                </button>

                {showPowerDropdown && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl z-50">
                    <button
                      type="button"
                      onClick={handleExit}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Power className="w-4 h-4" />
                      Exit Application
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Routed Page Content Outlet */}
          <main className="min-w-0 flex-1 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default AppShell;

