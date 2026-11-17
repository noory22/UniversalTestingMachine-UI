use std::fs;
use std::path::PathBuf;

pub struct TestTypeInfo {
    pub folder: &'static str,
    pub headers: &'static [&'static str],
}

pub fn get_test_type_info(test_type: &str) -> TestTypeInfo {
    match test_type.to_lowercase().as_str() {
        "compression" => TestTypeInfo {
            folder: "Compression",
            headers: &["configName", "speed", "forceDiff", "height"],
        },
        "tc" => TestTypeInfo {
            folder: "TC",
            headers: &["configName", "speed", "distanceUp", "distanceDown", "force", "cycles"],
        },
        _ => TestTypeInfo {
            folder: "Tensile",
            headers: &["configName", "speed", "forceDiff", "height"],
        },
    }
}

pub fn get_config_file_path(test_type: &str) -> Result<(PathBuf, TestTypeInfo), String> {
    let docs = dirs::document_dir().ok_or("Could not find user Documents folder")?;
    let info = get_test_type_info(test_type);
    let dir = docs.join("UTM config file").join(info.folder);
    let file = dir.join("configurations.csv");
    Ok((file, info))
}

pub fn ensure_config_file(test_type: &str) -> Result<PathBuf, String> {
    let (file_path, info) = get_config_file_path(test_type)?;
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    if !file_path.exists() {
        let header_line = info.headers.join(",") + "\n";
        fs::write(&file_path, header_line).map_err(|e| e.to_string())?;
    }
    Ok(file_path)
}

pub fn read_configurations(test_type: &str) -> Result<Vec<serde_json::Value>, String> {
    let file_path = ensure_config_file(test_type)?;
    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(content.as_bytes());

    let headers = rdr
        .headers()
        .map_err(|e| e.to_string())?
        .clone();

    let mut records = Vec::new();
    for result in rdr.records() {
        let record = result.map_err(|e| e.to_string())?;
        let mut map = serde_json::Map::new();
        for (i, field) in record.iter().enumerate() {
            if let Some(header) = headers.get(i) {
                map.insert(header.to_string(), serde_json::Value::String(field.to_string()));
            }
        }
        records.push(serde_json::Value::Object(map));
    }

    Ok(records)
}

pub fn write_configurations(test_type: &str, configs: &[serde_json::Value]) -> Result<bool, String> {
    let (file_path, info) = get_config_file_path(test_type)?;
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    let mut wtr = csv::WriterBuilder::new()
        .has_headers(true)
        .from_writer(vec![]);

    wtr.write_record(info.headers).map_err(|e| e.to_string())?;

    for cfg in configs {
        if let Some(obj) = cfg.as_object() {
            let row: Vec<String> = info
                .headers
                .iter()
                .map(|&h| {
                    match obj.get(h) {
                        Some(serde_json::Value::String(s)) => s.clone(),
                        Some(serde_json::Value::Number(n)) => n.to_string(),
                        Some(serde_json::Value::Bool(b)) => b.to_string(),
                        _ => String::new(),
                    }
                })
                .collect();
            wtr.write_record(&row).map_err(|e| e.to_string())?;
        }
    }

    let bytes = wtr.into_inner().map_err(|e| e.to_string())?;
    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    Ok(true)
}

pub fn delete_configuration(test_type: &str, config_name: &str) -> Result<bool, String> {
    let configs = read_configurations(test_type)?;
    let filtered: Vec<serde_json::Value> = configs
        .into_iter()
        .filter(|c| {
            if let Some(obj) = c.as_object() {
                if let Some(name) = obj.get("configName").and_then(|v| v.as_str()) {
                    return name != config_name;
                }
            }
            true
        })
        .collect();

    write_configurations(test_type, &filtered)
}
