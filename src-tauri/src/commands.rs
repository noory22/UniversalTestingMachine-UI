use crate::config_manager;
use crate::coordinator::{
    ConnectionStatusPayload, CoordinatorCommand, CoordinatorHandle, ReadDataPayload,
};
use crate::log_manager::{self, LogFileInfo, ReadLogResponse};
use crate::updater::{self, CheckUpdateResult};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PortItem {
    pub device: String,
    pub description: String,
    pub is_converter: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct ListPortsResponse {
    pub success: bool,
    pub ports: Vec<PortItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GenericResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// 1. Port listing
#[tauri::command]
pub fn com_list_ports() -> ListPortsResponse {
    match serialport::available_ports() {
        Ok(ports) => {
            let mut list = Vec::new();
            for p in ports {
                let desc = match &p.port_type {
                    serialport::SerialPortType::UsbPort(info) => {
                        let prod = info.product.as_deref().unwrap_or("");
                        let manuf = info.manufacturer.as_deref().unwrap_or("");
                        format!("{} {}", prod, manuf).trim().to_string()
                    }
                    _ => p.port_name.clone(),
                };
                let desc_str = if desc.is_empty() { p.port_name.clone() } else { desc };
                let lower = desc_str.to_lowercase();
                let is_converter = lower.contains("converter")
                    || lower.contains("ch340")
                    || lower.contains("ftdi")
                    || lower.contains("cp210")
                    || lower.contains("usb-serial");

                list.push(PortItem {
                    device: p.port_name,
                    description: desc_str,
                    is_converter,
                });
            }

            list.sort_by(|a, b| {
                let num_a = a
                    .device
                    .to_uppercase()
                    .trim_start_matches("COM")
                    .parse::<u32>()
                    .unwrap_or(999);
                let num_b = b
                    .device
                    .to_uppercase()
                    .trim_start_matches("COM")
                    .parse::<u32>()
                    .unwrap_or(999);
                num_a.cmp(&num_b)
            });

            ListPortsResponse {
                success: true,
                ports: list,
                error: None,
            }
        }
        Err(e) => ListPortsResponse {
            success: false,
            ports: Vec::new(),
            error: Some(e.to_string()),
        },
    }
}

// 2. Connect
#[tauri::command]
pub async fn com_connect(
    port: String,
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    match state.send_cmd(|tx| CoordinatorCommand::Connect { port, reply: tx }).await {
        Ok(msg) => Ok(GenericResult {
            success: true,
            message: Some(msg),
            error: None,
        }),
        Err(e) => Ok(GenericResult {
            success: false,
            message: None,
            error: Some(e),
        }),
    }
}

// 3. Disconnect
#[tauri::command]
pub async fn com_disconnect(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    match state.send_cmd(|tx| CoordinatorCommand::Disconnect { reply: tx }).await {
        Ok(msg) => Ok(GenericResult {
            success: true,
            message: Some(msg),
            error: None,
        }),
        Err(e) => Ok(GenericResult {
            success: false,
            message: None,
            error: Some(e),
        }),
    }
}

// 4. Reconnect
#[tauri::command]
pub async fn com_reconnect(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    match state.send_cmd(|tx| CoordinatorCommand::Reconnect { reply: tx }).await {
        Ok(msg) => Ok(GenericResult {
            success: true,
            message: Some(msg),
            error: None,
        }),
        Err(e) => {
            // Auto connect fallback
            let ports = com_list_ports();
            if let Some(target) = ports.ports.iter().find(|p| p.is_converter).or_else(|| ports.ports.first()) {
                com_connect(target.device.clone(), state).await
            } else {
                Ok(GenericResult {
                    success: false,
                    message: None,
                    error: Some(e),
                })
            }
        }
    }
}

// 5. Status
#[tauri::command]
pub async fn com_get_status(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<ConnectionStatusPayload, String> {
    state.get_status().await
}

// 6. Process controls
#[derive(Serialize)]
pub struct StartProcessResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[tauri::command]
pub async fn utm_start_process(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<StartProcessResponse, String> {
    match state.send_cmd(|tx| CoordinatorCommand::StartProcess { reply: tx }).await {
        Ok(fname) => Ok(StartProcessResponse {
            success: true,
            filename: Some(fname),
            message: None,
        }),
        Err(e) => Ok(StartProcessResponse {
            success: false,
            filename: None,
            message: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn utm_stop_process(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::StopProcess { reply: tx }).await;
    Ok(GenericResult {
        success: true,
        message: None,
        error: None,
    })
}

#[tauri::command]
pub async fn utm_reset_process(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::ResetProcess { reply: tx }).await;
    Ok(GenericResult {
        success: true,
        message: None,
        error: None,
    })
}

#[tauri::command]
pub async fn utm_activate_tare(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    match state.send_cmd(|tx| CoordinatorCommand::ActivateTare { reply: tx }).await {
        Ok(_) => Ok(GenericResult {
            success: true,
            message: None,
            error: None,
        }),
        Err(e) => Ok(GenericResult {
            success: false,
            message: Some(e.clone()),
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn utm_activate_normal(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::ActivateNormal { reply: tx }).await;
    Ok(GenericResult {
        success: true,
        message: None,
        error: None,
    })
}

#[tauri::command]
pub async fn utm_set_calibrate_mode(
    mode: String,
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::SetCalibrateMode { mode, reply: tx }).await;
    Ok(GenericResult {
        success: true,
        message: None,
        error: None,
    })
}

#[tauri::command]
pub async fn utm_send_weight(
    value: serde_json::Value,
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let int_val = match value {
        serde_json::Value::Number(n) => n.as_u64().unwrap_or(0) as u16,
        serde_json::Value::String(s) => s.parse::<u16>().unwrap_or(0),
        _ => 0,
    };
    match state.send_cmd(|tx| CoordinatorCommand::SendWeight { value: int_val, reply: tx }).await {
        Ok(msg) => Ok(GenericResult {
            success: true,
            message: Some(msg),
            error: None,
        }),
        Err(e) => Ok(GenericResult {
            success: false,
            message: Some(e.clone()),
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn utm_send_speed(
    value: serde_json::Value,
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let float_val = match value {
        serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0) as f32,
        serde_json::Value::String(s) => s.parse::<f32>().unwrap_or(0.0),
        _ => 0.0,
    };
    match state.send_cmd(|tx| CoordinatorCommand::SendSpeed { value: float_val, reply: tx }).await {
        Ok(msg) => Ok(GenericResult {
            success: true,
            message: Some(msg),
            error: None,
        }),
        Err(e) => Ok(GenericResult {
            success: false,
            message: Some(e.clone()),
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn utm_send_force_diff(
    value: serde_json::Value,
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let int_val = match value {
        serde_json::Value::Number(n) => n.as_u64().unwrap_or(0) as u16,
        serde_json::Value::String(s) => s.parse::<u16>().unwrap_or(0),
        _ => 0,
    };
    match state.send_cmd(|tx| CoordinatorCommand::SendForceDiff { value: int_val, reply: tx }).await {
        Ok(msg) => Ok(GenericResult {
            success: true,
            message: Some(msg),
            error: None,
        }),
        Err(e) => Ok(GenericResult {
            success: false,
            message: Some(e.clone()),
            error: Some(e),
        }),
    }
}

#[derive(Serialize)]
pub struct ProcessModeResponse {
    pub success: bool,
    pub m20: bool,
}

#[tauri::command]
pub async fn utm_enter_process_mode(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<ProcessModeResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::EnterProcessMode { reply: tx }).await;
    Ok(ProcessModeResponse { success: true, m20: true })
}

#[tauri::command]
pub async fn utm_leave_process_mode(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<ProcessModeResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::LeaveProcessMode { reply: tx }).await;
    Ok(ProcessModeResponse { success: true, m20: false })
}

// 7. Compression controls
#[derive(Serialize)]
pub struct CompressionModeResponse {
    pub success: bool,
    pub m30: bool,
}

#[derive(Serialize)]
pub struct CompressionActionResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub running: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tare: Option<bool>,
}

#[tauri::command]
pub async fn compression_enter(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<CompressionModeResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::CompressionEnter { reply: tx }).await;
    Ok(CompressionModeResponse { success: true, m30: true })
}

#[tauri::command]
pub async fn compression_leave(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<CompressionModeResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::CompressionLeave { reply: tx }).await;
    Ok(CompressionModeResponse { success: true, m30: false })
}

#[tauri::command]
pub async fn compression_start(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<CompressionActionResponse, String> {
    match state.send_cmd(|tx| CoordinatorCommand::CompressionStart { reply: tx }).await {
        Ok(_) => Ok(CompressionActionResponse {
            success: true,
            running: Some(true),
            reset: None,
            tare: None,
        }),
        Err(_) => Ok(CompressionActionResponse {
            success: false,
            running: Some(false),
            reset: None,
            tare: None,
        }),
    }
}

#[tauri::command]
pub async fn compression_stop(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<CompressionActionResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::CompressionStop { reply: tx }).await;
    Ok(CompressionActionResponse {
        success: true,
        running: Some(false),
        reset: None,
        tare: None,
    })
}

#[tauri::command]
pub async fn compression_reset(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<CompressionActionResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::CompressionReset { reply: tx }).await;
    Ok(CompressionActionResponse {
        success: true,
        running: None,
        reset: Some(true),
        tare: None,
    })
}

#[tauri::command]
pub async fn compression_tare(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<CompressionActionResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::CompressionTare { reply: tx }).await;
    Ok(CompressionActionResponse {
        success: true,
        running: None,
        reset: None,
        tare: Some(true),
    })
}

// 8. Manual mode controls
#[derive(Serialize)]
pub struct ManualModeResponse {
    pub success: bool,
    pub manual_mode_activated: bool,
    pub manual_mode_active: bool,
}

#[tauri::command]
pub async fn manual_activate(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<ManualModeResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::ManualActivate { reply: tx }).await;
    Ok(ManualModeResponse {
        success: true,
        manual_mode_activated: true,
        manual_mode_active: true,
    })
}

#[derive(Serialize)]
pub struct ManualDisableResponse {
    pub success: bool,
    pub manual_mode_disabled: bool,
    pub manual_mode_active: bool,
}

#[tauri::command]
pub async fn manual_disable(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<ManualDisableResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::ManualDisable { reply: tx }).await;
    Ok(ManualDisableResponse {
        success: true,
        manual_mode_disabled: true,
        manual_mode_active: false,
    })
}

#[derive(Serialize)]
pub struct MotorActionResponse {
    pub success: bool,
    pub motor_up_state: Option<String>,
    pub motor_down_state: Option<String>,
    pub motor_up: Option<bool>,
    pub motor_down: Option<bool>,
    pub insertion: Option<bool>,
    pub retraction: Option<bool>,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn motor_up(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<MotorActionResponse, String> {
    match state.send_cmd(|tx| CoordinatorCommand::MotorUp { reply: tx }).await {
        Ok(up_state) => Ok(MotorActionResponse {
            success: true,
            motor_up_state: Some(if up_state { "ON".into() } else { "OFF".into() }),
            motor_down_state: None,
            motor_up: Some(up_state),
            motor_down: None,
            insertion: Some(up_state),
            retraction: None,
            message: Some(format!("Motor Up turned {}", if up_state { "ON" } else { "OFF" })),
        }),
        Err(e) => Ok(MotorActionResponse {
            success: false,
            motor_up_state: None,
            motor_down_state: None,
            motor_up: None,
            motor_down: None,
            insertion: None,
            retraction: None,
            message: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn motor_down(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<MotorActionResponse, String> {
    match state.send_cmd(|tx| CoordinatorCommand::MotorDown { reply: tx }).await {
        Ok(down_state) => Ok(MotorActionResponse {
            success: true,
            motor_up_state: None,
            motor_down_state: Some(if down_state { "ON".into() } else { "OFF".into() }),
            motor_up: None,
            motor_down: Some(down_state),
            insertion: None,
            retraction: Some(down_state),
            message: Some(format!("Motor Down turned {}", if down_state { "ON" } else { "OFF" })),
        }),
        Err(e) => Ok(MotorActionResponse {
            success: false,
            motor_up_state: None,
            motor_down_state: None,
            motor_up: None,
            motor_down: None,
            insertion: None,
            retraction: None,
            message: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn motor_stop(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<MotorActionResponse, String> {
    let _ = state.send_cmd(|tx| CoordinatorCommand::MotorStop { reply: tx }).await;
    Ok(MotorActionResponse {
        success: true,
        motor_up_state: None,
        motor_down_state: None,
        motor_up: Some(false),
        motor_down: Some(false),
        insertion: None,
        retraction: None,
        message: None,
    })
}

#[derive(Serialize)]
pub struct HomeResponse {
    pub success: bool,
    pub homing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[tauri::command]
pub async fn home(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<HomeResponse, String> {
    match state.send_cmd(|tx| CoordinatorCommand::Home { reply: tx }).await {
        Ok(_) => Ok(HomeResponse {
            success: true,
            homing: true,
            message: None,
        }),
        Err(e) => Ok(HomeResponse {
            success: false,
            homing: false,
            message: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn read_data(
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<ReadDataPayload, String> {
    state.read_data().await
}

// 9. Logs management
#[derive(Serialize)]
pub struct ListLogsResponse {
    pub success: bool,
    pub files: Vec<LogFileInfo>,
}

#[tauri::command]
pub fn logs_list() -> ListLogsResponse {
    match log_manager::list_logs() {
        Ok(files) => ListLogsResponse { success: true, files },
        Err(_) => ListLogsResponse { success: false, files: Vec::new() },
    }
}

#[tauri::command]
pub fn logs_read(filename: String) -> ReadLogResponse {
    match log_manager::read_log(&filename) {
        Ok(resp) => resp,
        Err(e) => ReadLogResponse {
            success: false,
            filename: filename.clone(),
            path: "".into(),
            distance: Vec::new(),
            force: Vec::new(),
            points: Vec::new(),
            avg_force: None,
            message: Some(e),
        },
    }
}

#[tauri::command]
pub fn logs_delete(filename: String) -> GenericResult {
    match log_manager::delete_log(&filename) {
        Ok(_) => GenericResult { success: true, message: None, error: None },
        Err(e) => GenericResult { success: false, message: None, error: Some(e) },
    }
}

#[derive(Serialize)]
pub struct DeleteAllLogsResponse {
    pub success: bool,
    pub count: usize,
}

#[tauri::command]
pub fn logs_delete_all() -> DeleteAllLogsResponse {
    match log_manager::delete_all_logs() {
        Ok(count) => DeleteAllLogsResponse { success: true, count },
        Err(_) => DeleteAllLogsResponse { success: false, count: 0 },
    }
}

#[derive(Serialize)]
pub struct DownloadLogResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub save_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[tauri::command]
pub fn logs_download(filename: String, save_path: Option<String>) -> DownloadLogResponse {
    let target = save_path.unwrap_or_else(|| {
        let downloads = dirs::download_dir().unwrap_or_default();
        downloads.join(&filename).to_string_lossy().to_string()
    });

    match log_manager::export_log(&filename, &target) {
        Ok(p) => DownloadLogResponse {
            success: true,
            save_path: Some(p),
            filename: Some(filename),
            message: None,
        },
        Err(e) => DownloadLogResponse {
            success: false,
            save_path: None,
            filename: Some(filename),
            message: Some(e),
        },
    }
}

// 10. Configuration files
#[tauri::command]
pub fn read_config_file(test_type: Option<String>) -> Vec<serde_json::Value> {
    let t = test_type.unwrap_or_else(|| "tensile".to_string());
    config_manager::read_configurations(&t).unwrap_or_default()
}

#[tauri::command]
pub fn write_config_file(
    test_type: Option<String>,
    configs: Option<Vec<serde_json::Value>>,
    raw_configs: Option<Vec<serde_json::Value>>,
) -> bool {
    let (t, cfg_list) = match (test_type, configs, raw_configs) {
        (Some(t_str), Some(list), _) => (t_str, list),
        (None, _, Some(list)) => ("tensile".to_string(), list),
        (Some(t_str), None, None) => ("tensile".to_string(), Vec::new()),
        _ => ("tensile".to_string(), Vec::new()),
    };
    config_manager::write_configurations(&t, &cfg_list).unwrap_or(false)
}

#[tauri::command]
pub fn delete_config_file(
    test_type: Option<String>,
    config_name: Option<String>,
    name_only: Option<String>,
) -> bool {
    let (t, name) = match (test_type, config_name, name_only) {
        (Some(t_str), Some(n), _) => (t_str, n),
        (Some(n), None, _) => ("tensile".to_string(), n),
        (_, _, Some(n)) => ("tensile".to_string(), n),
        _ => return false,
    };
    config_manager::delete_configuration(&t, &name).unwrap_or(false)
}

#[tauri::command]
pub async fn send_tensile_config(
    config: serde_json::Value,
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let speed = config.get("speed").and_then(|v| {
        v.as_f64().map(|f| f as f32).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0.0);

    let force_diff = config.get("forceDiff").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0);

    let height = config.get("height").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0);

    match state.send_cmd(|tx| CoordinatorCommand::SendTensileConfig { speed, force_diff, height, reply: tx }).await {
        Ok(msg) => Ok(GenericResult { success: true, message: Some(msg), error: None }),
        Err(e) => Ok(GenericResult { success: false, message: None, error: Some(e) }),
    }
}

#[tauri::command]
pub async fn send_compression_config(
    config: serde_json::Value,
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let speed = config.get("speed").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0);

    let force_diff = config.get("forceDiff").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0);

    let height = config.get("height").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0);

    match state.send_cmd(|tx| CoordinatorCommand::SendCompressionConfig { speed, force_diff, height, reply: tx }).await {
        Ok(msg) => Ok(GenericResult { success: true, message: Some(msg), error: None }),
        Err(e) => Ok(GenericResult { success: false, message: None, error: Some(e) }),
    }
}

#[tauri::command]
pub async fn send_tc_config(
    config: serde_json::Value,
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    let speed = config.get("speed").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0);

    let distance_up = config.get("distanceUp").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0);

    let distance_down = config.get("distanceDown").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0);

    let force = config.get("force").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0);

    let cycles = config.get("cycles").and_then(|v| {
        v.as_u64().map(|u| u as u16).or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(1);

    match state.send_cmd(|tx| CoordinatorCommand::SendTcConfig { speed, distance_up, distance_down, force, cycles, reply: tx }).await {
        Ok(msg) => Ok(GenericResult { success: true, message: Some(msg), error: None }),
        Err(e) => Ok(GenericResult { success: false, message: None, error: Some(e) }),
    }
}

#[tauri::command]
pub async fn send_process_mode(
    config: serde_json::Value,
    state: State<'_, Arc<CoordinatorHandle>>,
) -> Result<GenericResult, String> {
    if config.get("cycles").is_some() || config.get("distanceUp").is_some() {
        send_tc_config(config, state).await
    } else {
        send_tensile_config(config, state).await
    }
}

// 11. Updater
#[tauri::command]
pub async fn check_for_updates<R: tauri::Runtime>(
    app: AppHandle<R>,
) -> CheckUpdateResult {
    updater::check_for_updates(&app).await
}

#[tauri::command]
pub fn download_update() -> GenericResult {
    GenericResult { success: true, message: None, error: None }
}

#[tauri::command]
pub fn quit_and_install() {
    std::process::exit(0);
}

// 12. App controls
#[tauri::command]
pub fn app_close<R: tauri::Runtime>(app: AppHandle<R>) {
    app.exit(0);
}
