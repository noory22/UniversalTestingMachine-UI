import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Power,
  Usb,
  RotateCw,
  Move,
  Zap,
  ChevronUp,
  ChevronDown,
  Square,
  Activity,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

const Manual = () => {
  const navigate = useNavigate();

  // Telemetry Readings (D2 = Distance, R154 = Force 32-bit Float)
  const [distance, setDistance] = useState('--');
  const [force, setForce] = useState('--');

  // Control states matching CTTM-VD
  const [controls, setControls] = useState({
    motorUp: false,     // M11 (Up / Insertion)
    motorDown: false,   // M12 (Down / Retraction)
    homing: false,      // M13 (Homing)
    manualMode: true    // M10 (Manual Mode master)
  });

  // Hardware connection status
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    port: '--',
    lastCheck: null,
  });

  const [powerActive, setPowerActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [x1Active, setX1Active] = useState(false);

  // 1. Initial connection check and manual mode activation on mount
  useEffect(() => {
    let isMounted = true;

    const initManualMode = async () => {
      try {
        if (window.api && window.api.checkConnection) {
          const status = await window.api.checkConnection();
          if (isMounted) {
            const isConn = Boolean(status && status.connected);
            setConnectionStatus({
              connected: isConn,
              port: (status && status.port) || '--',
              lastCheck: new Date(),
            });
            setPowerActive(isConn);

            if (isConn && window.api.manual) {
              await window.api.manual();
              setControls((prev) => ({ ...prev, manualMode: true }));
            }
          }
        }
      } catch (err) {
        console.error('Failed to activate manual mode on mount:', err);
      }
    };

    initManualMode();

    // Listen for live connection updates
    let unsubConnection = () => {};
    if (window.api && window.api.onConnectionStatus) {
      unsubConnection = window.api.onConnectionStatus((status) => {
        if (!isMounted) return;
        const isConn = Boolean(status && status.connected);
        setConnectionStatus({
          connected: isConn,
          port: (status && status.port) || '--',
          lastCheck: new Date(),
        });
        setPowerActive(isConn);
      });
    }

    // Fast-path real-time telemetry stream from coordinator loop
    let unsubTelemetry = () => {};
    if (window.api && window.api.onTelemetry) {
      unsubTelemetry = window.api.onTelemetry((data) => {
        if (!isMounted || !data) return;

        // Distance from D2 (6002)
        if (data.manualDistance !== undefined) {
          setDistance(data.manualDistance);
        } else if (data.distance !== undefined) {
          setDistance(data.distance);
        }

        // Force from R154 (154)
        if (data.manualForce !== undefined) {
          setForce(data.manualForce);
        } else if (data.force !== undefined) {
          setForce(data.force);
        }

        const isX1 = data.x1 !== undefined ? Boolean(data.x1) : false;
        if (data.x1 !== undefined) {
          setX1Active(isX1);
        }

        // Hardware state synchronization
        setControls((prev) => ({
          ...prev,
          motorUp: data.motorUp !== undefined ? Boolean(data.motorUp) : prev.motorUp,
          motorDown: isX1 ? false : (data.motorDown !== undefined ? Boolean(data.motorDown) : prev.motorDown),
          homing: isX1 ? false : (data.homing !== undefined ? Boolean(data.homing) : prev.homing),
          manualMode: data.manualModeActive !== undefined ? Boolean(data.manualModeActive) : prev.manualMode,
        }));
      });
    }

    // Periodic readData fallback matching CTTM-VD (every 500ms)
    const readInterval = setInterval(() => {
      if (window.api && window.api.readData) {
        window.api.readData()
          .then((data) => {
            if (!isMounted || !data) return;
            if (data.manualDistance !== undefined) setDistance(data.manualDistance);
            if (data.manualForce !== undefined) setForce(data.manualForce);
            const isX1 = data.x1 !== undefined ? Boolean(data.x1) : false;
            if (data.x1 !== undefined) {
              setX1Active(isX1);
            }
            setControls((prev) => ({
              ...prev,
              motorUp: data.motorUp !== undefined ? Boolean(data.motorUp) : (data.insertion !== undefined ? Boolean(data.insertion) : prev.motorUp),
              motorDown: isX1 ? false : (data.motorDown !== undefined ? Boolean(data.motorDown) : (data.retraction !== undefined ? Boolean(data.retraction) : prev.motorDown)),
              homing: isX1 ? false : (data.homing !== undefined ? Boolean(data.homing) : prev.homing),
              manualMode: data.manualMode !== undefined ? Boolean(data.manualMode) : prev.manualMode,
            }));
          })
          .catch((err) => {
            console.warn('Periodic readData error (non-fatal):', err.message);
          });
      }
    }, 500);

    // Clean unmount: Stop movement & turn OFF manual coils
    return () => {
      isMounted = false;
      clearInterval(readInterval);
      unsubConnection();
      unsubTelemetry();

      if (window.api && window.api.disableManualMode) {
        window.api.disableManualMode().catch((err) => {
          console.error('Error disabling manual mode on unmount:', err);
        });
      }
    };
  }, []);

  // Handle Motor Up (M11) - Toggle behavior with mutual exclusivity (CTTM-VD logic)
  const handleMotorUp = () => {
    if (!connectionStatus.connected) {
      alert('PLC is not connected. Please connect to PLC first.');
      return;
    }

    // If Motor Up is currently active in UI, turn it OFF
    if (controls.motorUp) {
      console.log('Attempting to STOP Motor Up (M11)...');
      window.api.motorUp()
        .then((result) => {
          console.log('Motor Up stop result:', result);
          setControls((prev) => ({
            ...prev,
            motorUp: false,
            motorDown: false,
          }));
        })
        .catch((error) => {
          console.error('Motor Up stop error:', error);
          setErrorMessage(error.message || 'Failed to stop Motor Up');
        });
    }
    // If Motor Up is not active AND Motor Down is not active, turn it ON
    else if (!controls.motorDown) {
      console.log('Attempting to START Motor Up (M11)...');
      window.api.motorUp()
        .then((result) => {
          console.log('Motor Up start result:', result);
          setControls((prev) => ({
            ...prev,
            motorUp: true,
            motorDown: false, // Mutual exclusivity
          }));
        })
        .catch((error) => {
          console.error('Motor Up start error:', error);
          setErrorMessage(error.message || 'Failed to start Motor Up');
        });
    }
    // If Motor Down is active, notify user
    else {
      console.log('Cannot start Motor Up while Motor Down is active');
      alert('Please stop Motor Down first by pressing the Motor Down button again');
    }
  };

  // Handle Motor Down (M12) - Toggle behavior with mutual exclusivity (CTTM-VD logic)
  const handleMotorDown = () => {
    if (!connectionStatus.connected) {
      alert('PLC is not connected. Please connect to PLC first.');
      return;
    }

    if (x1Active) {
      alert('Cannot move down: Machine is already at the Homing position (X1 active). Only upward movement is permitted.');
      return;
    }

    // If Motor Down is currently active in UI, turn it OFF
    if (controls.motorDown) {
      console.log('Attempting to STOP Motor Down (M12)...');
      window.api.motorDown()
        .then((result) => {
          console.log('Motor Down stop result:', result);
          setControls((prev) => ({
            ...prev,
            motorDown: false,
            motorUp: false,
          }));
        })
        .catch((error) => {
          console.error('Motor Down stop error:', error);
          setErrorMessage(error.message || 'Failed to stop Motor Down');
        });
    }
    // If Motor Down is not active AND Motor Up is not active, turn it ON
    else if (!controls.motorUp) {
      console.log('Attempting to START Motor Down (M12)...');
      window.api.motorDown()
        .then((result) => {
          console.log('Motor Down start result:', result);
          setControls((prev) => ({
            ...prev,
            motorDown: true,
            motorUp: false, // Mutual exclusivity
          }));
        })
        .catch((error) => {
          console.error('Motor Down start error:', error);
          setErrorMessage(error.message || 'Failed to start Motor Down');
        });
    }
    // If Motor Up is active, notify user
    else {
      console.log('Cannot start Motor Down while Motor Up is active');
      alert('Please stop Motor Up first by pressing the Motor Up button again');
    }
  };

  // Stop all motor movement immediately
  const stopAllMovement = () => {
    if (!connectionStatus.connected) return;

    if (window.api && window.api.motorStop) {
      window.api.motorStop()
        .then(() => {
          setControls((prev) => ({
            ...prev,
            motorUp: false,
            motorDown: false,
          }));
        })
        .catch((err) => console.error('Error stopping movement:', err));
    } else {
      if (controls.motorUp && window.api.motorUp) window.api.motorUp();
      if (controls.motorDown && window.api.motorDown) window.api.motorDown();
      setControls((prev) => ({ ...prev, motorUp: false, motorDown: false }));
    }
  };

  // Handle Homing (M13) - Halts movement, fires homing coil M13
  const handleHoming = () => {
    if (!connectionStatus.connected) {
      alert('PLC is not connected. Please connect to PLC first.');
      return;
    }

    if (x1Active) {
      alert('Machine is already at the Homing position (X1 active).');
      return;
    }

    // Stop all movement before homing
    stopAllMovement();

    setControls((prev) => ({
      ...prev,
      homing: true,
      motorUp: false,
      motorDown: false,
    }));

    window.api.home()
      .then((result) => {
        console.log('Homing initiated:', result);
        // Automatically clear homing pulse state after 2 seconds
        setTimeout(() => {
          setControls((prev) => ({ ...prev, homing: false }));
        }, 2000);
      })
      .catch((error) => {
        console.error('Homing error:', error.message);
        setErrorMessage(error.message || 'Homing failed');
        setControls((prev) => ({ ...prev, homing: false }));
      });
  };

  // Reconnect helper
  const handleReconnect = async () => {
    try {
      if (window.api && window.api.reconnect) {
        const result = await window.api.reconnect();
        if (result && result.success) {
          setConnectionStatus((prev) => ({ ...prev, connected: true }));
          setPowerActive(true);
          setErrorMessage(null);
          // Re-enable manual mode
          if (window.api.manual) await window.api.manual();
        }
      }
    } catch (err) {
      console.error('Reconnect failed:', err);
    }
  };

  // Exit helper
  const handleExit = () => {
    const confirmed = window.confirm('Are you sure you want to exit?');
    if (confirmed) {
      stopAllMovement();
      if (window.api && window.api.disableManualMode) {
        window.api.disableManualMode().catch(() => {});
      }
      if (window.api && window.api.closeApp) {
        window.api.closeApp();
      } else {
        window.close();
      }
    }
  };

  // Back navigation with safe cleanup
  const handleBack = () => {
    stopAllMovement();
    if (window.api && window.api.disableManualMode) {
      window.api.disableManualMode().catch(() => {});
    }
    navigate('/');
  };

  // Active & disabled states matching CTTM-VD logic and X1 Homing interlock
  const isHomingActive = Boolean(controls.homing && !x1Active);
  const isMovementDisabled = !connectionStatus.connected || isHomingActive;
  const isMotorUpDisabled = isMovementDisabled || controls.motorDown;
  const isMotorDownDisabled = isMovementDisabled || controls.motorUp || x1Active;
  const isHomingButtonDisabled = !connectionStatus.connected || isHomingActive || x1Active;

  return (
    <div className="p-4 md:p-6 select-none flex flex-col justify-between flex-1">
      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col">
        {/* Sensor & Sub-status Bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-700">Hardware Interlocks & Sensors:</span>
            {/* X1 Home Limit Sensor Badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border shadow-xs transition-colors ${
                x1Active
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                  : 'bg-slate-100 text-slate-600 border-slate-200 font-medium'
              }`}
              title="X1 Hardware Input: Limit / Homing Sensor Status"
            >
              <span className={`w-2 h-2 rounded-full ${x1Active ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`}></span>
              <span className="text-xs font-semibold tracking-wide">
                X1 Sensor: {x1Active ? 'AT HOME (TRIGGERED)' : 'OPEN'}
              </span>
            </div>
          </div>

          <div className="text-xs font-medium text-slate-500">
            Jogging & Diagnostics Panel
          </div>
        </div>

        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-red-700 shadow-sm animate-fade-in">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs font-semibold uppercase tracking-wider text-red-500 hover:text-red-800 ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Real-time Telemetry Cards (D2 & R154) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6">
          {/* Distance Sensor Card (D2) */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-5 md:p-6 flex items-center space-x-4 md:space-x-5 transition-all hover:shadow-2xl">
            <div className="p-3.5 bg-emerald-100 text-emerald-600 rounded-2xl shadow-inner">
              <Move className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Distance</p>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                  D2 (6002)
                </span>
              </div>
              <div className="mt-1 flex items-baseline space-x-2">
                <span className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {distance === '--' ? '--' : Number(distance).toFixed(2)}
                </span>
                <span className="text-sm font-bold text-slate-500">mm</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Real-time Crosshead Position</p>
            </div>
          </div>

          {/* Force Load Cell Card (R154) */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-5 md:p-6 flex items-center space-x-4 md:space-x-5 transition-all hover:shadow-2xl">
            <div className="p-3.5 bg-blue-100 text-blue-600 rounded-2xl shadow-inner">
              <Zap className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Force</p>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                  R154 (32-bit Float)
                </span>
              </div>
              <div className="mt-1 flex items-baseline space-x-2">
                <span className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {force === '--' ? '--' : Number(force).toFixed(3)}
                </span>
                <span className="text-sm font-bold text-slate-500">mN</span>
                {force !== '--' && (
                  <span className="text-xs font-semibold text-slate-400">
                    ({(Number(force) / 1000).toFixed(6)} N)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Real-time Load Cell Reading</p>
            </div>
          </div>

          {/* Manual Mode Master State Card (M10) */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-5 md:p-6 flex items-center space-x-4 md:space-x-5 transition-all hover:shadow-2xl">
            <div className="p-3.5 bg-amber-100 text-amber-600 rounded-2xl shadow-inner">
              <Activity className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Master Mode</p>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-700 rounded-md border border-amber-200">
                  M10 (2010)
                </span>
              </div>
              <div className="mt-1 flex items-center space-x-2">
                <span className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {controls.manualMode ? 'MANUAL ACTIVE' : 'STANDBY'}
                </span>
                {controls.manualMode && (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Hardware Interlock Status</p>
            </div>
          </div>
        </div>

        {/* Control Panels: Movement Control & Homing Control */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
          {/* Movement Control Panel (Motor Up M11 & Motor Down M12) */}
          <div className="lg:col-span-2 bg-white/85 backdrop-blur-md rounded-3xl shadow-xl border border-white/70 p-6 md:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Movement Control</h3>
                  <p className="text-sm text-slate-500 font-medium">
                    Control motor direction with mutual exclusivity (M11 / M12)
                  </p>
                </div>
                <div className="px-3 py-1 bg-slate-100 rounded-xl text-xs font-semibold text-slate-600">
                  Toggle Action
                </div>
              </div>

              {/* Circular Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-10 sm:gap-16 py-6 md:py-10">
                {/* Motor Up (M11) Button */}
                <div className="flex flex-col items-center">
                  <button
                    onClick={handleMotorUp}
                    disabled={isMotorUpDisabled}
                    className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 transition-all duration-300 shadow-xl flex items-center justify-center ${
                      isMotorUpDisabled
                        ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-60 shadow-none'
                        : controls.motorUp
                        ? 'bg-blue-600 border-blue-700 text-white shadow-blue-500/50 scale-105'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:scale-105'
                    }`}
                  >
                    <ChevronUp className={`w-14 h-14 sm:w-16 sm:h-16 transition-transform ${controls.motorUp ? 'scale-110' : ''}`} />
                    {controls.motorUp && connectionStatus.connected && (
                      <div className="absolute -inset-2 bg-blue-500 rounded-full animate-ping opacity-35 pointer-events-none"></div>
                    )}
                  </button>
                  <span className="mt-4 font-bold text-sm tracking-wide text-slate-800">
                    MOTOR UP (M11)
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {controls.motorUp ? 'RUNNING' : 'IDLE'}
                  </span>
                </div>

                {/* Motor Down (M12) Button */}
                <div className="flex flex-col items-center">
                  <button
                    onClick={handleMotorDown}
                    disabled={isMotorDownDisabled}
                    className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 transition-all duration-300 shadow-xl flex items-center justify-center ${
                      isMotorDownDisabled
                        ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-60 shadow-none'
                        : controls.motorDown
                        ? 'bg-blue-600 border-blue-700 text-white shadow-blue-500/50 scale-105'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:scale-105'
                    }`}
                  >
                    <ChevronDown className={`w-14 h-14 sm:w-16 sm:h-16 transition-transform ${controls.motorDown ? 'scale-110' : ''}`} />
                    {controls.motorDown && connectionStatus.connected && (
                      <div className="absolute -inset-2 bg-blue-500 rounded-full animate-ping opacity-35 pointer-events-none"></div>
                    )}
                  </button>
                  <span className="mt-4 font-bold text-sm tracking-wide text-slate-800">
                    MOTOR DOWN (M12)
                  </span>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${x1Active ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                    {controls.motorDown ? 'RUNNING' : x1Active ? 'LOCKED (AT HOME)' : 'IDLE'}
                  </span>
                </div>
              </div>

              {/* Status Banner */}
              <div className="mt-4 text-center p-4 bg-slate-50/80 rounded-2xl border border-slate-200/60">
                <div className="text-base font-bold">
                  {controls.motorUp && (
                    <span className="text-blue-600 flex items-center justify-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                      MOTOR MOVING UP (Press again to stop)
                    </span>
                  )}
                  {controls.motorDown && (
                    <span className="text-blue-600 flex items-center justify-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                      MOTOR MOVING DOWN (Press again to stop)
                    </span>
                  )}
                  {!controls.motorUp && !controls.motorDown && (
                    <span className="text-slate-600">MOTOR STATIONARY</span>
                  )}
                </div>

                {x1Active && (
                  <p className="text-xs text-amber-700 mt-1.5 font-bold flex items-center justify-center gap-1.5">
                    <span>⚠️</span>
                    Home position reached (X1 active) — Downward movement locked. Upward movement available.
                  </p>
                )}
                {!x1Active && controls.motorUp && (
                  <p className="text-xs text-slate-500 mt-1.5 font-medium">
                    Motor Down is disabled while moving Up
                  </p>
                )}
                {!x1Active && controls.motorDown && (
                  <p className="text-xs text-slate-500 mt-1.5 font-medium">
                    Motor Up is disabled while moving Down
                  </p>
                )}
                {isHomingActive && (
                  <p className="text-xs text-blue-600 mt-1.5 font-semibold">
                    Homing in progress — manual movement temporarily locked
                  </p>
                )}
              </div>
            </div>

            {/* Quick Stop Button */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Emergency Movement Stop:
              </span>
              <button
                onClick={stopAllMovement}
                disabled={!connectionStatus.connected || (!controls.motorUp && !controls.motorDown)}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-md ${
                  !connectionStatus.connected || (!controls.motorUp && !controls.motorDown)
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/30 hover:scale-[1.02]'
                }`}
              >
                <Square className="w-4 h-4 fill-current" />
                Stop Movement
              </button>
            </div>
          </div>

          {/* Homing Control Panel (M13) */}
          <div className="bg-white/85 backdrop-blur-md rounded-3xl shadow-xl border border-white/70 p-6 md:p-8 flex flex-col justify-between">
            <div>
              <div className="mb-6 pb-4 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-800">Homing Control</h3>
                <p className="text-sm text-slate-500 font-medium">
                  Trigger automatic crosshead homing sequence (M13)
                </p>
              </div>

              {/* Homing Circular Button matching CTTM-VD */}
              <div className="flex flex-col items-center justify-center py-6 md:py-10">
                <button
                  onClick={handleHoming}
                  disabled={isHomingButtonDisabled}
                  className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 transition-all duration-300 shadow-xl flex items-center justify-center ${
                    isHomingButtonDisabled
                      ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-60 shadow-none'
                      : isHomingActive
                      ? 'bg-blue-600 border-blue-700 text-white shadow-blue-500/50'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 hover:scale-105'
                  }`}
                >
                  <RotateCw
                    className={`w-12 h-12 sm:w-14 sm:h-14 transition-all ${
                      isHomingActive ? 'animate-spin text-white' : 'text-slate-700'
                    }`}
                  />
                  {isHomingActive && connectionStatus.connected && (
                    <div className="absolute -inset-2 bg-blue-500 rounded-full animate-ping opacity-35 pointer-events-none"></div>
                  )}
                </button>
                <span className="mt-4 font-bold text-sm tracking-wide text-slate-800">
                  HOMING (M13)
                </span>
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${x1Active ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                  {isHomingActive ? 'HOMING ACTIVE' : x1Active ? 'AT HOME (X1)' : 'READY'}
                </span>
              </div>
            </div>

            {/* Homing Instructions & Safety Note */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/60 text-center">
              <span className={`text-sm font-bold ${isHomingActive ? 'text-blue-600' : x1Active ? 'text-emerald-600' : 'text-slate-700'}`}>
                {isHomingActive
                  ? 'HOMING SEQUENCE IN PROGRESS'
                  : x1Active
                  ? 'MACHINE ALREADY AT HOME POSITION'
                  : 'HOMING READY'}
              </span>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {x1Active
                  ? 'Actuator is resting at base home switch (X1 active). Homing trigger is disabled.'
                  : 'Stops all manual jogging and returns actuator to base zero position.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Manual;

