use std::{sync::Mutex, time::Duration};
use tauri::{Manager, WebviewWindow};
use tokio::sync::oneshot;

#[derive(Default)]
pub struct Shutdown(Mutex<Option<Request>>);

struct Request {
    quit: bool,
    saved: Option<oneshot::Sender<()>>,
}

pub fn save_then_close(window: WebviewWindow, quit: bool) {
    let app = window.app_handle().clone();
    let shutdown = app.state::<Shutdown>();
    let (sender, receiver) = oneshot::channel();
    {
        let mut request = shutdown.0.lock().unwrap();
        if let Some(request) = request.as_mut() {
            request.quit |= quit;
            return;
        }
        *request = Some(Request {
            quit,
            saved: Some(sender),
        });
    }

    // Sample libmpv on the main thread before AppKit enters its termination loop.
    #[cfg(target_os = "macos")]
    let positions = serde_json::to_string(&crate::native_video::closing_positions())
        .unwrap_or_else(|_| "{}".into());
    #[cfg(not(target_os = "macos"))]
    let positions = "{}";
    let notified = window
        .eval(format!("window.dispatchEvent(new CustomEvent('yumiwatch:window-close-requested', {{ detail: {positions} }}))"))
        .is_ok();
    tauri::async_runtime::spawn(async move {
        if notified {
            // A WebView that is starting or has stopped responding must still be closable.
            let _ = tokio::time::timeout(Duration::from_millis(1500), receiver).await;
        }
        let quit = app
            .state::<Shutdown>()
            .0
            .lock()
            .unwrap()
            .take()
            .is_some_and(|request| request.quit);
        match quit {
            #[cfg(target_os = "macos")]
            true => crate::macos_window::finish_quit(),
            _ => {
                let _ = window.destroy();
            }
        }
    });
}

#[tauri::command]
pub fn window_close_saved(window: WebviewWindow, shutdown: tauri::State<'_, Shutdown>) {
    if window.label() != "main" {
        return;
    }
    let mut request = shutdown.0.lock().unwrap();
    if let Some(sender) = request.as_mut().and_then(|request| request.saved.take()) {
        let _ = sender.send(());
    }
}
