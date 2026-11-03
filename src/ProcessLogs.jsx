import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  ArrowLeft,
  Power,
  Usb,
  FileText,
  Trash2,
  ChevronDown,
  Calendar,
  Clock,
  TrendingUp,
  Ruler,
  Gauge,
  Activity,
  RefreshCw,
  AlertCircle,
  X,
  CheckCircle,
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ProcessLogs() {
  const navigate = useNavigate();

  const [logFiles, setLogFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [logDetails, setLogDetails] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // 'single' | 'all' | null
  const [toastMessage, setToastMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    loadLogFiles();

    // Check status
    if (window.api && window.api.getConnectionStatus) {
      window.api.getConnectionStatus().then((status) => {
        setConnectionStatus(status && status.connected ? 'connected' : 'disconnected');
      });
    }

    let unsubConnection = () => {};
    if (window.api && window.api.onConnectionStatus) {
      unsubConnection = window.api.onConnectionStatus((status) => {
        setConnectionStatus(status && status.connected ? 'connected' : 'disconnected');
      });
    }

    return () => {
      unsubConnection();
    };
  }, []);

  const loadLogFiles = async () => {
    try {
      setIsLoading(true);
      if (window.api && window.api.listCsvLogs) {
        const res = await window.api.listCsvLogs();
        if (res.success) {
          setLogFiles(res.files || []);
          if (res.files && res.files.length > 0) {
            // Select first if current is not in list
            const current = res.files.find((f) => f.name === selectedFile);
            if (!current) {
              handleSelectFile(res.files[0].name);
            }
          } else {
            setSelectedFile(null);
            setLogDetails(null);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load log files:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = async (fileName) => {
    try {
      setSelectedFile(fileName);
      setShowDropdown(false);
      setIsLoading(true);
      if (window.api && window.api.readCsvLog) {
        const res = await window.api.readCsvLog(fileName);
        if (res.success) {
          setLogDetails(res);
        } else {
          setLogDetails(null);
        }
      }
    } catch (e) {
      console.error('Failed to read file:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleDeleteSelected = async () => {
    if (!selectedFile) return;
    try {
      setIsLoading(true);
      const res = await window.api.deleteCsvLog(selectedFile);
      if (res.success) {
        showToast(`Log ${selectedFile} deleted successfully`);
        setSelectedFile(null);
        setLogDetails(null);
        await loadLogFiles();
      }
    } catch (e) {
      console.error('Delete error:', e);
    } finally {
      setIsLoading(false);
      setDeleteConfirm(null);
    }
  };

  const handleDeleteAll = async () => {
    try {
      setIsLoading(true);
      const res = await window.api.deleteAllCsvLogs();
      if (res.success) {
        showToast('All log files deleted successfully');
        setSelectedFile(null);
        setLogDetails(null);
        setLogFiles([]);
      }
    } catch (e) {
      console.error('Delete all error:', e);
    } finally {
      setIsLoading(false);
      setDeleteConfirm(null);
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

  // Compute metrics from log details
  const peakForce = logDetails?.force && logDetails.force.length > 0 ? Math.max(...logDetails.force) : 0;
  const maxDistance = logDetails?.distance && logDetails.distance.length > 0 ? Math.max(...logDetails.distance) : 0;
  const avgForce = logDetails?.avgForce !== null && logDetails?.avgForce !== undefined ? logDetails.avgForce : null;
  const pointCount = logDetails?.points?.length || 0;

  // Chart Data
  const chartData = {
    datasets: [
      {
        label: 'Force (mN)',
        data: (logDetails?.points || []).map((pt) => ({ x: pt.distance, y: pt.force })),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        fill: true,
        borderWidth: 2.5,
        pointRadius: pointCount > 300 ? 1 : 3,
        pointHoverRadius: 6,
        showLine: true,
        tension: 0.1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: true,
          text: 'Distance (mm)',
          font: { weight: 'bold', size: 13 },
          color: '#475569',
        },
        grid: { color: 'rgba(226, 232, 240, 0.8)' },
      },
      y: {
        title: {
          display: true,
          text: 'Force (mN)',
          font: { weight: 'bold', size: 13 },
          color: '#475569',
        },
        grid: { color: 'rgba(226, 232, 240, 0.8)' },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { font: { weight: 'bold', size: 12 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `Force: ${ctx.parsed.y.toFixed(3)} mN at ${ctx.parsed.x.toFixed(1)} mm`,
        },
      },
    },
  };

  return (
    <div className="min-h-screen h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 select-none overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-in fade-in duration-200">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-red-200 overflow-hidden transform animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-r from-red-600 to-rose-700 p-5 flex items-center justify-between text-white">
              <div className="flex items-center space-x-3">
                <Trash2 className="w-6 h-6" />
                <h3 className="text-lg font-bold">
                  {deleteConfirm === 'all' ? 'Delete All Logs' : 'Delete Selected Log'}
                </h3>
              </div>
              <button onClick={() => setDeleteConfirm(null)} className="p-1.5 hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 text-gray-700">
              {deleteConfirm === 'all' ? (
                <p>Are you sure you want to permanently delete all CSV log files? This action cannot be undone.</p>
              ) : (
                <p>
                  Are you sure you want to delete <span className="font-bold text-gray-900">{selectedFile}</span>?
                </p>
              )}
            </div>
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={deleteConfirm === 'all' ? handleDeleteAll : handleDeleteSelected}
                className="px-5 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-bold rounded-xl transition-all shadow-md cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center px-6 py-3.5 bg-white/80 backdrop-blur-lg shadow-md border-b border-gray-200/50 relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold text-gray-700 bg-white/80 hover:bg-white border border-gray-200 rounded-xl transition-all shadow-xs hover:shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
            Process Logs
          </h1>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3 mr-3">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium ${
              connectionStatus === 'connected' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
            }`}
          >
            <Usb className="w-4 h-4" />
            <span>{connectionStatus === 'connected' ? 'USB Connected' : 'USB Disconnected'}</span>
          </div>

          <button
            onClick={loadLogFiles}
            title="Refresh Logs List"
            className="p-2 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <button
          onClick={handleExit}
          title="Exit Application"
          className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all duration-300 hover:-translate-y-0.5 shadow-md border border-red-400/30 cursor-pointer"
        >
          <Power className="w-4 h-4" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-5 flex flex-col lg:flex-row gap-5 overflow-hidden">
        {/* Left Sidebar - File Selection & Summary Cards */}
        <div className="w-full lg:w-96 flex flex-col gap-4 shrink-0 overflow-y-auto">
          {/* File Selector Dropdown Card */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-5 relative">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
              Select Test Log File
            </label>

            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between p-3.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                <span className="font-semibold text-sm text-gray-800 truncate">
                  {selectedFile || 'No file selected'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 max-h-72 overflow-y-auto p-1.5">
                {logFiles.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">No CSV logs found</div>
                ) : (
                  logFiles.map((file) => (
                    <button
                      key={file.name}
                      onClick={() => handleSelectFile(file.name)}
                      className={`w-full text-left p-3 rounded-xl transition-colors flex items-center justify-between cursor-pointer ${
                        selectedFile === file.name ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="text-sm truncate">{file.name}</span>
                      <span className="text-xs text-gray-400 font-mono">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Delete Buttons */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => setDeleteConfirm('single')}
                disabled={!selectedFile}
                className="flex-1 py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <button
                onClick={() => setDeleteConfirm('all')}
                disabled={logFiles.length === 0}
                className="py-2.5 px-3 bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 border border-gray-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                Delete All
              </button>
            </div>
          </div>

          {/* Test Metrics Summary Grid */}
          {selectedFile && logDetails && (
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-5 flex flex-col gap-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Test Run Summary</h3>

              {/* Peak Force */}
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Gauge className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-bold text-gray-600">Peak Force</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-blue-700 font-mono">{peakForce.toFixed(3)}</span>
                  <span className="text-xs font-semibold text-gray-500 ml-1">mN</span>
                </div>
              </div>

              {/* Max Distance */}
              <div className="p-3 bg-green-50/70 border border-green-100 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Ruler className="w-5 h-5 text-green-600" />
                  <span className="text-xs font-bold text-gray-600">Max Distance</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-green-700 font-mono">{maxDistance.toFixed(1)}</span>
                  <span className="text-xs font-semibold text-gray-500 ml-1">mm</span>
                </div>
              </div>

              {/* Average Force (if recorded) */}
              {avgForce !== null && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    <span className="text-xs font-bold text-gray-600">Average Force</span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold text-indigo-700 font-mono">{avgForce.toFixed(3)}</span>
                    <span className="text-xs font-semibold text-gray-500 ml-1">mN</span>
                  </div>
                </div>
              )}

              {/* Total Points */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-gray-600">Recorded Data Points</span>
                <span className="text-sm font-bold text-gray-800 font-mono">{pointCount}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Main Area - Interactive Chart */}
        <div className="flex-1 bg-white/75 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <div className="flex items-center gap-2.5">
              <Activity className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-gray-800">
                {selectedFile ? `Force vs. Distance Curve — ${selectedFile}` : 'Historical Test Response Curve'}
              </h2>
            </div>
          </div>

          <div className="flex-1 w-full min-h-0 flex items-center justify-center">
            {selectedFile && logDetails && pointCount > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="text-center p-8 text-gray-400">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-40 text-blue-500" />
                <p className="font-semibold text-base text-gray-600">No Test Data to Display</p>
                <p className="text-xs text-gray-400 mt-1">
                  Select a valid CSV test log file from the left menu to view its mechanical stress curve.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
