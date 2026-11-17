use crate::log_manager::ActiveCsvLog;
use crate::modbus::ModbusClient;
use chrono::Local;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::{mpsc, oneshot};

// Coils
pub const COIL_START: u16 = 2006;
pub const COIL_RESET: u16 = 2007;
pub const COIL_STOP: u16 = 2008;
pub const COIL_TARE: u16 = 2041;
pub const COIL_MANUAL: u16 = 2010;
pub const COIL_MOTOR_UP: u16 = 2011;
pub const COIL_MOTOR_DOWN: u16 = 2012;
pub const COIL_HOMING: u16 = 2013;
pub const COIL_PROCESS_MODE: u16 = 2020;
pub const COIL_COMPRESSION_MODE: u16 = 2030;
pub const COIL_NORMAL: u16 = 2040;
pub const COIL_CALIB_TARE: u16 = 2041;
pub const COIL_CALIBRATE: u16 = 2042;
pub const INPUT_X1: u16 = 1001;

// Registers
pub const REG_FORCE: u16 = 154;
pub const REG_DISTANCE: u16 = 161;
pub const REG_SPEED: u16 = 6054;
pub const REG_FORCE_DIFF: u16 = 206;
pub const REG_COMP_DISTANCE: u16 = 6104;
pub const REG_COMP_FORCE: u16 = 90;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPayload {
    pub distance: i32,
    pub force: f32,
    pub r100: i16,
    pub r101: i16,
    pub reg_z: u16,
    pub process_running: bool,
    pub tear_active: bool,
    pub manual_distance: i32,
    pub manual_force: f32,
    pub manual_mode_active: bool,
    pub motor_up: bool,
    pub motor_down: bool,
    pub homing: bool,
    pub x1: bool,
    pub at_home: bool,
    pub process_mode_m20_active: bool,
    pub comp_distance: f32,
    pub comp_force: u16,
    pub compression_mode_active: bool,
    pub compression_running: bool,
    pub compression_tare_active: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStatePayload {
    pub process_running: bool,
    pub tear_active: bool,
    pub reg_z: u16,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatusPayload {
    pub connected: bool,
    pub message: String,
    pub port: Option<String>,
    pub reg_z: u16,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReadDataPayload {
    pub success: bool,
    pub connected: bool,
    pub distance: f64,
    pub distance_display: String,
    pub manual_distance: i32,
    pub manual_distance_display: String,
    pub force: f64,
    pub force_m_n: f64,
    pub force_display: String,
    pub manual_force: f32,
    pub motor_up: bool,
    pub motor_down: bool,
    pub insertion: bool,
    pub retraction: bool,
    pub homing: bool,
    pub manual_mode: bool,
    pub x1: bool,
    pub at_home: bool,
    pub raw_force: i16,
    pub realtime_plc_value: i16,
    pub reg_z: u16,
    pub process_running: bool,
    pub compression_running: bool,
}

pub enum CoordinatorCommand {
    Connect { port: String, reply: oneshot::Sender<Result<String, String>> },
    Disconnect { reply: oneshot::Sender<Result<String, String>> },
    Reconnect { reply: oneshot::Sender<Result<String, String>> },
    StartProcess { reply: oneshot::Sender<Result<String, String>> },
    StopProcess { reply: oneshot::Sender<Result<(), String>> },
    ResetProcess { reply: oneshot::Sender<Result<(), String>> },
    ActivateTare { reply: oneshot::Sender<Result<(), String>> },
    ActivateNormal { reply: oneshot::Sender<Result<(), String>> },
    SetCalibrateMode { mode: String, reply: oneshot::Sender<Result<(), String>> },
    SendWeight { value: u16, reply: oneshot::Sender<Result<String, String>> },
    SendSpeed { value: f32, reply: oneshot::Sender<Result<String, String>> },
    SendForceDiff { value: u16, reply: oneshot::Sender<Result<String, String>> },
    EnterProcessMode { reply: oneshot::Sender<Result<(), String>> },
    LeaveProcessMode { reply: oneshot::Sender<Result<(), String>> },
    CompressionEnter { reply: oneshot::Sender<Result<(), String>> },
    CompressionLeave { reply: oneshot::Sender<Result<(), String>> },
    CompressionStart { reply: oneshot::Sender<Result<String, String>> },
    CompressionStop { reply: oneshot::Sender<Result<(), String>> },
    CompressionReset { reply: oneshot::Sender<Result<(), String>> },
    CompressionTare { reply: oneshot::Sender<Result<(), String>> },
    ManualActivate { reply: oneshot::Sender<Result<(), String>> },
    ManualDisable { reply: oneshot::Sender<Result<(), String>> },
    MotorUp { reply: oneshot::Sender<Result<bool, String>> },
    MotorDown { reply: oneshot::Sender<Result<bool, String>> },
    MotorStop { reply: oneshot::Sender<Result<(), String>> },
    Home { reply: oneshot::Sender<Result<(), String>> },
    SendTensileConfig { speed: f32, force_diff: u16, height: u16, reply: oneshot::Sender<Result<String, String>> },
    SendCompressionConfig { speed: u16, force_diff: u16, height: u16, reply: oneshot::Sender<Result<String, String>> },
    SendTcConfig { speed: u16, distance_up: u16, distance_down: u16, force: u16, cycles: u16, reply: oneshot::Sender<Result<String, String>> },
    GetStatus { reply: oneshot::Sender<ConnectionStatusPayload> },
    ReadData { reply: oneshot::Sender<ReadDataPayload> },
}

pub struct CoordinatorHandle {
    sender: mpsc::Sender<CoordinatorCommand>,
}

impl CoordinatorHandle {
    pub fn new(sender: mpsc::Sender<CoordinatorCommand>) -> Self {
        Self { sender }
    }

    pub async fn send_cmd<T, F>(&self, make_cmd: F) -> Result<T, String>
    where
        F: FnOnce(oneshot::Sender<Result<T, String>>) -> CoordinatorCommand,
    {
        let (tx, rx) = oneshot::channel();
        let cmd = make_cmd(tx);
        self.sender
            .send(cmd)
            .await
            .map_err(|e| format!("Failed to send command to coordinator: {}", e))?;
        rx.await.map_err(|e| format!("Command dropped without reply: {}", e))?
    }

    pub async fn get_status(&self) -> Result<ConnectionStatusPayload, String> {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(CoordinatorCommand::GetStatus { reply: tx })
            .await
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())
    }

    pub async fn read_data(&self) -> Result<ReadDataPayload, String> {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(CoordinatorCommand::ReadData { reply: tx })
            .await
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())
    }
}

#[derive(Copy, Clone, PartialEq)]
enum X1Method {
    Auto,
    DiscreteInput,
    Coil,
}

pub fn start_coordinator<R: Runtime + 'static>(
    app: AppHandle<R>,
) -> (CoordinatorHandle, Arc<AtomicBool>) {
    let (tx, mut rx) = mpsc::channel::<CoordinatorCommand>(128);
    let running = Arc::new(AtomicBool::new(true));
    let running_thread = running.clone();

    std::thread::spawn(move || {
        let mut client: Option<ModbusClient> = None;
        let mut current_port: Option<String> = None;
        let mut is_connected = false;

        let mut reg_z: u16 = 0;
        let mut process_running = false;
        let mut tear_active = false;
        let mut tear_deadline: Option<Instant> = None;
        let mut normal_deadline: Option<Instant> = None;
        let mut comp_tare_deadline: Option<Instant> = None;

        let mut process_mode_m20_active = false;
        let mut compression_mode_active = false;
        let mut compression_running = false;
        let mut compression_tare_active = false;

        let mut manual_mode_active = false;
        let mut motor_up_state = false;
        let mut motor_down_state = false;
        let mut homing_state = false;

        let mut last_distance: i32 = 0;
        let mut last_force: f32 = 0.0;
        let mut last_manual_distance: i32 = 0;
        let mut last_manual_force: f32 = 0.0;
        let mut last_comp_distance: f32 = 0.0;
        let mut last_comp_force: u16 = 0;
        let mut last_r100: i16 = 0;
        let mut last_r101: i16 = 0;
        let mut last_x1 = false;
        let mut consecutive_errors = 0;
        let mut slow_cycle_counter = 0;
        let mut x1_method = X1Method::Auto;

        let mut active_csv: Option<ActiveCsvLog> = None;
        let mut active_comp_csv: Option<ActiveCsvLog> = None;

        let emit_connection_status = |app: &AppHandle<R>, connected: bool, msg: &str, port: Option<String>, rz: u16| {
            let _ = app.emit(
                "com:connection-status",
                ConnectionStatusPayload {
                    connected,
                    message: msg.to_string(),
                    port,
                    reg_z: rz,
                },
            );
        };

        let emit_process_state = |app: &AppHandle<R>, pr: bool, ta: bool, rz: u16| {
            let _ = app.emit(
                "utm:process-state",
                ProcessStatePayload {
                    process_running: pr,
                    tear_active: ta,
                    reg_z: rz,
                },
            );
        };

        while running_thread.load(Ordering::Relaxed) {
            // Check tare pulse timers
            if let Some(dl) = tear_deadline {
                if Instant::now() >= dl {
                    tear_deadline = None;
                    if let Some(ref mut c) = client {
                        let _ = c.write_single_coil(COIL_TARE, false);
                    }
                    tear_active = false;
                    emit_process_state(&app, process_running, tear_active, reg_z);
                }
            }
            if let Some(dl) = normal_deadline {
                if Instant::now() >= dl {
                    normal_deadline = None;
                    if let Some(ref mut c) = client {
                        let _ = c.write_single_coil(COIL_NORMAL, false);
                    }
                }
            }
            if let Some(dl) = comp_tare_deadline {
                if Instant::now() >= dl {
                    comp_tare_deadline = None;
                    if let Some(ref mut c) = client {
                        let _ = c.write_single_coil(COIL_TARE, false);
                    }
                    compression_tare_active = false;
                }
            }

            // 1. Process all pending commands in queue first
            let mut processed_command = false;
            while let Ok(cmd) = rx.try_recv() {
                processed_command = true;
                match cmd {
                    CoordinatorCommand::GetStatus { reply } => {
                        let _ = reply.send(ConnectionStatusPayload {
                            connected: is_connected,
                            message: if is_connected { "Connected".into() } else { "Disconnected".into() },
                            port: current_port.clone(),
                            reg_z,
                        });
                    }
                    CoordinatorCommand::ReadData { reply } => {
                        let current_distance = if compression_mode_active {
                            last_comp_distance as f64
                        } else if process_mode_m20_active {
                            last_distance as f64
                        } else {
                            last_manual_distance as f64
                        };
                        let current_force = if compression_mode_active {
                            last_comp_force as f64
                        } else {
                            last_force as f64
                        };

                        let _ = reply.send(ReadDataPayload {
                            success: true,
                            connected: is_connected,
                            distance: current_distance,
                            distance_display: format!("{} mm", current_distance),
                            manual_distance: last_manual_distance,
                            manual_distance_display: format!("{} mm", last_manual_distance),
                            force: current_force,
                            force_m_n: current_force,
                            force_display: format!("{} N", current_force),
                            manual_force: last_force,
                            motor_up: motor_up_state,
                            motor_down: motor_down_state,
                            insertion: motor_up_state,
                            retraction: motor_down_state,
                            homing: homing_state && !last_x1,
                            manual_mode: manual_mode_active,
                            x1: last_x1,
                            at_home: last_x1,
                            raw_force: last_r100,
                            realtime_plc_value: last_r101,
                            reg_z,
                            process_running,
                            compression_running,
                        });
                    }
                    CoordinatorCommand::Connect { port, reply } => {
                        client = None;
                        is_connected = false;
                        current_port = None;

                        let builder = serialport::new(&port, 9600)
                            .data_bits(serialport::DataBits::Eight)
                            .parity(serialport::Parity::Even)
                            .stop_bits(serialport::StopBits::One)
                            .timeout(Duration::from_millis(20));

                        match builder.open() {
                            Ok(p) => {
                                let mut mc = ModbusClient::new(p, 1);
                                if let Ok(regs) = mc.read_holding_registers(5, 1) {
                                    if !regs.is_empty() {
                                        reg_z = regs[0];
                                    }
                                }
                                client = Some(mc);
                                is_connected = true;
                                current_port = Some(port.clone());
                                consecutive_errors = 0;
                                x1_method = X1Method::Auto;
                                emit_connection_status(&app, true, &format!("Connected to {}", port), Some(port.clone()), reg_z);
                                let _ = reply.send(Ok(format!("Connected to {}", port)));
                            }
                            Err(e) => {
                                emit_connection_status(&app, false, &format!("Failed to connect: {}", e), None, 0);
                                let _ = reply.send(Err(e.to_string()));
                            }
                        }
                    }
                    CoordinatorCommand::Disconnect { reply } => {
                        client = None;
                        is_connected = false;
                        current_port = None;
                        manual_mode_active = false;
                        process_mode_m20_active = false;
                        compression_mode_active = false;
                        compression_running = false;
                        compression_tare_active = false;
                        motor_up_state = false;
                        motor_down_state = false;
                        homing_state = false;
                        last_force = 0.0;
                        last_manual_force = 0.0;
                        last_x1 = false;
                        consecutive_errors = 0;
                        x1_method = X1Method::Auto;
                        if let Some(mut log) = active_csv.take() {
                            log.close(true);
                        }
                        if let Some(mut log) = active_comp_csv.take() {
                            log.close(false);
                        }
                        emit_connection_status(&app, false, "Disconnected", None, 0);
                        let _ = reply.send(Ok("Disconnected".into()));
                    }
                    CoordinatorCommand::Reconnect { reply } => {
                        if let Some(port) = current_port.clone() {
                            let builder = serialport::new(&port, 9600)
                                .data_bits(serialport::DataBits::Eight)
                                .parity(serialport::Parity::Even)
                                .stop_bits(serialport::StopBits::One)
                                .timeout(Duration::from_millis(20));

                            match builder.open() {
                                Ok(p) => {
                                    let mut mc = ModbusClient::new(p, 1);
                                    if let Ok(regs) = mc.read_holding_registers(5, 1) {
                                        if !regs.is_empty() {
                                            reg_z = regs[0];
                                        }
                                    }
                                    client = Some(mc);
                                    is_connected = true;
                                    consecutive_errors = 0;
                                    x1_method = X1Method::Auto;
                                    emit_connection_status(&app, true, &format!("Connected to {}", port), Some(port.clone()), reg_z);
                                    let _ = reply.send(Ok(format!("Connected to {}", port)));
                                }
                                Err(e) => {
                                    let _ = reply.send(Err(e.to_string()));
                                }
                            }
                        } else {
                            let _ = reply.send(Err("No previous COM port to reconnect".into()));
                        }
                    }
                    CoordinatorCommand::StartProcess { reply } => {
                        if !is_connected || client.is_none() {
                            let _ = reply.send(Err("Not connected to PLC!".into()));
                            continue;
                        }
                        match ActiveCsvLog::new_process() {
                            Ok(log) => {
                                let filename = log.filename.clone();
                                active_csv = Some(log);
                                last_force = 0.0;
                                if let Some(ref mut c) = client {
                                    let _ = c.write_single_coil(COIL_START, true);
                                    std::thread::sleep(Duration::from_millis(25));
                                    let _ = c.write_single_coil(COIL_STOP, false);
                                    std::thread::sleep(Duration::from_millis(25));
                                    let _ = c.write_single_coil(COIL_RESET, false);
                                    std::thread::sleep(Duration::from_millis(25));
                                    let _ = c.write_single_coil(COIL_TARE, false);
                                    std::thread::sleep(Duration::from_millis(25));
                                }
                                process_running = true;
                                tear_active = false;
                                emit_process_state(&app, true, false, reg_z);
                                let _ = reply.send(Ok(filename));
                            }
                            Err(e) => {
                                let _ = reply.send(Err(e));
                            }
                        }
                    }
                    CoordinatorCommand::StopProcess { reply } => {
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_STOP, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_START, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_RESET, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_TARE, false);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        process_running = false;
                        if let Some(mut log) = active_csv.take() {
                            log.close(true);
                        }
                        emit_process_state(&app, false, tear_active, reg_z);
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::ResetProcess { reply } => {
                        process_running = false;
                        if let Some(mut log) = active_csv.take() {
                            log.close(true);
                        }
                        last_distance = 0;
                        last_force = 0.0;
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_RESET, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_START, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_STOP, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_TARE, false);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        emit_process_state(&app, false, false, reg_z);
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::ActivateTare { reply } => {
                        if !is_connected || client.is_none() {
                            let _ = reply.send(Err("Not connected to PLC!".into()));
                            continue;
                        }
                        if tear_active {
                            let _ = reply.send(Err("Tare is already active".into()));
                            continue;
                        }
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_TARE, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_START, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_STOP, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_RESET, false);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        tear_active = true;
                        process_running = false;
                        tear_deadline = Some(Instant::now() + Duration::from_millis(1000));
                        emit_process_state(&app, false, true, reg_z);
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::ActivateNormal { reply } => {
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_NORMAL, true);
                            normal_deadline = Some(Instant::now() + Duration::from_millis(1000));
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::SetCalibrateMode { mode, reply } => {
                        if let Some(ref mut c) = client {
                            if mode == "tare" {
                                let _ = c.write_single_coil(COIL_CALIB_TARE, true);
                                tear_deadline = Some(Instant::now() + Duration::from_millis(1000));
                            } else if mode == "calibrate" {
                                let _ = c.write_single_coil(COIL_CALIBRATE, true);
                            }
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::SendWeight { value, reply } => {
                        if let Some(ref mut c) = client {
                            match c.write_single_register(102, value) {
                                Ok(_) => {
                                    let _ = reply.send(Ok(format!("Weight parameter {} sent to register R102!", value)));
                                }
                                Err(e) => {
                                    let _ = reply.send(Err(e));
                                }
                            }
                        } else {
                            let _ = reply.send(Err("Not connected to PLC".into()));
                        }
                    }
                    CoordinatorCommand::SendSpeed { value, reply } => {
                        if let Some(ref mut c) = client {
                            let bytes = value.to_le_bytes();
                            let low_word = u16::from_le_bytes([bytes[0], bytes[1]]);
                            let high_word = u16::from_le_bytes([bytes[2], bytes[3]]);
                            match c.write_multiple_registers(REG_SPEED, &[low_word, high_word]) {
                                Ok(_) => {
                                    let _ = reply.send(Ok(format!("Speed {} mm/s written to DD54!", value)));
                                }
                                Err(e) => {
                                    let _ = reply.send(Err(e));
                                }
                            }
                        } else {
                            let _ = reply.send(Err("Not connected to PLC".into()));
                        }
                    }
                    CoordinatorCommand::SendForceDiff { value, reply } => {
                        if let Some(ref mut c) = client {
                            match c.write_single_register(REG_FORCE_DIFF, value) {
                                Ok(_) => {
                                    let _ = reply.send(Ok(format!("Force difference {} gf written to register R206!", value)));
                                }
                                Err(e) => {
                                    let _ = reply.send(Err(e));
                                }
                            }
                        } else {
                            let _ = reply.send(Err("Not connected to PLC".into()));
                        }
                    }
                    CoordinatorCommand::EnterProcessMode { reply } => {
                        process_mode_m20_active = true;
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_PROCESS_MODE, true);
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::LeaveProcessMode { reply } => {
                        process_mode_m20_active = false;
                        process_running = false;
                        if let Some(mut log) = active_csv.take() {
                            log.close(true);
                        }
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_PROCESS_MODE, false);
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::CompressionEnter { reply } => {
                        compression_mode_active = true;
                        compression_running = false;
                        compression_tare_active = false;
                        last_comp_distance = 0.0;
                        last_comp_force = 0;
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_COMPRESSION_MODE, true);
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::CompressionLeave { reply } => {
                        compression_mode_active = false;
                        compression_running = false;
                        compression_tare_active = false;
                        last_comp_distance = 0.0;
                        last_comp_force = 0;
                        if let Some(mut log) = active_comp_csv.take() {
                            log.close(false);
                        }
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_COMPRESSION_MODE, false);
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::CompressionStart { reply } => {
                        if !is_connected || client.is_none() {
                            let _ = reply.send(Err("Not connected to PLC!".into()));
                            continue;
                        }
                        match ActiveCsvLog::new_compression() {
                            Ok(log) => {
                                let filename = log.filename.clone();
                                active_comp_csv = Some(log);
                                if let Some(ref mut c) = client {
                                    let _ = c.write_single_coil(COIL_START, true);
                                    std::thread::sleep(Duration::from_millis(25));
                                    let _ = c.write_single_coil(COIL_STOP, false);
                                    std::thread::sleep(Duration::from_millis(25));
                                    let _ = c.write_single_coil(COIL_RESET, false);
                                    std::thread::sleep(Duration::from_millis(25));
                                    let _ = c.write_single_coil(COIL_TARE, false);
                                    std::thread::sleep(Duration::from_millis(25));
                                }
                                compression_running = true;
                                let _ = reply.send(Ok(filename));
                            }
                            Err(e) => {
                                let _ = reply.send(Err(e));
                            }
                        }
                    }
                    CoordinatorCommand::CompressionStop { reply } => {
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_STOP, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_START, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_RESET, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_TARE, false);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        compression_running = false;
                        if let Some(mut log) = active_comp_csv.take() {
                            log.close(false);
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::CompressionReset { reply } => {
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_RESET, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_START, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_STOP, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_TARE, false);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        compression_running = false;
                        if let Some(mut log) = active_comp_csv.take() {
                            log.close(false);
                        }
                        last_comp_distance = 0.0;
                        last_comp_force = 0;
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::CompressionTare { reply } => {
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_TARE, true);
                            comp_tare_deadline = Some(Instant::now() + Duration::from_millis(1000));
                        }
                        compression_tare_active = true;
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::ManualActivate { reply } => {
                        manual_mode_active = true;
                        motor_up_state = false;
                        motor_down_state = false;
                        homing_state = false;
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_MANUAL, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_UP, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_DOWN, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_HOMING, false);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::ManualDisable { reply } => {
                        manual_mode_active = false;
                        motor_up_state = false;
                        motor_down_state = false;
                        homing_state = false;
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_MANUAL, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_UP, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_DOWN, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_HOMING, false);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::MotorUp { reply } => {
                        motor_up_state = !motor_up_state;
                        if motor_up_state {
                            motor_down_state = false;
                        }
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_MANUAL, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_DOWN, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_UP, motor_up_state);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        let _ = reply.send(Ok(motor_up_state));
                    }
                    CoordinatorCommand::MotorDown { reply } => {
                        if last_x1 {
                            if motor_down_state {
                                motor_down_state = false;
                                if let Some(ref mut c) = client {
                                    let _ = c.write_single_coil(COIL_MOTOR_DOWN, false);
                                }
                            }
                            let _ = reply.send(Err("Cannot move down: Machine is already at the Home limit (X1 active).".into()));
                            continue;
                        }
                        motor_down_state = !motor_down_state;
                        if motor_down_state {
                            motor_up_state = false;
                        }
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_MANUAL, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_UP, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_DOWN, motor_down_state);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        let _ = reply.send(Ok(motor_down_state));
                    }
                    CoordinatorCommand::MotorStop { reply } => {
                        motor_up_state = false;
                        motor_down_state = false;
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_MOTOR_UP, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_DOWN, false);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::Home { reply } => {
                        if last_x1 {
                            let _ = reply.send(Err("Machine is already at the Homing position (X1 active).".into()));
                            continue;
                        }
                        motor_up_state = false;
                        motor_down_state = false;
                        homing_state = true;
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_coil(COIL_MOTOR_UP, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_MOTOR_DOWN, false);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = c.write_single_coil(COIL_HOMING, true);
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        let _ = reply.send(Ok(()));
                    }
                    CoordinatorCommand::SendTensileConfig { speed, force_diff, height, reply } => {
                        if let Some(ref mut c) = client {
                            let bytes = speed.to_le_bytes();
                            let low_word = u16::from_le_bytes([bytes[0], bytes[1]]);
                            let high_word = u16::from_le_bytes([bytes[2], bytes[3]]);
                            let _ = c.write_multiple_registers(REG_SPEED, &[low_word, high_word]);
                            std::thread::sleep(Duration::from_millis(30));
                            let _ = c.write_single_register(REG_FORCE_DIFF, force_diff);
                            std::thread::sleep(Duration::from_millis(30));
                            let _ = c.write_single_register(407, height);
                            std::thread::sleep(Duration::from_millis(30));
                            process_mode_m20_active = true;
                            let _ = c.write_single_coil(COIL_PROCESS_MODE, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = reply.send(Ok("Tensile configuration written: Speed (DD54), ForceDiff (R206), Height (R407) and M20 active.".into()));
                        } else {
                            let _ = reply.send(Err("Not connected to PLC".into()));
                        }
                    }
                    CoordinatorCommand::SendCompressionConfig { speed, force_diff, height, reply } => {
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_register(408, speed);
                            std::thread::sleep(Duration::from_millis(30));
                            let _ = c.write_single_register(409, force_diff);
                            std::thread::sleep(Duration::from_millis(30));
                            let _ = c.write_single_register(410, height);
                            std::thread::sleep(Duration::from_millis(30));
                            compression_mode_active = true;
                            let _ = c.write_single_coil(COIL_COMPRESSION_MODE, true);
                            std::thread::sleep(Duration::from_millis(25));
                            let _ = reply.send(Ok("Compression configuration written: Speed (R408), ForceDiff (R409), Height (R410) and M30 active.".into()));
                        } else {
                            let _ = reply.send(Err("Not connected to PLC".into()));
                        }
                    }
                    CoordinatorCommand::SendTcConfig { speed, distance_up, distance_down, force, cycles, reply } => {
                        if let Some(ref mut c) = client {
                            let _ = c.write_single_register(402, speed);
                            std::thread::sleep(Duration::from_millis(30));
                            let _ = c.write_single_register(403, distance_up);
                            std::thread::sleep(Duration::from_millis(30));
                            let _ = c.write_single_register(404, distance_down);
                            std::thread::sleep(Duration::from_millis(30));
                            let _ = c.write_single_register(405, force);
                            std::thread::sleep(Duration::from_millis(30));
                            let _ = c.write_single_register(406, cycles);
                            std::thread::sleep(Duration::from_millis(30));
                            let _ = reply.send(Ok("TC configuration successfully written to registers R402-R406.".into()));
                        } else {
                            let _ = reply.send(Err("Not connected to PLC".into()));
                        }
                    }
                }
            }

            if processed_command {
                continue;
            }

            // 2. Idle sleep if disconnected
            if !is_connected || client.is_none() {
                std::thread::sleep(Duration::from_millis(250));
                continue;
            }

            // 3. Telemetry Read Cycle
            let mut cycle_success = false;

            if let Some(ref mut c) = client {
                // Read Force (R154 + R155) -> 32-bit float LE
                if let Ok(regs) = c.read_holding_registers(REG_FORCE, 2) {
                    if regs.len() >= 2 {
                        let r154 = regs[0];
                        let r155 = regs[1];
                        let b0 = (r154 & 0xFF) as u8;
                        let b1 = ((r154 >> 8) & 0xFF) as u8;
                        let b2 = (r155 & 0xFF) as u8;
                        let b3 = ((r155 >> 8) & 0xFF) as u8;
                        let f = f32::from_le_bytes([b0, b1, b2, b3]);
                        if !f.is_nan() {
                            last_force = f;
                            last_manual_force = f;
                            cycle_success = true;
                        }
                    }
                }

                // Read X1 limit switch with cached working method
                match x1_method {
                    X1Method::Auto => {
                        if let Ok(inputs) = c.read_discrete_inputs(INPUT_X1, 1) {
                            if !inputs.is_empty() {
                                last_x1 = inputs[0];
                                cycle_success = true;
                                x1_method = X1Method::DiscreteInput;
                            }
                        } else if let Ok(coils) = c.read_coils(INPUT_X1, 1) {
                            if !coils.is_empty() {
                                last_x1 = coils[0];
                                cycle_success = true;
                                x1_method = X1Method::Coil;
                            }
                        }
                    }
                    X1Method::DiscreteInput => {
                        if let Ok(inputs) = c.read_discrete_inputs(INPUT_X1, 1) {
                            if !inputs.is_empty() {
                                last_x1 = inputs[0];
                                cycle_success = true;
                            }
                        }
                    }
                    X1Method::Coil => {
                        if let Ok(coils) = c.read_coils(INPUT_X1, 1) {
                            if !coils.is_empty() {
                                last_x1 = coils[0];
                                cycle_success = true;
                            }
                        }
                    }
                }

                // Read unified distance R161
                if let Ok(regs) = c.read_holding_registers(REG_DISTANCE, 1) {
                    if !regs.is_empty() {
                        let raw_dist = regs[0];
                        let dist_val = raw_dist as i16 as i32;
                        last_distance = dist_val;
                        last_manual_distance = dist_val;
                        cycle_success = true;
                    }
                }

                // Auxiliary reads
                if process_mode_m20_active || process_running {
                    if let Ok(regs) = c.read_holding_registers(5, 1) {
                        if !regs.is_empty() {
                            let new_z = regs[0];
                            if new_z != reg_z {
                                reg_z = new_z;
                                emit_process_state(&app, process_running, tear_active, reg_z);
                            }
                            cycle_success = true;
                        }
                    }
                } else if compression_mode_active || compression_running {
                    if let Ok(regs) = c.read_holding_registers(REG_COMP_DISTANCE, 2) {
                        if regs.len() >= 2 {
                            let d104 = regs[0];
                            let d105 = regs[1];
                            let b0 = (d104 & 0xFF) as u8;
                            let b1 = ((d104 >> 8) & 0xFF) as u8;
                            let b2 = (d105 & 0xFF) as u8;
                            let b3 = ((d105 >> 8) & 0xFF) as u8;
                            let d = f32::from_le_bytes([b0, b1, b2, b3]);
                            if !d.is_nan() {
                                last_comp_distance = d;
                                cycle_success = true;
                            }
                        }
                    }
                    if let Ok(regs) = c.read_holding_registers(REG_COMP_FORCE, 1) {
                        if !regs.is_empty() {
                            last_comp_force = regs[0];
                            cycle_success = true;
                        }
                    }
                }

                // Slow cycle settings registers: R100 & R101 (every 10 cycles ~300ms)
                slow_cycle_counter = (slow_cycle_counter + 1) % 10;
                if slow_cycle_counter == 0 {
                    if let Ok(regs) = c.read_holding_registers(100, 2) {
                        if regs.len() >= 2 {
                            last_r100 = regs[0] as i16;
                            last_r101 = regs[1] as i16;
                            cycle_success = true;
                        }
                    }
                }

                // Safety guard: machine at X1 home limit switch while moving down -> halt Motor Down (M12)
                if last_x1 && motor_down_state {
                    motor_down_state = false;
                    let _ = c.write_single_coil(COIL_MOTOR_DOWN, false);
                }

                // Homing guard: X1 active while homing -> deactivate homing coil M13
                if last_x1 && homing_state {
                    homing_state = false;
                    let _ = c.write_single_coil(COIL_HOMING, false);
                }
            }

            // Connection health check
            if cycle_success {
                consecutive_errors = 0;
            } else {
                consecutive_errors += 1;
                if consecutive_errors >= 6 {
                    client = None;
                    is_connected = false;
                    emit_connection_status(&app, false, "Disconnected", None, 0);
                    consecutive_errors = 0;
                    continue;
                }
            }

            // Broadcast telemetry to React front end
            let telemetry = TelemetryPayload {
                distance: last_distance,
                force: last_force,
                r100: last_r100,
                r101: last_r101,
                reg_z,
                process_running,
                tear_active,
                manual_distance: last_manual_distance,
                manual_force: last_manual_force,
                manual_mode_active,
                motor_up: motor_up_state,
                motor_down: motor_down_state,
                homing: homing_state && !last_x1,
                x1: last_x1,
                at_home: last_x1,
                process_mode_m20_active,
                comp_distance: last_comp_distance,
                comp_force: last_comp_force,
                compression_mode_active,
                compression_running,
                compression_tare_active,
            };
            let _ = app.emit("utm:telemetry", &telemetry);

            // Record CSV row if compression test active
            if compression_running && !compression_tare_active {
                if let Some(ref mut log) = active_comp_csv {
                    let ts = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
                    let force_n = format!("{:.6}", (last_comp_force as f64) / 1000.0);
                    log.write_row(&ts, &last_comp_distance.to_string(), &last_comp_force.to_string(), &force_n);
                }
            }

            // Record CSV row if tensile/TC process test active
            if process_running && !tear_active {
                if let Some(ref mut log) = active_csv {
                    let ts = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
                    let force_n = format!("{:.6}", (last_force as f64) / 1000.0);
                    let force_str = format!("{:.3}", last_force);
                    log.write_row(&ts, &last_distance.to_string(), &force_str, &force_n);
                    log.force_accumulator.push(last_force as f64);
                }
            }

            std::thread::sleep(Duration::from_millis(20));
        }
    });

    (CoordinatorHandle::new(tx), running)
}
