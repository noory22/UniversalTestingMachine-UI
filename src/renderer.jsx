import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import MainMenu from './MainMenu.jsx';
import ProcessMode from './ProcessMode.jsx';
import ProcessLogs from './ProcessLogs.jsx';
import Settings from './Settings.jsx';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

const App = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/process-mode" element={<ProcessMode />} />
        <Route path="/process-logs" element={<ProcessLogs />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  );
};

root.render(<App />);
