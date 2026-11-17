use std::time::Duration;

/// Public monitoring only: no caller-supplied URL, headers, or account credentials.
#[tauri::command]
pub async fn yummy_server_status(
    state: tauri::State<'_, crate::backend::Backend>,
) -> Result<serde_json::Value, String> {
    let mut response = state
        .client
        .get("https://yummystatus.me/api/health?timeRange=3hour")
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| "Нет связи с YummyStatus.")?
        .error_for_status()
        .map_err(|_| "YummyStatus временно недоступен.")?;
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "YummyStatus прервал ответ.")?
    {
        if body.len() + chunk.len() > 512_000 {
            return Err("Слишком большой ответ YummyStatus.".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| "Некорректный ответ YummyStatus.".into())
}
