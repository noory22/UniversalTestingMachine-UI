pub mod commands;
pub mod config_manager;
pub mod coordinator;
pub mod log_manager;
pub mod modbus;
pub mod updater;

use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize user logs folder and migration
            let _ = log_manager::get_logs_dir();

            // Start background coordinator loop (20ms Modbus polling and high priority command queue)
            let (coord_handle, _running_flag) = coordinator::start_coordinator(app.handle().clone());
            let coord_handle_arc = Arc::new(coord_handle);
            app.manage(coord_handle_arc.clone());

            // Auto-connect to detected USB/Serial converter after 1.5s
            let coord_clone = coord_handle_arc.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                let ports = commands::com_list_ports();
                if let Some(target) = ports.ports.iter().find(|p| p.is_converter).or_else(|| ports.ports.first()) {
                    let _ = coord_clone
                        .send_cmd(|tx| coordinator::CoordinatorCommand::Connect {
                            port: target.device.clone(),
                            reply: tx,
                        })
                        .await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::com_list_ports,
            commands::com_connect,
            commands::com_disconnect,
            commands::com_reconnect,
            commands::com_get_status,
            commands::utm_start_process,
            commands::utm_stop_process,
            commands::utm_reset_process,
            commands::utm_activate_tare,
            commands::utm_activate_normal,
            commands::utm_set_calibrate_mode,
            commands::utm_send_weight,
            commands::utm_send_speed,
            commands::utm_send_force_diff,
            commands::utm_enter_process_mode,
            commands::utm_leave_process_mode,
            commands::compression_enter,
            commands::compression_leave,
            commands::compression_start,
            commands::compression_stop,
            commands::compression_reset,
            commands::compression_tare,
            commands::manual_activate,
            commands::manual_disable,
            commands::motor_up,
            commands::motor_down,
            commands::motor_stop,
            commands::home,
            commands::read_data,
            commands::logs_list,
            commands::logs_read,
            commands::logs_delete,
            commands::logs_delete_all,
            commands::logs_download,
            commands::read_config_file,
            commands::write_config_file,
            commands::delete_config_file,
            commands::send_tensile_config,
            commands::send_compression_config,
            commands::send_tc_config,
            commands::send_process_mode,
            commands::check_for_updates,
            commands::download_update,
            commands::quit_and_install,
            commands::app_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running Universal Testing Machine application");
}
