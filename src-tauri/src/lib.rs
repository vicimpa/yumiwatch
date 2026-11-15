mod alloha;
mod backend;
mod images;
mod interface_scale;
mod media;
mod providers;
mod session;
mod skips;

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, time::Duration};
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo {
    platform: &'static str,
}

#[tauri::command]
fn desktop_info() -> DesktopInfo {
    DesktopInfo {
        platform: std::env::consts::OS,
    }
}

fn cursor_visibility(window: &tauri::Window, visible: bool) -> Result<(), String> {
    #[cfg(mobile)]
    {
        let _ = (window, visible);
        return Ok(());
    }
    #[cfg(desktop)]
    {
        // A delayed WebView request must not hide the cursor after focus moved away.
        let visible = visible || !window.is_focused().unwrap_or(false);
        #[cfg(target_os = "macos")]
        return window
            .run_on_main_thread(move || {
                // AppKit restores this automatically on real mouse movement, including
                // movement over native window chrome that never reaches the WebView.
                objc2_app_kit::NSCursor::setHiddenUntilMouseMoves(!visible);
            })
            .map_err(|error| error.to_string());
        #[cfg(not(target_os = "macos"))]
        window
            .set_cursor_visible(visible)
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn set_window_cursor_visible(window: tauri::Window, visible: bool) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Неизвестное окно.".into());
    }
    cursor_visibility(&window, visible)
}

#[tauri::command]
async fn load_account_session(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, session::SessionVault>,
) -> Result<Option<session::SavedSession>, String> {
    if window.label() != "main" {
        return Err("Неизвестное окно.".into());
    }
    let vault = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || vault.load())
        .await
        .map_err(|_| "Не удалось прочитать сохранённый вход.".to_string())?
}

#[tauri::command]
async fn save_account_session(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, session::SessionVault>,
    session: Option<session::SavedSession>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Неизвестное окно.".into());
    }
    let vault = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || vault.save(session))
        .await
        .map_err(|_| "Не удалось сохранить вход.".to_string())?
}

#[tauri::command]
fn set_window_controls_visible(window: tauri::WebviewWindow, visible: bool) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Неизвестное окно.".into());
    }
    #[cfg(target_os = "macos")]
    {
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                use objc2_app_kit::{NSWindow, NSWindowButton};
                let Ok(pointer) = target.ns_window() else {
                    return;
                };
                if pointer.is_null() {
                    return;
                }
                // Tauri owns this NSWindow; acquire and use it only on the main thread.
                let native = unsafe { &*pointer.cast::<NSWindow>() };
                for kind in [
                    NSWindowButton::CloseButton,
                    NSWindowButton::MiniaturizeButton,
                    NSWindowButton::ZoomButton,
                ] {
                    if let Some(button) = native.standardWindowButton(kind) {
                        button.setHidden(!visible);
                    }
                }
            })
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = visible;
    Ok(())
}

#[tauri::command]
async fn fetch_image(
    state: tauri::State<'_, backend::Backend>,
    url: String,
) -> Result<images::ImageResponse, String> {
    images::fetch(&state.client, &url).await
}

#[tauri::command]
async fn resolve_candidates(
    state: tauri::State<'_, backend::Backend>,
    candidates: Vec<providers::Candidate>,
) -> Result<serde_json::Value, String> {
    state.resolve(candidates).await
}

#[derive(Deserialize)]
struct ApiRequest {
    path: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Serialize)]
struct ApiResponse {
    status: u16,
    body: String,
}

#[tauri::command]
async fn yani_request(
    state: tauri::State<'_, backend::Backend>,
    request: ApiRequest,
) -> Result<ApiResponse, String> {
    let url = url::Url::parse(&format!("https://api.yani.tv{}", request.path))
        .map_err(|_| "Некорректный адрес API.")?;
    if !request.path.starts_with('/')
        || url.scheme() != "https"
        || url.host_str() != Some("api.yani.tv")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("Некорректный адрес API.".into());
    }
    if !matches!(request.method.as_str(), "GET" | "POST" | "PUT" | "DELETE") {
        return Err("Неизвестный метод API.".into());
    }
    let mut builder = state
        .client
        .request(
            request
                .method
                .parse::<reqwest::Method>()
                .map_err(|_| "Неизвестный метод API.")?,
            url,
        )
        .timeout(Duration::from_secs(15));
    for (name, value) in request.headers {
        if !matches!(
            name.to_ascii_lowercase().as_str(),
            "accept" | "lang" | "x-application" | "authorization" | "content-type"
        ) {
            return Err("Неизвестный заголовок API.".into());
        }
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        if body.len() > 1_000_000 {
            return Err("Слишком большой запрос.".into());
        }
        builder = builder.body(body);
    }
    let mut response = builder.send().await.map_err(|_| "Нет связи с Yani.")?;
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Yani прервал ответ.")? {
        if bytes.len() + chunk.len() > 8_000_000 {
            return Err("Слишком большой ответ Yani.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(ApiResponse {
        status,
        body: String::from_utf8(bytes).map_err(|_| "Некорректный ответ Yani.")?,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(
                    event,
                    tauri::WindowEvent::Focused(false) | tauri::WindowEvent::Destroyed
                )
            {
                let _ = cursor_visibility(window, true);
            }
        })
        .setup(|app| {
            app.manage(backend::Backend::new()?);
            app.manage(session::SessionVault::new(
                app.path().app_data_dir()?.join("account/session-v1.json"),
            ));
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol(
            "yumiwatch-media",
            |context, request, responder| {
                if context.webview_label() != "main" {
                    responder.respond(backend::error(
                        tauri::http::StatusCode::FORBIDDEN,
                        "Unknown webview",
                    ));
                    return;
                }
                let backend = context
                    .app_handle()
                    .state::<backend::Backend>()
                    .inner()
                    .clone();
                tauri::async_runtime::spawn(async move {
                    responder.respond(backend.media(request).await);
                });
            },
        )
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            interface_scale::set_interface_scale,
            set_window_cursor_visible,
            load_account_session,
            save_account_session,
            set_window_controls_visible,
            fetch_image,
            yani_request,
            resolve_candidates
        ])
        .run(tauri::generate_context!())
        .expect("Не удалось запустить YummyWatch");
}
