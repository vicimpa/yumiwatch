mod ipc;

use ipc::{connect, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::sync::watch;
use tokio::time::{timeout, Instant};

const RETRY_INTERVAL: Duration = Duration::from_secs(15);
const IO_TIMEOUT: Duration = Duration::from_secs(2);
const STALE_AFTER: Duration = Duration::from_secs(45);
const DOWNLOAD_URL: &str = "https://github.com/vicimpa/yummywatch/releases/latest";
const APP_ICON: &str =
    "https://raw.githubusercontent.com/vicimpa/yummywatch/main/public/icons/icon-192.png";

#[derive(Clone, Deserialize, Serialize)]
struct Timestamps {
    start: i64,
    end: i64,
}

fn watching_activity() -> u8 {
    3
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    #[serde(rename = "type", default = "watching_activity")]
    kind: u8,
    details: String,
    state: String,
    anime_url: Option<String>,
    large_image: Option<String>,
    timestamps: Option<Timestamps>,
}

impl Activity {
    fn payload(&self) -> Value {
        let mut buttons = Vec::new();
        if let Some(url) = &self.anime_url {
            buttons.push(json!({"label": "Об аниме", "url": url}));
        }
        buttons.push(json!({"label": "Скачать YummyWatch", "url": DOWNLOAD_URL}));

        let mut value = json!({
            "type": self.kind,
            "name": "YummyWatch",
            "status_display_type": 2,
            "details": self.details.chars().take(128).collect::<String>(),
            "state": self.state.chars().take(128).collect::<String>(),
            "assets": { "large_image": APP_ICON, "large_text": "YummyWatch", "small_image": APP_ICON, "small_text": "YummyWatch" },
            "buttons": buttons
        });
        if let Some(image) = &self.large_image {
            value["assets"]["large_image"] = json!(image);
            value["assets"]["large_text"] =
                json!(self.details.chars().take(128).collect::<String>());
        }
        if let Some(timestamps) = &self.timestamps {
            value["timestamps"] = json!(timestamps);
        }
        value
    }

    fn validate(&self) -> Result<(), String> {
        if !matches!(self.kind, 0 | 3)
            || self.details.is_empty()
            || self.details.len() > 4096
            || self.state.len() > 512
        {
            return Err("Некорректный статус Discord.".into());
        }
        if let Some(time) = &self.timestamps {
            if time.start < 0 || time.end <= time.start {
                return Err("Некорректное время Discord.".into());
            }
        }
        for raw in self.anime_url.iter().chain(self.large_image.iter()) {
            let url = url::Url::parse(raw).map_err(|_| "Некорректная ссылка Discord.")?;
            if raw.len() > 2048
                || url.scheme() != "https"
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
            {
                return Err("Некорректная ссылка Discord.".into());
            }
        }
        Ok(())
    }
}

#[derive(Clone)]
struct Update {
    application_id: String,
    activity: Option<Activity>,
    received: Instant,
}

pub struct DiscordPresence(watch::Sender<Option<Update>>);

impl DiscordPresence {
    pub fn new() -> Self {
        let (sender, receiver) = watch::channel(None);
        tauri::async_runtime::spawn(run(receiver, |id| async move { connect(&id).await }));
        Self(sender)
    }
}

#[tauri::command]
pub fn set_discord_presence(
    state: tauri::State<'_, DiscordPresence>,
    application_id: String,
    activity: Option<Activity>,
) -> Result<(), String> {
    if !(17..=20).contains(&application_id.len())
        || !application_id.bytes().all(|c| c.is_ascii_digit())
    {
        return Err("Некорректный Application ID Discord.".into());
    }
    if let Some(value) = &activity {
        value.validate()?;
    }
    state.0.send_replace(Some(Update {
        application_id,
        activity,
        received: Instant::now(),
    }));
    Ok(())
}

async fn run<F, Fut>(mut updates: watch::Receiver<Option<Update>>, mut open: F)
where
    F: FnMut(String) -> Fut,
    Fut: std::future::Future<Output = Result<Connection, String>>,
{
    let mut connection: Option<Connection> = None;
    let mut application_id = String::new();
    let mut retry_at = Instant::now();
    loop {
        let changed = timeout(RETRY_INTERVAL, updates.changed()).await;
        if matches!(changed, Ok(Err(_))) {
            break;
        }
        let update = updates.borrow_and_update().clone();
        let desired = update
            .as_ref()
            .filter(|value| value.received.elapsed() < STALE_AFTER);
        let activity = desired.and_then(|value| value.activity.as_ref());
        let (Some(desired), Some(activity)) = (desired, activity) else {
            if let Some(mut current) = connection.take() {
                let _ = timeout(IO_TIMEOUT, current.set_activity(None)).await;
            }
            continue;
        };
        let desired_id = &desired.application_id;
        if application_id != *desired_id {
            connection = None;
            application_id.clone_from(desired_id);
        }
        if connection.is_none() {
            if Instant::now() < retry_at {
                continue;
            }
            connection = timeout(IO_TIMEOUT, open(desired_id.clone()))
                .await
                .ok()
                .and_then(Result::ok);
            retry_at = Instant::now() + RETRY_INTERVAL;
        }
        if let Some(current) = connection.as_mut() {
            if !matches!(
                timeout(IO_TIMEOUT, current.set_activity(Some(activity))).await,
                Ok(Ok(()))
            ) {
                connection = None;
            }
        }
    }
    if let Some(mut current) = connection {
        let _ = timeout(IO_TIMEOUT, current.set_activity(None)).await;
    }
}
