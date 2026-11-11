import React, { useState } from 'react';
import {
  ArrowLeft,
  Info,
  AlertCircle,
  Save,
  CheckCircle,
  X,
  ArrowUpCircle,
  Layers,
  GitCompare,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CreateConfig = () => {
  const navigate = useNavigate();

  // Test Type: 'tensile' | 'compression' | 'tc'
  const [activeTestType, setActiveTestType] = useState('tensile');

  // Form states per test type
  const [tensileForm, setTensileForm] = useState({
    configName: '',
    speed: '',
    forceDiff: '',
    height: '',
  });

  const [compressionForm, setCompressionForm] = useState({
    configName: '',
    speed: '',
    forceDiff: '',
    height: '',
  });

  const [tcForm, setTcForm] = useState({
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

  // Field validation
  const validateField = (type, name, value) => {
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
    } else if (name === 'forceDiff') {
      const num = parseFloat(value);
      if (value === '' || isNaN(num) || num <= 0) {
        error = 'Force Difference must be greater than 0 gf';
      }
    } else if (name === 'height') {
      const num = parseFloat(value);
      if (value === '' || isNaN(num) || num < 0) {
        error = 'Height must be 0 mm or greater';
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

  const handleInputChange = (field, value) => {
    // Number filtering for numeric inputs
    if (field === 'cycles') {
      if (!/^\d*$/.test(value)) return;
    } else if (['speed', 'forceDiff', 'height', 'distanceUp', 'distanceDown', 'force'].includes(field)) {
      if (value.startsWith('-') || /[eE]/.test(value)) return;
      if (!/^\d*\.?\d*$/.test(value)) return;
    }

    if (activeTestType === 'tensile') {
      setTensileForm((prev) => ({ ...prev, [field]: value }));
    } else if (activeTestType === 'compression') {
      setCompressionForm((prev) => ({ ...prev, [field]: value }));
    } else {
      setTcForm((prev) => ({ ...prev, [field]: value }));
    }

    if (errors[field]) {
      const err = validateField(activeTestType, field, value);
      setErrors((prev) => {
        const next = { ...prev };
        if (err) next[field] = err;
        else delete next[field];
        return next;
      });
    }

    if (successMessage) {
      setSuccessMessage('');
    }
  };

  const currentForm = activeTestType === 'tensile'
    ? tensileForm
    : activeTestType === 'compression'
    ? compressionForm
    : tcForm;

  const validateCurrentForm = () => {
    const newErrors = {};
    Object.keys(currentForm).forEach((key) => {
      const err = validateField(activeTestType, key, currentForm[key]);
      if (err) newErrors[key] = err;
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateCurrentForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Read existing configs for this test type
      const existingConfigs = window.api && window.api.readConfigFile
        ? await window.api.readConfigFile(activeTestType)
        : [];

      const currentName = currentForm.configName.trim();
      if (
        Array.isArray(existingConfigs) &&
        existingConfigs.some((c) => (c.configName || '').trim().toLowerCase() === currentName.toLowerCase())
      ) {
        setErrors({ configName: `A ${activeTestType.toUpperCase()} configuration with this name already exists.` });
        setIsLoading(false);
        return;
      }

      const newConfig = {
        configName: currentName,
        ...currentForm,
      };

      const updatedConfigs = [
        ...(Array.isArray(existingConfigs) ? existingConfigs : []),
        newConfig,
      ];

      const success = window.api && window.api.writeConfigFile
        ? await window.api.writeConfigFile(activeTestType, updatedConfigs)
        : false;

      if (success) {
        const folderName = activeTestType === 'tensile' ? 'Tensile' : activeTestType === 'compression' ? 'Compression' : 'TC';
        setSuccessMessage(`Configuration "${currentName}" saved to "UTM config file/${folderName}/configurations.csv"!`);
        setErrors({});

        // Reset the active form
        if (activeTestType === 'tensile') {
          setTensileForm({ configName: '', speed: '', forceDiff: '', height: '' });
        } else if (activeTestType === 'compression') {
          setCompressionForm({ configName: '', speed: '', forceDiff: '', height: '' });
        } else {
          setTcForm({ configName: '', speed: '', distanceUp: '', distanceDown: '', force: '', cycles: '1' });
        }
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
    <div className="p-4 md:p-8 select-none flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Sub-header with Help Button */}
        <div className="flex items-center justify-between pb-1">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Create Test Configuration
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Select test type, define machine parameters, and archive to dedicated test folders in "UTM config file".
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-colors cursor-pointer border border-blue-200 text-xs font-semibold"
            title="Parameter Information & Register Map"
          >
            <Info className="w-4 h-4" />
            <span>Register Map</span>
          </button>
        </div>

        {/* Test Type Selection Tabs */}
        <div className="grid grid-cols-3 gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTestType('tensile');
              setErrors({});
              setSuccessMessage('');
            }}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer ${
              activeTestType === 'tensile'
                ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>Tensile Test</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTestType('compression');
              setErrors({});
              setSuccessMessage('');
            }}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer ${
              activeTestType === 'compression'
                ? 'bg-white text-purple-600 shadow-md ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Compression Test</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTestType('tc');
              setErrors({});
              setSuccessMessage('');
            }}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer ${
              activeTestType === 'tc'
                ? 'bg-white text-indigo-600 shadow-md ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <GitCompare className="w-4 h-4" />
            <span>TC Test</span>
          </button>
        </div>

        {/* Notifications */}
        {successMessage && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl shadow-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-green-800 font-semibold text-sm">{successMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage('')}
              className="text-green-600 hover:text-green-800"
            >
              <X className="w-4 h-4" />
            </button>
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
            {/* Header info indicator */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {activeTestType.toUpperCase()} PARAMETERS
              </span>
              <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 rounded-lg text-slate-600">
                Target Folder: UTM config file/{activeTestType === 'tensile' ? 'Tensile' : activeTestType === 'compression' ? 'Compression' : 'TC'}
              </span>
            </div>

            {/* Config Name */}
            <div>
              <label htmlFor="configName" className="block text-sm font-bold text-slate-700 mb-2">
                Configuration Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="configName"
                name="configName"
                value={currentForm.configName}
                onChange={(e) => handleInputChange('configName', e.target.value)}
                placeholder={`e.g. ${
                  activeTestType === 'tensile'
                    ? 'Tensile Polymer Specimen'
                    : activeTestType === 'compression'
                    ? 'Compression Foam 50N'
                    : 'Cyclic TC Test 5-Cycles'
                }`}
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

            {/* ===================== TENSILE TEST FORM ===================== */}
            {activeTestType === 'tensile' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Speed (mm/sec) -> DD54 Float */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Speed (mm/sec) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      DD54 (Float)
                    </span>
                  </div>
                  <input
                    type="text"
                    value={tensileForm.speed}
                    onChange={(e) => handleInputChange('speed', e.target.value)}
                    placeholder="e.g. 5.0"
                    className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                      errors.speed ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                    }`}
                  />
                  {errors.speed && (
                    <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.speed}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Tensile pull velocity (32-bit Float LE)</p>
                </div>

                {/* Force Difference (gf) -> R206 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Force Difference (gf) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      R206
                    </span>
                  </div>
                  <input
                    type="text"
                    value={tensileForm.forceDiff}
                    onChange={(e) => handleInputChange('forceDiff', e.target.value)}
                    placeholder="e.g. 100"
                    className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                      errors.forceDiff ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                    }`}
                  />
                  {errors.forceDiff && (
                    <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.forceDiff}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Force differential threshold in gf</p>
                </div>

                {/* Height (mm) -> R407 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Height (mm) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      R407
                    </span>
                  </div>
                  <input
                    type="text"
                    value={tensileForm.height}
                    onChange={(e) => handleInputChange('height', e.target.value)}
                    placeholder="e.g. 50"
                    className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                      errors.height ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                    }`}
                  />
                  {errors.height && (
                    <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.height}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Specimen gauge stroke height</p>
                </div>
              </div>
            )}

            {/* ===================== COMPRESSION TEST FORM ===================== */}
            {activeTestType === 'compression' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Speed (mm/sec) -> R408 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Speed (mm/sec) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      R408
                    </span>
                  </div>
                  <input
                    type="text"
                    value={compressionForm.speed}
                    onChange={(e) => handleInputChange('speed', e.target.value)}
                    placeholder="e.g. 10"
                    className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                      errors.speed ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                    }`}
                  />
                  {errors.speed && (
                    <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.speed}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Compression plunge speed in mm/s</p>
                </div>

                {/* Force Difference (gf) -> R409 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Force Difference (gf) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      R409
                    </span>
                  </div>
                  <input
                    type="text"
                    value={compressionForm.forceDiff}
                    onChange={(e) => handleInputChange('forceDiff', e.target.value)}
                    placeholder="e.g. 150"
                    className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                      errors.forceDiff ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                    }`}
                  />
                  {errors.forceDiff && (
                    <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.forceDiff}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Force differential threshold in gf</p>
                </div>

                {/* Height (mm) -> R410 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Height (mm) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      R410
                    </span>
                  </div>
                  <input
                    type="text"
                    value={compressionForm.height}
                    onChange={(e) => handleInputChange('height', e.target.value)}
                    placeholder="e.g. 30"
                    className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                      errors.height ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                    }`}
                  />
                  {errors.height && (
                    <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.height}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Compression stroke travel limit</p>
                </div>
              </div>
            )}

            {/* ===================== TC TEST FORM ===================== */}
            {activeTestType === 'tc' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Speed (mm/sec) -> R402 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-slate-700">
                        Speed (mm/sec) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        R402
                      </span>
                    </div>
                    <input
                      type="text"
                      value={tcForm.speed}
                      onChange={(e) => handleInputChange('speed', e.target.value)}
                      placeholder="e.g. 50"
                      className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                        errors.speed ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                      }`}
                    />
                    {errors.speed && (
                      <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.speed}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Crosshead travel velocity in mm/s</p>
                  </div>

                  {/* Distance Upward (mm) -> R403 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-slate-700">
                        Distance Upward (mm) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        R403
                      </span>
                    </div>
                    <input
                      type="text"
                      value={tcForm.distanceUp}
                      onChange={(e) => handleInputChange('distanceUp', e.target.value)}
                      placeholder="e.g. 120"
                      className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                        errors.distanceUp ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                      }`}
                    />
                    {errors.distanceUp && (
                      <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.distanceUp}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Upward stroke displacement target</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Distance Downward (mm) -> R404 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-slate-700">
                        Distance Downward (mm) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        R404
                      </span>
                    </div>
                    <input
                      type="text"
                      value={tcForm.distanceDown}
                      onChange={(e) => handleInputChange('distanceDown', e.target.value)}
                      placeholder="e.g. 120"
                      className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                        errors.distanceDown ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                      }`}
                    />
                    {errors.distanceDown && (
                      <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.distanceDown}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Downward return stroke displacement target</p>
                  </div>

                  {/* Force Limit (gf) -> R405 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-slate-700">
                        Force Limit (gf) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        R405
                      </span>
                    </div>
                    <input
                      type="text"
                      value={tcForm.force}
                      onChange={(e) => handleInputChange('force', e.target.value)}
                      placeholder="e.g. 500"
                      className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                        errors.force ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                      }`}
                    />
                    {errors.force && (
                      <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.force}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Target force threshold in gram force</p>
                  </div>
                </div>

                {/* Cycles (1 - 20) -> R406 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Test Cycles (1 – 20) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      R406
                    </span>
                  </div>
                  <input
                    type="text"
                    value={tcForm.cycles}
                    onChange={(e) => handleInputChange('cycles', e.target.value)}
                    placeholder="1"
                    className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                      errors.cycles ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-blue-500'
                    }`}
                  />
                  {errors.cycles && (
                    <p className="text-red-500 text-xs font-semibold mt-1.5">{errors.cycles}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Number of repeated stroke cycles (1 to 20)</p>
                </div>
              </>
            )}

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
                <span>{isLoading ? 'Saving...' : `Save ${activeTestType.toUpperCase()} Configuration`}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Register Information Modal */}
        {showHelpModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">PLC Register Map for UTM Tests</h3>
                    <p className="text-xs text-slate-500">Holding registers & coils per test type</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs text-slate-600 max-h-[60vh] overflow-y-auto pr-1">
                <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/50 space-y-2">
                  <h4 className="font-bold text-blue-900 text-sm flex items-center gap-1.5">
                    <ArrowUpCircle className="w-4 h-4 text-blue-600" />
                    Tensile Test (Coil M20)
                  </h4>
                  <ul className="space-y-1 list-disc list-inside">
                    <li><strong className="text-slate-800">Speed (mm/s):</strong> DD54 — 32-bit Float LE (registers 6054 + 6055)</li>
                    <li><strong className="text-slate-800">Force Difference (gf):</strong> Register R206</li>
                    <li><strong className="text-slate-800">Height (mm):</strong> Register R407</li>
                    <li><strong className="text-slate-800">Storage:</strong> Documents/UTM config file/Tensile/configurations.csv</li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl border border-purple-200 bg-purple-50/50 space-y-2">
                  <h4 className="font-bold text-purple-900 text-sm flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-purple-600" />
                    Compression Test (Coil M30)
                  </h4>
                  <ul className="space-y-1 list-disc list-inside">
                    <li><strong className="text-slate-800">Speed (mm/s):</strong> Register R408</li>
                    <li><strong className="text-slate-800">Force Difference (gf):</strong> Register R409</li>
                    <li><strong className="text-slate-800">Height (mm):</strong> Register R410</li>
                    <li><strong className="text-slate-800">Storage:</strong> Documents/UTM config file/Compression/configurations.csv</li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 space-y-2">
                  <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-1.5">
                    <GitCompare className="w-4 h-4 text-indigo-600" />
                    TC Test (Tension & Compression)
                  </h4>
                  <ul className="space-y-1 list-disc list-inside">
                    <li><strong className="text-slate-800">Speed (mm/s):</strong> Register R402</li>
                    <li><strong className="text-slate-800">Distance Upward (mm):</strong> Register R403</li>
                    <li><strong className="text-slate-800">Distance Downward (mm):</strong> Register R404</li>
                    <li><strong className="text-slate-800">Force Limit (gf):</strong> Register R405</li>
                    <li><strong className="text-slate-800">Cycles:</strong> Register R406 (1–20)</li>
                    <li><strong className="text-slate-800">Storage:</strong> Documents/UTM config file/TC/configurations.csv</li>
                  </ul>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 cursor-pointer"
                >
                  Got It
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
