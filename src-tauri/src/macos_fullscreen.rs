//! AppKit can reset the first responder after the last fullscreen resize.
//! Restore WKWebView only after the native transition and queued style changes.
use block2::RcBlock;
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_app_kit::{
    NSView, NSWindow, NSWindowDidEnterFullScreenNotification, NSWindowDidExitFullScreenNotification,
};
use objc2_foundation::{NSNotificationCenter, NSObjectProtocol};
use std::cell::RefCell;

thread_local! {
    // NotificationCenter's block observers live for the application's lifetime.
    static OBSERVERS: RefCell<Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>> = const { RefCell::new(Vec::new()) };
}

pub fn install(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let target = window.clone();
    window.with_webview(move |webview| {
        // Tauri owns both objects; with_webview runs on the main thread.
        let native = unsafe { &*webview.ns_window().cast::<NSWindow>() };
        let center = NSNotificationCenter::defaultCenter();
        for name in unsafe {
            [
                NSWindowDidEnterFullScreenNotification,
                NSWindowDidExitFullScreenNotification,
            ]
        } {
            let target = target.clone();
            let callback = RcBlock::new(move |_| {
                let target = target.clone();
                // Tao queues setStyleMask/makeFirstResponder during the same
                // notification. Run after every observer has finished first.
                dispatch2::DispatchQueue::main().exec_async(move || {
                    let _ = target.with_webview(move |webview| {
                        let native = unsafe { &*webview.ns_window().cast::<NSWindow>() };
                        let view = unsafe { &*webview.inner().cast::<NSView>() };
                        native.makeKeyAndOrderFront(None);
                        native.makeFirstResponder(Some(view));
                    });
                });
            });
            let observer = unsafe {
                center.addObserverForName_object_queue_usingBlock(
                    Some(name),
                    Some(native),
                    None,
                    &callback,
                )
            };
            OBSERVERS.with(|observers| observers.borrow_mut().push(observer));
        }
    })
}
