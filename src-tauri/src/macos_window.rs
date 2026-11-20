//! Connect AppKit window transitions to WKWebView.
use block2::RcBlock;
use objc2::{
    ffi,
    rc::Retained,
    runtime::{AnyObject, Imp, ProtocolObject, Sel},
    sel, MainThreadMarker,
};
use objc2_app_kit::{
    NSApplication, NSApplicationTerminateReply, NSView, NSWindow,
    NSWindowDidEndLiveResizeNotification, NSWindowDidEnterFullScreenNotification,
    NSWindowDidExitFullScreenNotification, NSWindowWillStartLiveResizeNotification,
};
use objc2_foundation::{NSNotificationCenter, NSObjectProtocol, NSString};
use std::cell::RefCell;
use tauri::Manager;

thread_local! {
    // NotificationCenter's block observers live for the application's lifetime.
    static OBSERVERS: RefCell<Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>> = const { RefCell::new(Vec::new()) };
    static QUIT_APP: RefCell<Option<tauri::AppHandle>> = const { RefCell::new(None) };
}

extern "C-unwind" fn should_terminate(
    _delegate: &AnyObject,
    _selector: Sel,
    _application: &NSApplication,
) -> NSApplicationTerminateReply {
    let window = QUIT_APP.with(|app| app.borrow().as_ref()?.get_webview_window("main"));
    let Some(window) = window else {
        return NSApplicationTerminateReply::TerminateNow;
    };
    crate::shutdown::save_then_close(window, true);
    NSApplicationTerminateReply::TerminateLater
}

fn install_quit(window: &tauri::WebviewWindow) {
    let application = NSApplication::sharedApplication(MainThreadMarker::new().unwrap());
    let Some(delegate) = application.delegate() else {
        return;
    };
    // Tao owns the application delegate. Add its missing termination callback
    // without replacing the delegate or intercepting its other methods.
    let installed = unsafe {
        let class = ffi::object_getClass(Retained::as_ptr(&delegate).cast());
        let method: extern "C-unwind" fn(_, _, _) -> _ = should_terminate;
        let implementation: Imp = std::mem::transmute(method);
        ffi::class_addMethod(
            class.cast_mut(),
            sel!(applicationShouldTerminate:),
            implementation,
            c"Q@:@".as_ptr(),
        )
    };
    if installed.as_bool() {
        QUIT_APP.with(|app| *app.borrow_mut() = Some(window.app_handle().clone()));
    }
}

pub fn finish_quit() {
    dispatch2::DispatchQueue::main().exec_async(|| {
        let application = NSApplication::sharedApplication(MainThreadMarker::new().unwrap());
        application.replyToApplicationShouldTerminate(true);
    });
}

pub fn install(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let target = window.clone();
    window.with_webview(move |webview| {
        install_quit(&target);
        // Tauri owns both objects; with_webview runs on the main thread.
        let native = unsafe { &*webview.ns_window().cast::<NSWindow>() };
        let view = unsafe { &*webview.inner().cast::<NSView>() };
        let center = NSNotificationCenter::defaultCenter();
        let return_target = target.clone();
        let return_to_player = RcBlock::new(move |_| {
            let _ =
                return_target.eval("window.dispatchEvent(new Event('yumiwatch:return-to-player'))");
        });
        let return_observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(&NSString::from_str("YummyWatchReturnToPlayer")),
                Some(view),
                None,
                &return_to_player,
            )
        };
        OBSERVERS.with(|observers| observers.borrow_mut().push(return_observer));
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
                    let _ = target
                        .eval("window.dispatchEvent(new Event('yumiwatch:native-fullscreen'))");
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
        for (name, script) in unsafe {
            [
                (
                    NSWindowWillStartLiveResizeNotification,
                    "document.documentElement.setAttribute('data-live-resize', '')",
                ),
                (
                    NSWindowDidEndLiveResizeNotification,
                    "document.documentElement.removeAttribute('data-live-resize')",
                ),
            ]
        } {
            let target = target.clone();
            let callback = RcBlock::new(move |_| {
                let _ = target.eval(script);
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
