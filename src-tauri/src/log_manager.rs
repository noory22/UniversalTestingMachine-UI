use chrono::Local;
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub mtime: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogPoint {
    pub time: String,
    pub distance: f64,
    pub force: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReadLogResponse {
    pub success: bool,
    pub filename: String,
    pub path: String,
    pub distance: Vec<f64>,
    pub force: Vec<f64>,
    pub points: Vec<LogPoint>,
    pub avg_force: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

pub fn get_logs_dir() -> Result<PathBuf, String> {
    let docs = dirs::document_dir().ok_or("Could not find user Documents folder")?;
    let dir = docs.join("UTM Logs");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    // Auto-migrate legacy logs from ./logs if exists
    if let Ok(cwd) = std::env::current_dir() {
        let legacy_dir = cwd.join("logs");
        if legacy_dir.exists() && legacy_dir != dir {
            if let Ok(entries) = fs::read_dir(&legacy_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("csv") {
                        if let Some(file_name) = path.file_name() {
                            let dest = dir.join(file_name);
                            if !dest.exists() {
                                let _ = fs::copy(&path, &dest);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(dir)
}

pub struct ActiveCsvLog {
    file: File,
    pub path: PathBuf,
    pub filename: String,
    pub force_accumulator: Vec<f64>,
}

impl ActiveCsvLog {
    pub fn new_process() -> Result<Self, String> {
        let logs_dir = get_logs_dir()?;
        let now = Local::now();
        let filename = format!("process_data_{}.csv", now.format("%Y%m%d_%H%M%S"));
        let path = logs_dir.join(&filename);

        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&path)
            .map_err(|e| e.to_string())?;

        writeln!(file, "Timestamp,Distance(mm),Force(mN),Force(N)").map_err(|e| e.to_string())?;

        Ok(Self {
            file,
            path,
            filename,
            force_accumulator: Vec::new(),
        })
    }

    pub fn new_compression() -> Result<Self, String> {
        let logs_dir = get_logs_dir()?;
        let now = Local::now();
        let filename = format!("compression_data_{}.csv", now.format("%Y%m%d_%H%M%S"));
        let path = logs_dir.join(&filename);

        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&path)
            .map_err(|e| e.to_string())?;

        writeln!(file, "Timestamp,Distance(mm),Force(mN),Force(N)").map_err(|e| e.to_string())?;

        Ok(Self {
            file,
            path,
            filename,
            force_accumulator: Vec::new(),
        })
    }

    pub fn write_row(&mut self, timestamp: &str, distance: &str, force_mn: &str, force_n: &str) {
        let _ = writeln!(self.file, "{},{},{},{}", timestamp, distance, force_mn, force_n);
    }

    pub fn close(&mut self, is_process: bool) {
        if is_process && !self.force_accumulator.is_empty() {
            let avg: f64 = self.force_accumulator.iter().sum::<f64>() / self.force_accumulator.len() as f64;
            let avg_n = avg / 1000.0;
            let _ = writeln!(self.file, "\nAverage Force,,{:.3},{:.6}", avg, avg_n);
        }
        let _ = self.file.flush();
    }
}

pub fn list_logs() -> Result<Vec<LogFileInfo>, String> {
    let logs_dir = get_logs_dir()?;
    let mut files = Vec::new();

    if logs_dir.exists() {
        let entries = fs::read_dir(&logs_dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                if name.ends_with(".csv") && !name.to_lowercase().contains("config") {
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    let mtime = metadata
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);

                    files.push(LogFileInfo {
                        name,
                        path: path.to_string_lossy().to_string(),
                        size: metadata.len(),
                        mtime,
                    });
                }
            }
        }
    }

    files.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    Ok(files)
}

pub fn read_log(filename: &str) -> Result<ReadLogResponse, String> {
    let logs_dir = get_logs_dir()?;
    let path = if Path::new(filename).is_absolute() {
        PathBuf::from(filename)
    } else {
        logs_dir.join(filename)
    };

    if !path.exists() {
        return Ok(ReadLogResponse {
            success: false,
            filename: filename.to_string(),
            path: path.to_string_lossy().to_string(),
            distance: Vec::new(),
            force: Vec::new(),
            points: Vec::new(),
            avg_force: None,
            message: Some("File not found".to_string()),
        });
    }

    let file = File::open(&path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    let mut distance_vec = Vec::new();
    let mut force_vec = Vec::new();
    let mut points = Vec::new();
    let mut avg_force = None;

    let mut lines = reader.lines();
    // Skip header line
    let _ = lines.next();

    for line_result in lines {
        if let Ok(line) = line_result {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if line.starts_with("Average Force") {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() > 2 {
                    if let Ok(val) = parts[2].trim().parse::<f64>() {
                        avg_force = Some(val);
                    }
                }
                continue;
            }

            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 3 {
                if let (Ok(d), Ok(f)) = (parts[1].trim().parse::<f64>(), parts[2].trim().parse::<f64>()) {
                    distance_vec.push(d);
                    force_vec.push(f);
                    points.push(LogPoint {
                        time: parts[0].trim().to_string(),
                        distance: d,
                        force: f,
                    });
                }
            }
        }
    }

    Ok(ReadLogResponse {
        success: true,
        filename: path.file_name().and_then(|n| n.to_str()).unwrap_or(filename).to_string(),
        path: path.to_string_lossy().to_string(),
        distance: distance_vec,
        force: force_vec,
        points,
        avg_force,
        message: None,
    })
}

pub fn delete_log(filename: &str) -> Result<bool, String> {
    let logs_dir = get_logs_dir()?;
    let path = if Path::new(filename).is_absolute() {
        PathBuf::from(filename)
    } else {
        logs_dir.join(filename)
    };

    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

pub fn delete_all_logs() -> Result<usize, String> {
    let logs = list_logs()?;
    let count = logs.len();
    for log in logs {
        let _ = fs::remove_file(log.path);
    }
    Ok(count)
}

pub fn export_log(filename: &str, target_path: &str) -> Result<String, String> {
    let logs_dir = get_logs_dir()?;
    let src = if Path::new(filename).is_absolute() {
        PathBuf::from(filename)
    } else {
        logs_dir.join(filename)
    };

    if !src.exists() {
        return Err("Source file does not exist".to_string());
    }

    fs::copy(&src, target_path).map_err(|e| e.to_string())?;
    Ok(target_path.to_string())
}
