# Universal Testing Machine (UTM) - React + Rust (Tauri) Conversion Guide

This repository has been converted from **Electron.js** to a modern, high-performance **React + Rust (Tauri v2)** desktop architecture.

---

## 🏗️ Architecture Overview

### 1. Rust Backend (`src-tauri/`)
All backend operations previously handled by `main.js` have been rewritten in pure Rust:
- **Modbus RTU Engine (`src-tauri/src/modbus.rs`)**:
  - Full Modbus RTU master implementation with standard CRC-16 (IBM / Modbus).
  - Supports holding register reads/writes (`0x03`, `0x06`, `0x10`), coil reads/writes (`0x01`, `0x05`), and discrete inputs (`0x02`).
  - Strict 300ms communication timeout matching industrial standards.
- **Background Coordinator Loop (`src-tauri/src/coordinator.rs`)**:
  - Continuous 20ms thread coordinator eliminating half-duplex RS-485 serial collisions.
  - Prioritized command execution queue for real-time motor commands, jogging, mode changes, and tare pulses.
  - Continuous unified distance (`R161`), force (`R154+R155`), and limit switch (`X1`) telemetry streaming.
  - Automatic hardware safety limits (auto-stop motor down when reaching home limit switch `X1`).
- **Configuration Management (`src-tauri/src/config_manager.rs`)**:
  - Persists Tensile, Compression, and TC test configuration CSV files directly in `Documents/UTM config file/`.
- **CSV Data Logging (`src-tauri/src/log_manager.rs`)**:
  - Real-time test telemetry recording to `Documents/UTM Logs/`.
  - Automatic migration of legacy logs, file parsing, and summary statistics calculation.
- **GitHub Auto-Update Engine (`src-tauri/src/updater.rs`)**:
  - Semver-aware checking against published GitHub releases.

---

### 2. Frontend Compatibility Layer (`src/tauri-bridge.js`)
To preserve 100% of your existing React components without rewriting or breaking UI logic:
- `src/tauri-bridge.js` exposes the identical `window.api` object previously provided by Electron's `preload.js`.
- Automatically connects `window.__TAURI__.core.invoke` and `window.__TAURI__.event.listen` to the Rust backend.
- Components like `AppShell`, `ProcessMode`, `Manual`, `CompressionTest`, `Settings`, and `HandleConfig` work without changes.

---

## 🚀 Getting Started

### 1. Prerequisites
If Rust is not yet installed on your system, install it using **Rustup**:
- **Option A (Winget)**:
  ```powershell
  winget install Rustlang.Rustup
  ```
- **Option B**: Download and run the official installer from [https://rustup.rs](https://rustup.rs).

Ensure the Visual Studio C++ Build Tools or MSVC toolchain is installed when prompted.

### 2. Running in Development
Start Vite and the Tauri desktop window in development mode:
```powershell
npm run tauri:dev
```
Or directly with Cargo:
```powershell
cargo tauri dev
```

### 3. Building Production Executable / Installer
Compile the optimized native Windows executable and MSI/NSIS installer:
```powershell
npm run tauri:build
```
The output executable will be placed in `src-tauri/target/release/utm.exe` and `src-tauri/target/release/bundle/`.
