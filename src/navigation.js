import {
  Home,
  Gauge,
  FileText,
  Settings,
  FilePlus,
  Trash2,
  ArrowUpCircle,
  Layers,
  GitCompare,
} from 'lucide-react';

export const navigationGroups = [
  {
    title: 'General',
    items: [
      { label: 'Dashboard', path: '/', icon: Home },
      { label: 'Manual Mode', path: '/manual-mode', icon: Gauge, action: 'manual' },
      { label: 'Process Logs', path: '/process-logs', icon: FileText },
      { label: 'Settings', path: '/settings', icon: Settings },
    ],
  },
  {
    title: 'Configurations',
    items: [
      { label: 'Create Configuration', path: '/create-config', icon: FilePlus },
      { label: 'Delete Configuration', path: '/handle-config/delete', icon: Trash2 },
    ],
  },
  {
    title: 'Testing Modes',
    items: [
      { label: 'Tensile Test', path: '/handle-config/load/tensile', testPath: '/process-mode', icon: ArrowUpCircle, mode: 'tensile' },
      { label: 'Compression test', path: '/handle-config/load/compression', testPath: '/compression-test', icon: Layers, mode: 'compression' },
      { label: 'TC test (tension & compression test)', path: '/handle-config/load/tc', testPath: '/tc-test', icon: GitCompare, mode: 'tc' },
    ],
  },
];

export const pageTitles = {
  '/': 'Dashboard',
  '/manual-mode': 'Manual Mode',
  '/process-logs': 'Process Logs',
  '/settings': 'Settings & Calibration',
  '/create-config': 'Create Configuration',
  '/handle-config/load': 'Load Configuration',
  '/handle-config/load/tensile': 'Tensile Test — Load Configuration',
  '/handle-config/load/compression': 'Compression Test — Load Configuration',
  '/handle-config/load/tc': 'TC Test — Load Configuration',
  '/handle-config/delete': 'Delete Configuration',
  '/process-mode': 'Tensile Test',
  '/compression-test': 'Compression Test',
  '/tc-test': 'TC Test (Tension & Compression)',
};

