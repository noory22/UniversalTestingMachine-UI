import React, { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, Trash2, Play, FileText, CheckCircle, AlertCircle, X, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const HandleConfig = ({ mode = 'load' }) => {
  const navigate = useNavigate();
  const [availableConfigs, setAvailableConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [statusMessage, setStatusMessage] = useState(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  useEffect(() => {
    loadAvailableConfigs();
  }, []);

  const loadAvailableConfigs = async () => {
    try {
      setLoadingConfigs(true);
      if (window.api && window.api.readConfigFile) {
        const configs = await window.api.readConfigFile();
        setAvailableConfigs([...configs].reverse());
      }
    } catch (error) {
      console.error('Error loading configurations:', error);
      setStatusMessage({ type: 'error', text: `Failed to load configurations: ${error.message}` });
    } finally {
      setLoadingConfigs(false);
    }
  };

  const handleConfigSelection = (config) => {
    setSelectedConfig(config);
    setShowDropdown(false);
    setStatusMessage(null);
  };

  const handleProcessMode = async () => {
    if (!selectedConfig) {
      setStatusMessage({ type: 'error', text: 'Please select a configuration first.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      if (window.api && window.api.sendProcessMode) {
        const result = await window.api.sendProcessMode({
          configName: selectedConfig.configName,
          speed: selectedConfig.speed,
          distanceUp: selectedConfig.distanceUp,
          distanceDown: selectedConfig.distanceDown,
          force: selectedConfig.force,
          cycles: selectedConfig.cycles,
        });

        if (!result || !result.success) {
          setStatusMessage({
            type: 'error',
            text: (result && result.message) || 'PLC configuration failed. Please verify machine connection.'
          });
          setIsLoading(false);
          return;
        }

        // Store selected config in localStorage for ProcessMode access
        localStorage.setItem('selectedConfig', JSON.stringify(selectedConfig));

        // Navigate to Process Mode
        navigate('/process-mode');
      } else {
        // Fallback navigation in dev
        localStorage.setItem('selectedConfig', JSON.stringify(selectedConfig));
        navigate('/process-mode');
      }
    } catch (error) {
      console.error('PLC transfer failed:', error);
      setStatusMessage({ type: 'error', text: `PLC communication error: ${error.message}` });
      setIsLoading(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!selectedConfig) {
      setStatusMessage({ type: 'error', text: 'Please select a configuration to delete.' });
      return;
    }

    setIsLoading(true);
    setShowDeleteConfirm(false);

    try {
      if (window.api && window.api.deleteConfigFile) {
        const success = await window.api.deleteConfigFile(selectedConfig.configName);
        if (success) {
          setStatusMessage({
            type: 'success',
            text: `Configuration "${selectedConfig.configName}" has been deleted.`
          });
          setSelectedConfig(null);
          await loadAvailableConfigs();
        } else {
          setStatusMessage({ type: 'error', text: 'Failed to delete configuration file.' });
        }
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
      setStatusMessage({ type: 'error', text: `Error deleting configuration: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4 md:p-8 select-none">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-gray-200/50 shadow-lg">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/')}
              className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-slate-600 hover:text-slate-900"
              title="Return to Main Menu"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                {mode === 'load' ? 'Load Configuration' : 'Delete Configuration'}
              </h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium">
                {mode === 'load'
                  ? 'Select saved configuration from CSV, transfer parameters to PLC, and proceed to testing'
                  : 'Remove unwanted testing configurations from CSV'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-colors cursor-pointer border border-blue-200"
              title="Information"
            >
              <Info className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl shadow-md flex items-center justify-between gap-3 border-l-4 ${
              statusMessage.type === 'success'
                ? 'bg-green-50 border-green-500 text-green-800'
                : 'bg-red-50 border-red-500 text-red-800'
            }`}
          >
            <div className="flex items-center gap-3">
              {statusMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <p className="font-semibold text-sm">{statusMessage.text}</p>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="p-1 hover:opacity-70 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Selection Card */}
        <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-gray-200/50 p-6 md:p-8 space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Select Configuration from CSV
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                disabled={loadingConfigs || availableConfigs.length === 0}
                className={`w-full px-4 py-3.5 bg-slate-50 border-2 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer ${
                  showDropdown ? 'border-blue-500 bg-white ring-4 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                } ${availableConfigs.length === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3 truncate">
                  <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className={`truncate font-semibold ${selectedConfig ? 'text-slate-800' : 'text-slate-400'}`}>
                    {loadingConfigs
                      ? 'Loading configurations...'
                      : selectedConfig
                      ? selectedConfig.configName
                      : availableConfigs.length === 0
                      ? 'No configurations found in CSV'
                      : 'Choose a configuration...'}
                  </span>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showDropdown && availableConfigs.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-60 overflow-y-auto z-30 py-2">
                  {availableConfigs.map((cfg, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleConfigSelection(cfg)}
                      className={`w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center justify-between transition-colors cursor-pointer ${
                        selectedConfig && selectedConfig.configName === cfg.configName ? 'bg-blue-50/80 font-bold text-blue-700' : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{cfg.configName}</span>
                      <span className="text-xs text-slate-400 font-mono ml-2 shrink-0">
                        {cfg.cycles || 1} {parseInt(cfg.cycles, 10) === 1 ? 'cycle' : 'cycles'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {availableConfigs.length === 0 && !loadingConfigs && (
              <p className="text-xs text-amber-600 font-medium mt-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                No saved configurations yet. Use "Create Configuration" to define one.
              </p>
            )}
          </div>

          {/* Details Card */}
          {selectedConfig && (
            <div className="bg-slate-50/80 rounded-2xl p-6 border border-slate-200/80 space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  {selectedConfig.configName}
                </h3>
                <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-bold">
                  CSV Stored
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                    Speed (R402)
                  </div>
                  <div className="text-base font-bold text-slate-800 font-mono">
                    {selectedConfig.speed} <span className="text-xs text-slate-500 font-normal">mm/s</span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                    Upward Dist (R403)
                  </div>
                  <div className="text-base font-bold text-slate-800 font-mono">
                    {selectedConfig.distanceUp} <span className="text-xs text-slate-500 font-normal">mm</span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                    Downward Dist (R404)
                  </div>
                  <div className="text-base font-bold text-slate-800 font-mono">
                    {selectedConfig.distanceDown} <span className="text-xs text-slate-500 font-normal">mm</span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                    Force Limit (R405)
                  </div>
                  <div className="text-base font-bold text-slate-800 font-mono">
                    {selectedConfig.force} <span className="text-xs text-slate-500 font-normal">gf</span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs sm:col-span-2">
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                    Test Cycles (R406)
                  </div>
                  <div className="text-base font-bold text-slate-800 font-mono">
                    {selectedConfig.cycles} <span className="text-xs text-slate-500 font-normal">cycles (1–20)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-6 py-3 border-2 border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold transition-all cursor-pointer"
            >
              Back to Main Menu
            </button>

            {mode === 'load' ? (
              <button
                type="button"
                onClick={handleProcessMode}
                disabled={!selectedConfig || isLoading}
                className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2.5 cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{isLoading ? 'Writing to PLC...' : 'Process Mode'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!selectedConfig || isLoading}
                className="px-8 py-3.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-xl font-bold shadow-lg shadow-red-500/25 transition-all flex items-center gap-2.5 cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-5 h-5" />
                <span>{isLoading ? 'Deleting...' : 'Delete Configuration'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && selectedConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center gap-3 text-red-600">
                <Trash2 className="w-6 h-6" />
                <h3 className="text-lg font-bold text-slate-800">Confirm Deletion</h3>
              </div>
              <p className="text-sm text-slate-600">
                Are you sure you want to permanently delete configuration{' '}
                <strong className="text-slate-900">"{selectedConfig.configName}"</strong> from CSV?
              </p>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-5 py-2.5 border-2 border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfig}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-500/25 transition-colors cursor-pointer text-sm"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Help Modal */}
        {showHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5 text-blue-600">
                  <Info className="w-6 h-6" />
                  <h3 className="text-lg font-bold text-slate-800">
                    {mode === 'load' ? 'Load Configuration Help' : 'Delete Configuration Help'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-3 text-sm text-slate-600">
                {mode === 'load' ? (
                  <>
                    <p>Select any configuration saved in <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">configurations.csv</code>.</p>
                    <p>When you click <strong>Process Mode</strong>:</p>
                    <ol className="list-decimal pl-5 space-y-1.5 font-medium">
                      <li>Values are written to PLC registers <span className="font-mono text-blue-600">R402 – R406</span>.</li>
                      <li>Process mode coil <span className="font-mono text-blue-600">M20</span> is turned ON.</li>
                      <li>You are navigated directly to the Process Mode testing screen.</li>
                    </ol>
                  </>
                ) : (
                  <p>Choose an outdated or unwanted configuration to remove from the stored CSV file.</p>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HandleConfig;

