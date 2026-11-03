import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Power, Usb, Sliders, PlayCircle, FileText, Activity } from 'lucide-react';

const MainMenu = () => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [powerActive, setPowerActive] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check initial connection status
    const checkConnection = async () => {
      try {
        if (window.api && window.api.getConnectionStatus) {
          const status = await window.api.getConnectionStatus();
          setConnectionStatus(status && status.connected ? 'connected' : 'disconnected');
          setPowerActive(status && status.connected);
          setConnectionChecked(true);
        }
      } catch (err) {
        console.error('Failed to get connection status:', err);
        setConnectionStatus('disconnected');
        setConnectionChecked(true);
      }
    };

    checkConnection();

    // Listen for live connection updates
    let unsubConnection = () => {};
    if (window.api && window.api.onConnectionStatus) {
      unsubConnection = window.api.onConnectionStatus((status) => {
        setConnectionStatus(status && status.connected ? 'connected' : 'disconnected');
        setPowerActive(status && status.connected);
        setConnectionChecked(true);
      });
    }

    return () => {
      unsubConnection();
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

  const menuOptions = [
    {
      id: 'process-mode',
      title: 'Process Mode',
      icon: <PlayCircle className="w-8 h-8" />,
      description: 'Execute mechanical testing, view real-time curves, and control machine states',
      gradient: 'from-blue-500 to-cyan-500',
      path: '/process-mode',
    },
    {
      id: 'process-logs',
      title: 'Show Process Logs',
      icon: <FileText className="w-8 h-8" />,
      description: 'Inspect historical test curves, view data tables, and manage CSV logs',
      gradient: 'from-green-500 to-emerald-500',
      path: '/process-logs',
    },
    {
      id: 'settings',
      title: 'Settings & Calibration',
      icon: <Sliders className="w-8 h-8" />,
      description: 'Load cell calibration modes (Normal, Tare, Calibrate) and parameter registers',
      gradient: 'from-cyan-500 to-blue-500',
      path: '/settings',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 select-none overflow-x-hidden">
      {/* Header */}
      <header className="flex items-center px-6 py-4 bg-white/80 backdrop-blur-lg shadow-xl border-b border-gray-200/50 relative z-10">
        <div className="flex-1 flex items-center gap-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
            Main Menu
          </h1>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3 mr-4">
          {/* Power Status */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
              powerActive ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'
            }`}
          >
            <Power className={`w-4 h-4 ${powerActive ? 'text-green-700' : 'text-red-700'}`} />
            <span className={`text-sm font-medium ${powerActive ? 'text-green-700' : 'text-red-700'}`}>
              POWERED {powerActive ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* USB Status */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
              connectionStatus === 'connected' ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'
            }`}
          >
            <Usb className={`w-4 h-4 ${connectionStatus === 'connected' ? 'text-green-700' : 'text-red-700'}`} />
            <span className={`text-sm font-medium ${connectionStatus === 'connected' ? 'text-green-700' : 'text-red-700'}`}>
              {connectionStatus === 'connected' ? 'USB Connected' : 'USB Disconnected'}
            </span>
          </div>

          {connectionStatus === 'disconnected' && connectionChecked && (
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
          className="group bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl lg:rounded-2xl w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-xl border border-red-400/30 cursor-pointer"
        >
          <Power className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-8 py-10 xl:py-16 flex items-center justify-center">
        <div className="max-w-7xl w-full mx-auto">
          <div className="flex flex-col xl:flex-row gap-10 xl:gap-16 items-center">
            {/* Left Section - Menu Options */}
            <div className="w-full xl:flex-1 xl:max-w-2xl">
              <div className="mb-6">
                <p className="text-xl font-semibold text-gray-500">Select an option to continue</p>
              </div>

              <div className="grid gap-5">
                {menuOptions.map((option, index) => (
                  <button
                    key={option.id}
                    className={`group relative bg-white/70 backdrop-blur-sm border-2 rounded-2xl p-7 cursor-pointer transition-all duration-500 flex items-center gap-6 text-left shadow-xl hover:shadow-2xl transform hover:-translate-y-1 overflow-hidden border-gray-200/50 hover:border-blue-400/80 hover:bg-white/90 ${
                      selectedOption === option.id ? 'border-blue-400 bg-blue-50/80 shadow-blue-200/50' : ''
                    }`}
                    onClick={() => {
                      setSelectedOption(option.id);
                      navigate(option.path);
                    }}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    {/* Animated background gradient */}
                    <div
                      className={`absolute inset-0 bg-gradient-to-r ${option.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}
                    />

                    {/* Left accent line */}
                    <div
                      className={`absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b ${option.gradient} transition-all duration-500 transform scale-y-0 group-hover:scale-y-100 origin-top ${
                        selectedOption === option.id ? 'scale-y-100' : ''
                      }`}
                    />

                    {/* Icon container */}
                    <div
                      className={`relative w-16 h-16 flex items-center justify-center rounded-xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700 group-hover:from-blue-100 group-hover:to-indigo-200 group-hover:text-blue-600 ${
                        selectedOption === option.id ? 'scale-110 rotate-3' : ''
                      }`}
                    >
                      {option.icon}
                      <div
                        className={`absolute inset-0 rounded-xl bg-gradient-to-br ${option.gradient} opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-sm`}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3
                        className={`text-2xl font-bold transition-colors duration-300 text-gray-800 group-hover:text-blue-800 ${
                          selectedOption === option.id ? 'text-blue-800' : ''
                        }`}
                      >
                        {option.title}
                      </h3>
                      <p className="text-gray-600 leading-relaxed text-sm mt-1 group-hover:text-gray-700 transition-colors duration-300">
                        {option.description}
                      </p>
                    </div>

                    {/* Arrow */}
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-500 transform bg-blue-100 text-blue-600 group-hover:bg-blue-200 group-hover:translate-x-2 group-hover:scale-110 ${
                        selectedOption === option.id ? 'translate-x-2 scale-110' : ''
                      }`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="transition-transform duration-300 group-hover:scale-125">
                        <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Section - Product Hero Card */}
            <div className="w-full xl:flex-1 xl:max-w-xl flex xl:justify-center">
              <div className="bg-white/60 backdrop-blur-lg rounded-3xl p-10 shadow-2xl border border-white/30 w-full">
                <div className="mb-6">
                  <h1 className="text-8xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent mb-3 tracking-tight leading-none">
                    UTM
                  </h1>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent leading-tight">
                    Universal Testing Machine
                  </h2>
                </div>

                <p className="text-gray-700 text-base leading-relaxed mb-6 font-medium">
                  A high-precision testing device engineered for evaluating the mechanical properties of materials under tensile, compression, and cyclic stress.
                </p>

                <p className="text-gray-600 text-sm leading-relaxed border-t border-gray-200/60 pt-4">
                  Delivers real-time force vs displacement plotting, sub-millinewton load-cell accuracy, synchronized Modbus telemetry, and automatic test data archiving.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-4 bg-white/90 backdrop-blur-xl border-t border-gray-200/50 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-center max-w-7xl mx-auto gap-2">
          <p className="text-gray-500 text-sm">Copyright 2026 © Revive Medical Technologies Inc.</p>
          <span className="text-xs sm:text-sm text-gray-400 font-medium">Version 1.0.0</span>
        </div>
      </footer>
    </div>
  );
};

export default MainMenu;
