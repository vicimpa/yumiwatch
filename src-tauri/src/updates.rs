use crate::backend::Backend;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Deserialize, Serialize)]
pub struct Release {
    tag_name: String,
    html_url: String,
    name: Option<String>,
    draft: bool,
    prerelease: bool,
}

#[tauri::command]
pub async fn latest_app_release(
    state: tauri::State<'_, Backend>,
) -> Result<Option<Release>, String> {
    let response = state
        .client
        .get("https://api.github.com/repos/vicimpa/yummywatch/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .header(
            "User-Agent",
            concat!("YummyWatch/", env!("CARGO_PKG_VERSION")),
        )
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|_| "Не удалось проверить обновления.")?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let response = response
        .error_for_status()
        .map_err(|_| "Сервис обновлений недоступен.")?;
    let release = response
        .json::<Release>()
        .await
        .map_err(|_| "Не удалось прочитать информацию об обновлении.")?;
    Ok(Some(release))
}
