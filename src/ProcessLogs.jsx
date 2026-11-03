import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { FileText, Trash2, ChevronDown, AlertCircle, RefreshCw } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function ProcessLogs({ onError }) {
  const [fileList, setFileList] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [logData, setLogData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null); // { type: 'single'|'all', target: string }

  const loadFiles = async () => {
    try {
      setLoading(true);
      const res = await window.api.listCsvLogs();
      if (res.success) {
        setFileList(res.files);
        // If a file was already selected and still exists, keep it, otherwise select first if available
        if (res.files.length > 0) {
          const found = res.files.find((f) => f.name === selectedFile);
          if (!found) {
            loadFileDetails(res.files[0].name);
          }
        } else {
          setSelectedFile(null);
          setLogData(null);
        }
      } else {
        onError(res.error || 'Failed to list log files');
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFileDetails = async (fileName) => {
    try {
      setSelectedFile(fileName);
      const res = await window.api.readCsvLog(fileName);
      if (res.success) {
        setLogData(res);
      } else {
        onError(res.message || 'Failed to read log file');
      }
    } catch (e) {
      onError(e.message);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const confirmDeleteSelected = async () => {
    if (!selectedFile) return;
    try {
      const res = await window.api.deleteCsvLog(selectedFile);
      if (res.success) {
        setSelectedFile(null);
        setLogData(null);
        await loadFiles();
      } else {
        onError(res.message || 'Failed to delete file');
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setDeleteDialog(null);
    }
  };

  const confirmDeleteAll = async () => {
    try {
      const res = await window.api.deleteAllCsvLogs();
      if (res.success) {
        setSelectedFile(null);
        setLogData(null);
        await loadFiles();
      } else {
        onError(res.message || 'Failed to delete all files');
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setDeleteDialog(null);
    }
  };

  // Historical Chart data
  const chartPoints = (logData?.points || []).map((p) => ({ x: p.distance, y: p.force }));
  const chartData = {
    datasets: [
      {
        label: 'CSV Data',
        data: chartPoints,
        borderColor: '#2563EB',
        backgroundColor: '#2563EB',
        borderWidth: 2,
        pointRadius: chartPoints.length > 200 ? 1 : 3,
        showLine: true,
        tension: 0.05,
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
          font: { weight: 'bold' },
          color: '#334155',
        },
        grid: { color: '#e2e8f0' },
      },
      y: {
        title: {
          display: true,
          text: 'Force (mN)',
          font: { weight: 'bold' },
          color: '#334155',
        },
        grid: { color: '#e2e8f0' },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
      },
      title: {
        display: true,
        text: 'Process Data - Force vs Distance',
        font: { size: 14, weight: 'bold' },
        color: '#0f172a',
      },
    },
  };

  return (
    <div className="flex-1 flex p-4 gap-4 bg-[#E9EEF1] overflow-hidden">
      {/* Left List Card */}
      <div className="w-80 flex flex-col bg-white rounded-xl border border-slate-200/90 shadow-xs p-3">
        {/* Header / Select button style matching button_21 in Python */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[#308DC2] font-bold text-base">Select Log File</span>
            <ChevronDown className="w-4 h-4 text-[#308DC2]" />
          </div>
          <button
            onClick={loadFiles}
            title="Refresh logs"
            className="p-1 hover:bg-slate-100 rounded text-slate-500 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* File items list matching configlist_2 */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
          {fileList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
              <FileText className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs">No CSV log files found in logs/ directory.</p>
            </div>
          ) : (
            fileList.map((file) => {
              const isSelected = selectedFile === file.name;
              return (
                <button
                  key={file.name}
                  onClick={() => loadFileDetails(file.name)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-all flex flex-col gap-0.5 ${
                    isSelected
                      ? 'bg-[#00509E] text-white border-[#00509E] font-semibold shadow-xs'
                      : 'bg-white hover:bg-[#e0eef9] text-slate-700 border-slate-200/80'
                  }`}
                >
                  <span className="truncate w-full font-mono text-[11px]">{file.name}</span>
                  <span className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                    {(file.size / 1024).toFixed(1)} KB • {new Date(file.mtime).toLocaleString()}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Delete Controls matching button_19 and button_22 */}
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 mt-2">
          <button
            onClick={() => setDeleteDialog({ type: 'single', target: selectedFile })}
            disabled={!selectedFile}
            className={`h-11 rounded font-bold text-sm text-white transition-all flex items-center justify-center gap-1.5 ${
              selectedFile
                ? 'bg-[#AA0000] hover:bg-[#8C0000] active:bg-[#700000]'
                : 'bg-red-200 cursor-not-allowed opacity-50'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>

          <button
            onClick={() => setDeleteDialog({ type: 'all' })}
            disabled={fileList.length === 0}
            className={`h-11 rounded font-bold text-sm text-white transition-all flex items-center justify-center gap-1.5 ${
              fileList.length > 0
                ? 'bg-[#AA0000] hover:bg-[#8C0000] active:bg-[#700000]'
                : 'bg-red-200 cursor-not-allowed opacity-50'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete All</span>
          </button>
        </div>
      </div>

      {/* Right Graph Card matching feed_graph_4 */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200/90 shadow-xs p-4 overflow-hidden">
        {selectedFile && logData ? (
          <>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">{logData.filename}</h3>
                <span className="text-xs text-slate-500">
                  {logData.points?.length || 0} data points recorded
                </span>
              </div>
              {logData.avgForce !== null && (
                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg border border-emerald-200 text-xs font-bold">
                  <span>Average Force:</span>
                  <span className="text-sm font-mono">{logData.avgForce.toFixed(3)} mN</span>
                  <span className="text-[10px] text-emerald-600">({(logData.avgForce / 1000).toFixed(6)} N)</span>
                </div>
              )}
            </div>
            <div className="flex-1 w-full min-h-[300px]">
              <Line data={chartData} options={chartOptions} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <FileText className="w-12 h-12 mb-3 text-slate-300" />
            <p className="text-sm font-medium">Select a log file from the list to view plotted data</p>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {deleteDialog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-200">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-bold text-base text-slate-800">
                {deleteDialog.type === 'all' ? 'Delete All Log Files?' : 'Delete Selected File?'}
              </h3>
            </div>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              {deleteDialog.type === 'all'
                ? 'Are you sure you want to permanently delete all recorded CSV log files? This action cannot be undone.'
                : `Are you sure you want to delete "${deleteDialog.target}"? This file will be permanently removed.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteDialog(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteDialog.type === 'all' ? confirmDeleteAll : confirmDeleteSelected}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[#AA0000] hover:bg-[#8C0000] text-white transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

