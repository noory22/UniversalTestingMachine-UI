import React, { useState } from 'react';
import { ArrowLeft, Info, AlertCircle, Save, CheckCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CreateConfig = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    configName: '',
    speed: '',
    distanceUp: '',
    distanceDown: '',
    force: '',
    cycles: '1',
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  const validateField = (name, value) => {
    let error = '';
    if (name === 'configName') {
      if (!value || !value.trim()) {
        error = 'Configuration Name is required';
      }
    } else if (name === 'speed') {
      const num = parseFloat(value);
      if (value === '' || isNaN(num) || num <= 0) {
        error = 'Speed must be greater than 0 mm/s';
      }
    } else if (name === 'distanceUp') {
      const num = parseFloat(value);
      if (value === '' || isNaN(num) || num < 0) {
        error = 'Distance Upward must be 0 mm or greater';
      }
    } else if (name === 'distanceDown') {
      const num = parseFloat(value);
      if (value === '' || isNaN(num) || num < 0) {
        error = 'Distance Downward must be 0 mm or greater';
      }
    } else if (name === 'force') {
      const num = parseFloat(value);
      if (value === '' || isNaN(num) || num < 0) {
        error = 'Force must be 0 gf or greater';
      }
    } else if (name === 'cycles') {
      const num = parseInt(value, 10);
      if (value === '' || isNaN(num) || num < 1 || num > 20) {
        error = 'Cycles must be an integer between 1 and 20';
      }
    }
    return error;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Number filtering for numeric inputs
    if (name === 'cycles') {
      if (!/^\d*$/.test(value)) return;
    } else if (['speed', 'distanceUp', 'distanceDown', 'force'].includes(name)) {
      if (value.startsWith('-') || /[eE]/.test(value)) return;
      if (!/^\d*\.?\d*$/.test(value)) return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      const err = validateField(name, value);
      setErrors((prev) => {
        const next = { ...prev };
        if (err) next[name] = err;
        else delete next[name];
        return next;
      });
    }

    if (successMessage) {
      setSuccessMessage('');
    }
  };

  const validateForm = () => {
    const newErrors = {};
    Object.keys(formData).forEach((key) => {
      const err = validateField(key, formData[key]);
      if (err) newErrors[key] = err;
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const existingConfigs = window.api && window.api.readConfigFile
        ? await window.api.readConfigFile()
        : [];

      if (existingConfigs.some((c) => c.configName.trim().toLowerCase() === formData.configName.trim().toLowerCase())) {
        setErrors({ configName: 'A configuration with this name already exists' });
        setIsLoading(false);
        return;
      }

      const updatedConfigs = [
        ...existingConfigs,
        {
          configName: formData.configName.trim(),
          speed: formData.speed.trim(),
          distanceUp: formData.distanceUp.trim(),
          distanceDown: formData.distanceDown.trim(),
          force: formData.force.trim(),
          cycles: formData.cycles.trim(),
        },
      ];

      const success = window.api && window.api.writeConfigFile
        ? await window.api.writeConfigFile(updatedConfigs)
        : false;

      if (success) {
        setSuccessMessage(`Configuration "${formData.configName.trim()}" saved to CSV successfully!`);
        setErrors({});
        setFormData({
          configName: '',
          speed: '',
          distanceUp: '',
          distanceDown: '',
          force: '',
          cycles: '1',
        });
      } else {
        setErrors({ submit: 'Failed to write configuration file. Please check file permissions.' });
      }
    } catch (err) {
      console.error('Error saving configuration:', err);
      setErrors({ submit: `Error saving configuration: ${err.message}` });
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
                Create Configuration
              </h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium">
                Define process testing parameters to store in CSV and write to PLC registers
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-colors cursor-pointer border border-blue-200"
              title="Parameter Information & Register Map"
            >
              <Info className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMessage && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl shadow-md flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-green-800 font-semibold text-sm">{successMessage}</p>
          </div>
        )}

        {errors.submit && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-md flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-red-800 font-semibold text-sm">{errors.submit}</p>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
            {/* Config Name */}
            <div>
              <label htmlFor="configName" className="block text-sm font-bold text-slate-700 mb-2">
                Configuration Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="configName"
                name="configName"
                value={formData.configName}
                onChange={handleInputChange}
                placeholder="e.g. Tensile Specimen Type-A"
                className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                  errors.configName ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                }`}
              />
              {errors.configName && (
                <p className="text-red-500 text-xs font-semibold mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.configName}
                </p>
              )}
            </div>

            {/* Parameter Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Speed (R402) */}
              <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="speed" className="text-sm font-bold text-slate-700">
                    Speed (mm/sec)
                  </label>
                  <span className="text-[11px] font-mono px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md font-bold">
                    Register R402
                  </span>
                </div>
                <input
                  type="text"
                  id="speed"
                  name="speed"
                  value={formData.speed}
                  onChange={handleInputChange}
                  placeholder="e.g. 50"
                  className={`w-full px-4 py-3 bg-white border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                    errors.speed ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {errors.speed && (
                  <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.speed}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">Crosshead travel velocity in mm/s</p>
              </div>

              {/* Distance Upward (R403) */}
              <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="distanceUp" className="text-sm font-bold text-slate-700">
                    Distance Upward (mm)
                  </label>
                  <span className="text-[11px] font-mono px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md font-bold">
                    Register R403
                  </span>
                </div>
                <input
                  type="text"
                  id="distanceUp"
                  name="distanceUp"
                  value={formData.distanceUp}
                  onChange={handleInputChange}
                  placeholder="e.g. 120"
                  className={`w-full px-4 py-3 bg-white border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                    errors.distanceUp ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {errors.distanceUp && (
                  <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.distanceUp}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">Upward stroke displacement target</p>
              </div>

              {/* Distance Downward (R404) */}
              <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="distanceDown" className="text-sm font-bold text-slate-700">
                    Distance Downward (mm)
                  </label>
                  <span className="text-[11px] font-mono px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md font-bold">
                    Register R404
                  </span>
                </div>
                <input
                  type="text"
                  id="distanceDown"
                  name="distanceDown"
                  value={formData.distanceDown}
                  onChange={handleInputChange}
                  placeholder="e.g. 120"
                  className={`w-full px-4 py-3 bg-white border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                    errors.distanceDown ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {errors.distanceDown && (
                  <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.distanceDown}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">Downward return stroke displacement target</p>
              </div>

              {/* Force (R405) */}
              <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="force" className="text-sm font-bold text-slate-700">
                    Force Limit (gf)
                  </label>
                  <span className="text-[11px] font-mono px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md font-bold">
                    Register R405
                  </span>
                </div>
                <input
                  type="text"
                  id="force"
                  name="force"
                  value={formData.force}
                  onChange={handleInputChange}
                  placeholder="e.g. 500"
                  className={`w-full px-4 py-3 bg-white border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                    errors.force ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {errors.force && (
                  <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.force}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">Target force threshold in gram-force</p>
              </div>

              {/* Cycles (R406) */}
              <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80 md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="cycles" className="text-sm font-bold text-slate-700">
                    Test Cycles (1 – 20)
                  </label>
                  <span className="text-[11px] font-mono px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md font-bold">
                    Register R406
                  </span>
                </div>
                <input
                  type="text"
                  id="cycles"
                  name="cycles"
                  value={formData.cycles}
                  onChange={handleInputChange}
                  placeholder="e.g. 5"
                  className={`w-full px-4 py-3 bg-white border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                    errors.cycles ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {errors.cycles && (
                  <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.cycles}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">Number of repeated stroke cycles (1 to 20)</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-6 py-3 border-2 border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                <span>{isLoading ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Help Modal */}
        {showHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5 text-blue-600">
                  <Info className="w-6 h-6" />
                  <h3 className="text-lg font-bold text-slate-800">Configuration & Registers</h3>
                </div>
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-3 text-sm text-slate-600">
                <p>Saved configurations are persisted in <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">UTM Logs/configurations.csv</code>.</p>
                <p>When you select a configuration in <strong>Load Configuration</strong> and click <strong>Process Mode</strong>, these parameters are sent directly to the PLC registers:</p>
                <div className="bg-slate-50 p-3.5 rounded-xl space-y-2 border border-slate-100 font-medium">
                  <div className="flex justify-between"><span>Speed (mm/sec):</span><strong className="text-blue-600 font-mono">R402</strong></div>
                  <div className="flex justify-between"><span>Distance Upward (mm):</span><strong className="text-indigo-600 font-mono">R403</strong></div>
                  <div className="flex justify-between"><span>Distance Downward (mm):</span><strong className="text-indigo-600 font-mono">R404</strong></div>
                  <div className="flex justify-between"><span>Force (gf):</span><strong className="text-amber-600 font-mono">R405</strong></div>
                  <div className="flex justify-between"><span>Cycles (1–20):</span><strong className="text-purple-600 font-mono">R406</strong></div>
                </div>
                <p className="text-xs text-slate-400 pt-2">The process mode coil <strong className="text-slate-700">M20</strong> will also be activated automatically upon transfer.</p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold cursor-pointer"
                >
                  Understood
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateConfig;

