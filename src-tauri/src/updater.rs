use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Deserialize, Debug)]
pub struct GitHubAsset {
    pub name: Option<String>,
    pub browser_download_url: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct GitHubRelease {
    pub tag_name: Option<String>,
    pub name: Option<String>,
    pub body: Option<String>,
    pub draft: Option<bool>,
    pub html_url: Option<String>,
    pub assets: Option<Vec<GitHubAsset>>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub release_name: String,
    pub release_notes: String,
    pub download_url: String,
    pub file_name: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CheckUpdateResult {
    pub success: bool,
    pub update_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn parse_semver(v: &str) -> (u32, u32, u32) {
    let re_digits: Vec<&str> = v.split(|c: char| !c.is_ascii_digit()).filter(|s| !s.is_empty()).collect();
    let maj = re_digits.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let min = re_digits.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let pat = re_digits.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
    (maj, min, pat)
}

fn is_newer(remote: &str, current: &str) -> bool {
    let (r_maj, r_min, r_pat) = parse_semver(remote);
    let (c_maj, c_min, c_pat) = parse_semver(current);
    if r_maj != c_maj {
        return r_maj > c_maj;
    }
    if r_min != c_min {
        return r_min > c_min;
    }
    r_pat > c_pat
}

pub async fn check_for_updates<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> CheckUpdateResult {
    let _ = app.emit("update-status", "Checking for updates...");

    let current_version = env!("CARGO_PKG_VERSION");
    let client = reqwest::Client::builder()
        .user_agent("UTM-Desktop-App")
        .timeout(std::time::Duration::from_secs(12))
        .build();

    let client = match client {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit("update-status", format!("Error: {}", e));
            return CheckUpdateResult {
                success: false,
                update_available: false,
                version: None,
                message: None,
                error: Some(e.to_string()),
            };
        }
    };

    let url = "https://api.github.com/repos/noory22/UniversalTestingMachine-UI/releases";
    let resp = match client.get(url).header("Accept", "application/vnd.github.v3+json").send().await {
        Ok(r) => r,
        Err(e) => {
            let _ = app.emit("update-status", "latest");
            return CheckUpdateResult {
                success: false,
                update_available: false,
                version: None,
                message: Some("Could not reach GitHub releases".to_string()),
                error: Some(e.to_string()),
            };
        }
    };

    if !resp.status().is_success() {
        let _ = app.emit("update-status", "latest");
        return CheckUpdateResult {
            success: true,
            update_available: false,
            version: None,
            message: Some("You are using the latest version.".to_string()),
            error: None,
        };
    }

    let releases: Vec<GitHubRelease> = match resp.json().await {
        Ok(r) => r,
        Err(_) => {
            let _ = app.emit("update-status", "latest");
            return CheckUpdateResult {
                success: true,
                update_available: false,
                version: None,
                message: Some("You are using the latest version.".to_string()),
                error: None,
            };
        }
    };

    let published: Vec<&GitHubRelease> = releases.iter().filter(|r| !r.draft.unwrap_or(false)).collect();
    if published.is_empty() {
        let _ = app.emit("update-status", "latest");
        return CheckUpdateResult {
            success: true,
            update_available: false,
            version: None,
            message: Some("You are using the latest version.".to_string()),
            error: None,
        };
    }

    let latest = published[0];
    let tag = latest.tag_name.as_deref().or(latest.name.as_deref()).unwrap_or("");
    let remote_version = tag.trim_start_matches('v');

    if is_newer(remote_version, current_version) {
        let exe_asset = latest.assets.as_ref().and_then(|assets| {
            assets.iter().find(|a| a.name.as_deref().unwrap_or("").ends_with(".exe"))
        });

        let download_url = exe_asset
            .and_then(|a| a.browser_download_url.clone())
            .or_else(|| latest.html_url.clone())
            .unwrap_or_default();

        let file_name = exe_asset
            .and_then(|a| a.name.clone())
            .unwrap_or_else(|| format!("UTM-Setup-{}.exe", remote_version));

        let update_info = UpdateInfo {
            version: remote_version.to_string(),
            release_name: latest.name.clone().unwrap_or_else(|| format!("v{}", remote_version)),
            release_notes: latest.body.clone().unwrap_or_default(),
            download_url,
            file_name,
        };

        let _ = app.emit("update-available", &update_info);
        let _ = app.emit("update-status", "Update available");

        CheckUpdateResult {
            success: true,
            update_available: true,
            version: Some(remote_version.to_string()),
            message: None,
            error: None,
        }
    } else {
        let _ = app.emit("update-status", "latest");
        CheckUpdateResult {
            success: true,
            update_available: false,
            version: None,
            message: Some("You are using the latest version.".to_string()),
            error: None,
        }
    }
}
