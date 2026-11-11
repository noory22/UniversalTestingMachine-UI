import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  Trash2,
  Play,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  Info,
  ArrowUpCircle,
  Layers,
  GitCompare,
  Zap,
} from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

const HandleConfig = ({ mode = 'load', testType: propTestType }) => {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  // Determine active test type ('tensile' | 'compression' | 'tc')
  const initialType = (
    params.type ||
    propTestType ||
    new URLSearchParams(location.search).get('type') ||
    'tensile'
  ).toLowerCase();

  const [activeTestType, setActiveTestType] = useState(
    ['tensile', 'compression', 'tc'].includes(initialType) ? initialType : 'tensile'
  );

  const [availableConfigs, setAvailableConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [statusMessage, setStatusMessage] = useState(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Sync test type if URL params change
  useEffect(() => {
    if (params.type && ['tensile', 'compression', 'tc'].includes(params.type.toLowerCase())) {
      setActiveTestType(params.type.toLowerCase());
    }
  }, [params.type]);

  // Load configs whenever activeTestType changes
  useEffect(() => {
    loadAvailableConfigs(activeTestType);
  }, [activeTestType]);

  const loadAvailableConfigs = async (type = activeTestType) => {
    try {
      setLoadingConfigs(true);
      setSelectedConfig(null);
      if (window.api && window.api.readConfigFile) {
        const configs = await window.api.readConfigFile(type);
        const reversed = Array.isArray(configs) ? [...configs].reverse() : [];
        setAvailableConfigs(reversed);
        if (reversed.length > 0) {
          setSelectedConfig(reversed[0]);
        }
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

  // Launch test with selected configuration
  const handleStartProcess = async () => {
    if (!selectedConfig) {
      setStatusMessage({ type: 'error', text: 'Please select a configuration first.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      let result = null;

      if (activeTestType === 'tensile') {
        if (window.api && window.api.sendTensileConfig) {
          result = await window.api.sendTensileConfig(selectedConfig);
        }
      } else if (activeTestType === 'compression') {
        if (window.api && window.api.sendCompressionConfig) {
          result = await window.api.sendCompressionConfig(selectedConfig);
        }
      } else if (activeTestType === 'tc') {
        if (window.api && window.api.sendTcConfig) {
          result = await window.api.sendTcConfig(selectedConfig);
        }
      }

      if (result && !result.success) {
        setStatusMessage({
          type: 'error',
          text: result.message || 'PLC configuration failed. Please verify machine connection.'
        });
        setIsLoading(false);
        return;
      }

      // Store selected config in localStorage for Test Screen access
      localStorage.setItem('selectedConfig', JSON.stringify({
        ...selectedConfig,
        testType: activeTestType,
      }));

      // Navigate to the test view
      if (activeTestType === 'tensile') {
        navigate('/process-mode');
      } else if (activeTestType === 'compression') {
        navigate('/compression-test');
      } else {
        navigate('/tc-test');
      }
    } catch (error) {
      console.error('PLC transfer failed:', error);
      setStatusMessage({ type: 'error', text: `PLC communication error: ${error.message}` });
      setIsLoading(false);
    }
  };

  // Delete configuration
  const handleDeleteConfig = async () => {
    if (!selectedConfig) {
      setStatusMessage({ type: 'error', text: 'Please select a configuration to delete.' });
      return;
    }

    setIsLoading(true);
    setShowDeleteConfirm(false);

    try {
      if (window.api && window.api.deleteConfigFile) {
        const success = await window.api.deleteConfigFile(activeTestType, selectedConfig.configName);
        if (success) {
          setStatusMessage({
            type: 'success',
            text: `Configuration "${selectedConfig.configName}" has been deleted from ${activeTestType.toUpperCase()} archives.`
          });
          setSelectedConfig(null);
          await loadAvailableConfigs(activeTestType);
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

  const getTestTypeDetails = () => {
    switch (activeTestType) {
      case 'tensile':
        return {
          title: 'Tensile Test',
          coil: 'M20',
          folder: 'UTM config file/Tensile',
          buttonLabel: 'Process Mode',
          icon: ArrowUpCircle,
          color: 'text-blue-600',
        };
      case 'compression':
        return {
          title: 'Compression Test',
          coil: 'M30',
          folder: 'UTM config file/Compression',
          buttonLabel: 'Compression Mode',
          icon: Layers,
          color: 'text-purple-600',
        };
      case 'tc':
      default:
        return {
          title: 'TC Test (Tension & Compression)',
          coil: 'Coils M20/M30',
          folder: 'UTM config file/TC',
          buttonLabel: 'Start TC Test',
          icon: GitCompare,
          color: 'text-indigo-600',
        };
    }
  };

  const testDetails = getTestTypeDetails();
  const TypeIcon = testDetails.icon;

  return (
    <div className="p-4 md:p-8 select-none flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Sub-header */}
        <div className="flex items-center justify-between pb-1">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TypeIcon className={`w-5 h-5 ${testDetails.color}`} />
              <h2 className="text-xl font-bold text-slate-800">
                {mode === 'load'
                  ? `${testDetails.title} — Load Configuration`
                  : 'Delete Configuration Profile'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {mode === 'load'
                ? `Select a saved ${testDetails.title} profile from CSV. Pressing "${testDetails.buttonLabel}" writes parameters to the PLC and begins the test.`
                : 'Remove unwanted testing configuration profiles from CSV storage.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-colors cursor-pointer border border-blue-200 text-xs font-semibold"
            title="Information"
          >
            <Info className="w-4 h-4" />
            <span>Info</span>
          </button>
        </div>

        {/* In delete mode (or if navigating freely), provide quick test-type switcher tabs */}
        {mode === 'delete' && (
          <div className="grid grid-cols-3 gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTestType('tensile')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTestType === 'tensile'
                  ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />
              <span>Tensile ({activeTestType === 'tensile' ? availableConfigs.length : ''})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTestType('compression')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTestType === 'compression'
                  ? 'bg-white text-purple-600 shadow-md ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Compression ({activeTestType === 'compression' ? availableConfigs.length : ''})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTestType('tc')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTestType === 'tc'
                  ? 'bg-white text-indigo-600 shadow-md ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitCompare className="w-4 h-4" />
              <span>TC ({activeTestType === 'tc' ? availableConfigs.length : ''})</span>
            </button>
          </div>
        )}

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
              type="button"
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold text-slate-700">
                Select {testDetails.title} Configuration
              </label>
              <span className="text-xs text-slate-400 font-mono">
                Source: {testDetails.folder}
              </span>
            </div>

            {/* Dropdown Input */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                disabled={loadingConfigs || availableConfigs.length === 0}
                className="w-full flex items-center justify-between px-4 py-3.5 bg-slate-50 hover:bg-slate-100 border-2 border-slate-200 rounded-xl transition-all cursor-pointer text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="font-bold text-sm text-slate-800 truncate">
                    {loadingConfigs
                      ? 'Loading configurations from CSV...'
                      : selectedConfig
                      ? selectedConfig.configName
                      : availableConfigs.length === 0
                      ? `No ${testDetails.title} configurations saved yet`
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
                        selectedConfig && selectedConfig.configName === cfg.configName
                          ? 'bg-blue-50/80 font-bold text-blue-700'
                          : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{cfg.configName}</span>
                      <span className="text-xs text-slate-400 font-mono ml-2 shrink-0">
                        {activeTestType === 'tc'
                          ? `${cfg.cycles || 1} cycles`
                          : `Speed: ${cfg.speed || '-'} mm/s`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {availableConfigs.length === 0 && !loadingConfigs && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                <p className="text-xs text-amber-800 font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  No saved profiles in "{testDetails.folder}". Create one first.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/create-config')}
                  className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700"
                >
                  Create New
                </button>
              </div>
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
                  {activeTestType.toUpperCase()} PROFILE
                </span>
              </div>

              {/* Display Fields Depending on Test Type */}
              {activeTestType === 'tensile' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Speed (DD54 Float)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.speed} <span className="text-xs text-slate-500 font-normal">mm/s</span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Force Diff (R206)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.forceDiff} <span className="text-xs text-slate-500 font-normal">gf</span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Height (R407)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.height} <span className="text-xs text-slate-500 font-normal">mm</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTestType === 'compression' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Speed (R408)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.speed} <span className="text-xs text-slate-500 font-normal">mm/s</span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Force Diff (R409)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.forceDiff} <span className="text-xs text-slate-500 font-normal">gf</span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Height (R410)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.height} <span className="text-xs text-slate-500 font-normal">mm</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTestType === 'tc' && (
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
                      Dist Up (R403)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.distanceUp} <span className="text-xs text-slate-500 font-normal">mm</span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Dist Down (R404)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.distanceDown} <span className="text-xs text-slate-500 font-normal">mm</span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Force (R405)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.force} <span className="text-xs text-slate-500 font-normal">gf</span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Cycles (R406)
                    </div>
                    <div className="text-base font-bold text-slate-800 font-mono">
                      {selectedConfig.cycles} <span className="text-xs text-slate-500 font-normal">cycles</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-6 py-3 border-2 border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>

            {mode === 'load' ? (
              <button
                type="button"
                onClick={handleStartProcess}
                disabled={!selectedConfig || isLoading}
                className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2.5 cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{isLoading ? 'Writing to PLC...' : testDetails.buttonLabel}</span>
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
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-red-600">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <h3 className="text-lg font-bold">Delete Configuration</h3>
              </div>
              <p className="text-sm text-slate-600">
                Are you sure you want to permanently delete{' '}
                <strong className="text-slate-900">"{selectedConfig && selectedConfig.configName}"</strong> from {testDetails.title} CSV storage?
              </p>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfig}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-md cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Register Info Modal */}
        {showHelpModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-base">Configuration & Register Info</h3>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="text-xs text-slate-600 space-y-2">
                <p>When you select a configuration and click <strong>{testDetails.buttonLabel}</strong>:</p>
                <ul className="list-disc list-inside space-y-1 font-mono text-slate-700">
                  {activeTestType === 'tensile' && (
                    <>
                      <li>Speed &rarr; DD54 (32-bit Float LE at registers 6054+6055)</li>
                      <li>Force Difference &rarr; R206</li>
                      <li>Height &rarr; R407</li>
                      <li>Tensile Mode Coil &rarr; M20</li>
                    </>
                  )}
                  {activeTestType === 'compression' && (
                    <>
                      <li>Speed &rarr; R408</li>
                      <li>Force Difference &rarr; R409</li>
                      <li>Height &rarr; R410</li>
                      <li>Compression Mode Coil &rarr; M30</li>
                    </>
                  )}
                  {activeTestType === 'tc' && (
                    <>
                      <li>Speed &rarr; R402</li>
                      <li>Distance Up &rarr; R403</li>
                      <li>Distance Down &rarr; R404</li>
                      <li>Force &rarr; R405</li>
                      <li>Cycles &rarr; R406</li>
                    </>
                  )}
                </ul>
                <p className="pt-2 text-slate-400">
                  Profiles are saved in <span className="font-mono">{testDetails.folder}</span>.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700"
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
