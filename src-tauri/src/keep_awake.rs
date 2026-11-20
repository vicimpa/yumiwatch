use tauri::Webview;

#[tauri::command]
pub async fn set_playback_awake(webview: Webview, playing: bool) -> Result<(), String> {
    if webview.label() != "main" {
        return Err("Управление сном доступно только в главном окне.".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    schedule(&webview, playing, move |result| {
        let _ = send.send(result);
    })
    .map_err(|error| error.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(3), receive)
        .await
        .map_err(|_| "Истекло время ожидания блокировки сна.".to_string())?
        .map_err(|error| error.to_string())?
}

pub fn clear(webview: &Webview) {
    let _ = schedule(webview, false, |_| {});
}

#[cfg(not(target_os = "android"))]
fn schedule(
    webview: &Webview,
    playing: bool,
    done: impl FnOnce(Result<(), String>) + Send + 'static,
) -> tauri::Result<()> {
    let window = webview.window();
    webview.run_on_main_thread(move || done(set(&window, playing)))
}

#[cfg(target_os = "android")]
fn schedule(
    webview: &Webview,
    playing: bool,
    done: impl FnOnce(Result<(), String>) + Send + 'static,
) -> tauri::Result<()> {
    webview.with_webview(move |webview| {
        webview.jni_handle().exec(move |env, _, view| {
            let result = env.call_method(
                view,
                "setKeepScreenOn",
                "(Z)V",
                &[jni::objects::JValue::Bool(u8::from(playing))],
            );
            if result.is_err() && env.exception_check().unwrap_or(false) {
                let _ = env.exception_clear();
            }
            done(result.map(|_| ()).map_err(|error| error.to_string()));
        });
    })
}

#[cfg(not(target_os = "android"))]
pub fn window_destroyed(window: &tauri::Window) {
    let owner = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = set(&owner, false);
    });
}

#[cfg(target_os = "macos")]
fn set(_window: &tauri::Window, playing: bool) -> Result<(), String> {
    use objc2::{rc::Retained, runtime::ProtocolObject};
    use objc2_foundation::{NSActivityOptions, NSObjectProtocol, NSProcessInfo, NSString};
    use std::cell::RefCell;

    thread_local! {
        static ACTIVITY: RefCell<Option<Retained<ProtocolObject<dyn NSObjectProtocol>>>> =
            const { RefCell::new(None) };
    }
    ACTIVITY.with(|activity| {
        let mut activity = activity.borrow_mut();
        if playing && activity.is_none() {
            *activity = Some(
                NSProcessInfo::processInfo().beginActivityWithOptions_reason(
                    NSActivityOptions::IdleDisplaySleepDisabled
                        | NSActivityOptions::IdleSystemSleepDisabled,
                    &NSString::from_str("YummyWatch video playback"),
                ),
            );
        } else if !playing {
            if let Some(token) = activity.take() {
                // The token was returned by beginActivityWithOptions:reason:.
                unsafe { NSProcessInfo::processInfo().endActivity(&token) };
            }
        }
    });
    Ok(())
}

#[cfg(target_os = "windows")]
fn set(_window: &tauri::Window, playing: bool) -> Result<(), String> {
    use windows_sys::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };

    let requirements = if playing {
        ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED
    } else {
        ES_CONTINUOUS
    };
    // Both acquisition and release run on the same window thread.
    if unsafe { SetThreadExecutionState(requirements) } == 0 {
        return Err("Не удалось изменить режим сна Windows.".into());
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn set(window: &tauri::Window, playing: bool) -> Result<(), String> {
    use gtk::prelude::*;
    use std::cell::RefCell;

    thread_local! {
        static INHIBITOR: RefCell<Option<(gtk::Application, u32)>> = const { RefCell::new(None) };
    }
    INHIBITOR.with(|inhibitor| {
        let mut inhibitor = inhibitor.borrow_mut();
        if playing && inhibitor.is_none() {
            let window = window.gtk_window().map_err(|error| error.to_string())?;
            let app = window.application().ok_or("Окно GTK недоступно.")?;
            let cookie = app.inhibit(
                Some(&window),
                gtk::ApplicationInhibitFlags::IDLE,
                Some("YummyWatch video playback"),
            );
            if cookie == 0 {
                return Err("Среда Linux не поддерживает блокировку сна через GTK.".into());
            }
            *inhibitor = Some((app, cookie));
        } else if !playing {
            if let Some((app, cookie)) = inhibitor.take() {
                app.uninhibit(cookie);
            }
        }
        Ok(())
    })
}

#[cfg(target_os = "ios")]
fn set(_window: &tauri::Window, playing: bool) -> Result<(), String> {
    let main = objc2::MainThreadMarker::new().ok_or("Недоступен главный поток UIKit.")?;
    objc2_ui_kit::UIApplication::sharedApplication(main).setIdleTimerDisabled(playing);
    Ok(())
}
