use super::Activity;
use serde_json::{json, Value};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

trait Pipe: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Pipe for T {}
pub(super) struct Connection(Box<dyn Pipe>);

impl Connection {
    async fn write_frame(&mut self, opcode: u32, payload: &Value) -> Result<(), String> {
        let bytes = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
        self.0
            .write_u32_le(opcode)
            .await
            .map_err(|e| e.to_string())?;
        self.0
            .write_u32_le(bytes.len() as u32)
            .await
            .map_err(|e| e.to_string())?;
        self.0.write_all(&bytes).await.map_err(|e| e.to_string())
    }

    async fn read_frame(&mut self) -> Result<(u32, Value), String> {
        let opcode = self.0.read_u32_le().await.map_err(|e| e.to_string())?;
        let length = self.0.read_u32_le().await.map_err(|e| e.to_string())?;
        if length > 64 * 1024 {
            return Err("Discord frame too large".into());
        }
        let mut bytes = vec![0; length as usize];
        self.0
            .read_exact(&mut bytes)
            .await
            .map_err(|e| e.to_string())?;
        Ok((
            opcode,
            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?,
        ))
    }

    async fn response(&mut self) -> Result<Value, String> {
        loop {
            let (opcode, payload) = self.read_frame().await?;
            match opcode {
                1 if payload["evt"] == "ERROR" => return Err("Discord rejected activity".into()),
                1 => return Ok(payload),
                3 => self.write_frame(4, &payload).await?,
                _ => return Err("Discord disconnected".into()),
            }
        }
    }

    async fn handshake(&mut self, application_id: &str) -> Result<(), String> {
        self.write_frame(0, &json!({ "v": 1, "client_id": application_id }))
            .await?;
        if self.response().await?["evt"] != "READY" {
            return Err("Discord not ready".into());
        }
        Ok(())
    }

    pub(super) async fn set_activity(&mut self, activity: Option<&Activity>) -> Result<(), String> {
        self.write_frame(
            1,
            &json!({
                "cmd": "SET_ACTIVITY", "nonce": "yummywatch",
                "args": { "pid": std::process::id(), "activity": activity.map(Activity::payload) }
            }),
        )
        .await?;
        self.response().await?;
        Ok(())
    }
}

pub(super) async fn connect(application_id: &str) -> Result<Connection, String> {
    #[cfg(unix)]
    {
        let mut roots: Vec<std::path::PathBuf> = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"]
            .iter()
            .filter_map(std::env::var_os)
            .map(Into::into)
            .collect();
        roots.push("/tmp".into());
        for root in roots {
            for subpath in [
                "",
                "app/com.discordapp.Discord",
                "app/dev.vencord.Vesktop",
                "snap.discord",
                "snap.discord-canary",
            ] {
                for index in 0..10 {
                    let path = root.join(subpath).join(format!("discord-ipc-{index}"));
                    if let Ok(socket) = tokio::net::UnixStream::connect(path).await {
                        let mut connection = Connection(Box::new(socket));
                        if connection.handshake(application_id).await.is_ok() {
                            return Ok(connection);
                        }
                    }
                }
            }
        }
    }
    #[cfg(windows)]
    for index in 0..10 {
        let path = format!(r"\\?\pipe\discord-ipc-{index}");
        if let Ok(pipe) = tokio::net::windows::named_pipe::ClientOptions::new().open(path) {
            let mut connection = Connection(Box::new(pipe));
            if connection.handshake(application_id).await.is_ok() {
                return Ok(connection);
            }
        }
    }
    Err("Discord is not running".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{timeout, Duration};

    fn pair() -> (Connection, Connection) {
        let (client, server) = tokio::io::duplex(8192);
        (Connection(Box::new(client)), Connection(Box::new(server)))
    }

    fn activity() -> Activity {
        serde_json::from_value(json!({
            "details": "Монолог фармацевта",
            "state": "Серия 2 · Воспроизводится",
            "animeUrl": "https://ru.yummyani.me/catalog/item/monolog-farmatsevta",
            "largeImage": "https://static.yani.tv/poster.webp",
            "timestamps": { "start": 1000, "end": 2000 }
        }))
        .unwrap()
    }

    #[tokio::test]
    async fn exchanges_handshake_activity_pause_and_clear_with_discord() {
        let (mut client, mut server) = pair();
        let fake_discord = async move {
            let (opcode, handshake) = server.read_frame().await.unwrap();
            assert_eq!(opcode, 0);
            assert_eq!(
                handshake,
                json!({ "v": 1, "client_id": "1571940571214520440" })
            );
            server
                .write_frame(1, &json!({ "evt": "READY" }))
                .await
                .unwrap();

            let (opcode, command) = server.read_frame().await.unwrap();
            assert_eq!(opcode, 1);
            assert_eq!(command["cmd"], "SET_ACTIVITY");
            assert_eq!(command["args"]["pid"], std::process::id());
            let activity = &command["args"]["activity"];
            assert_eq!(activity["type"], 3);
            assert_eq!(activity["status_display_type"], 2);
            assert_eq!(activity["name"], "YummyWatch");
            assert_eq!(activity["details"], "Монолог фармацевта");
            assert_eq!(activity["timestamps"]["start"], 1000);
            assert_eq!(activity["timestamps"]["end"], 2000);
            assert_eq!(activity["buttons"].as_array().unwrap().len(), 2);
            assert_eq!(
                activity["assets"]["large_image"],
                "https://static.yani.tv/poster.webp"
            );

            server.write_frame(3, &json!({ "ping": 42 })).await.unwrap();
            assert_eq!(
                server.read_frame().await.unwrap(),
                (4, json!({ "ping": 42 }))
            );
            server
                .write_frame(1, &json!({ "cmd": "SET_ACTIVITY" }))
                .await
                .unwrap();

            let (_, pause) = server.read_frame().await.unwrap();
            assert_eq!(pause["args"]["activity"]["state"], "Серия 2 · На паузе");
            assert!(pause["args"]["activity"].get("timestamps").is_none());
            server
                .write_frame(1, &json!({ "cmd": "SET_ACTIVITY" }))
                .await
                .unwrap();

            let (_, clear) = server.read_frame().await.unwrap();
            assert!(clear["args"]["activity"].is_null());
            server
                .write_frame(1, &json!({ "cmd": "SET_ACTIVITY" }))
                .await
                .unwrap();
        };
        let player = async move {
            client.handshake("1571940571214520440").await.unwrap();
            let mut activity = activity();
            client.set_activity(Some(&activity)).await.unwrap();
            activity.timestamps = None;
            activity.state = "Серия 2 · На паузе".into();
            client.set_activity(Some(&activity)).await.unwrap();
            client.set_activity(None).await.unwrap();
        };

        timeout(Duration::from_secs(1), async {
            tokio::join!(fake_discord, player);
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn rejects_rpc_errors_and_disconnects() {
        let (mut client, mut server) = pair();
        server
            .write_frame(1, &json!({ "evt": "ERROR", "data": { "code": 4000 } }))
            .await
            .unwrap();
        assert!(client.response().await.is_err());
        server.write_frame(2, &json!({})).await.unwrap();
        assert!(client.response().await.is_err());
    }

    #[tokio::test]
    async fn bounds_frames_and_waiting_for_an_unresponsive_client() {
        let (mut client, mut server) = pair();
        server.0.write_u32_le(1).await.unwrap();
        server.0.write_u32_le(65537).await.unwrap();
        assert!(client.read_frame().await.is_err());

        let (mut client, _server) = pair();
        assert!(timeout(
            Duration::from_millis(10),
            client.handshake("1571940571214520440")
        )
        .await
        .is_err());
    }

    #[test]
    fn validates_external_links_and_limits_discord_text_without_breaking_unicode() {
        let mut value = activity();
        assert!(value.validate().is_ok());
        value.anime_url = Some("https://user:password@example.com/".into());
        assert!(value.validate().is_err());
        value.anime_url = Some("http://example.com/".into());
        assert!(value.validate().is_err());
        value.anime_url = Some("https://example.com/".into());
        value.details = "Я".repeat(200);
        assert_eq!(
            value.payload()["details"].as_str().unwrap().chars().count(),
            128
        );
    }

    #[test]
    fn shows_search_in_the_member_list_without_an_anime_link_or_timer() {
        let value: Activity = serde_json::from_value(json!({
            "type": 0,
            "details": "Ищет «One Piece»",
            "state": "В поиске"
        }))
        .unwrap();
        assert!(value.validate().is_ok());
        let payload = value.payload();
        assert_eq!(payload["type"], 0);
        assert_eq!(payload["status_display_type"], 2);
        assert_eq!(payload["details"], "Ищет «One Piece»");
        assert_eq!(payload["buttons"].as_array().unwrap().len(), 1);
        assert!(payload["assets"]["large_image"].is_string());
        assert!(payload.get("timestamps").is_none());
    }

    #[test]
    fn rejects_invalid_progress_timestamps() {
        for timestamps in [
            json!({"start": -1, "end": 2000}),
            json!({"start": 2000, "end": 1000}),
        ] {
            let mut value = activity();
            value.timestamps = Some(serde_json::from_value(timestamps).unwrap());
            assert!(value.validate().is_err());
        }
    }
    #[tokio::test(start_paused = true)]
    async fn reconnects_after_discord_starts_and_restarts_without_replaying_old_state() {
        use crate::discord::{run, Update};
        use std::collections::VecDeque;
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        use tokio::sync::watch;
        use tokio::time::{advance, Instant};

        let (first, mut first_server) = pair();
        let (second, mut second_server) = pair();
        let mut connections = VecDeque::from([Err("not running".into()), Ok(first), Ok(second)]);
        let attempts = Arc::new(AtomicUsize::new(0));
        let opened = attempts.clone();
        let (sender, receiver) = watch::channel(None);
        let worker = tokio::spawn(run(receiver, move |_| {
            opened.fetch_add(1, Ordering::SeqCst);
            std::future::ready(connections.pop_front().unwrap_or(Err("not running".into())))
        }));
        let update = || {
            Some(Update {
                application_id: "1571940571214520440".into(),
                activity: Some(activity()),
                received: Instant::now(),
            })
        };

        sender.send_replace(update());
        tokio::task::yield_now().await;
        assert_eq!(attempts.load(Ordering::SeqCst), 1);

        advance(Duration::from_secs(5)).await;
        sender.send_replace(update());
        tokio::task::yield_now().await;
        assert_eq!(attempts.load(Ordering::SeqCst), 1);

        advance(Duration::from_secs(10)).await;
        sender.send_replace(update());
        let (_, playing) = first_server.read_frame().await.unwrap();
        assert!(playing["args"]["activity"]["state"]
            .as_str()
            .unwrap()
            .contains("Воспроизводится"));
        first_server
            .write_frame(1, &json!({ "cmd": "SET_ACTIVITY" }))
            .await
            .unwrap();
        tokio::task::yield_now().await;
        drop(first_server);

        let mut paused = update().unwrap();
        paused.activity.as_mut().unwrap().state = "Серия 2 · На паузе".into();
        paused.activity.as_mut().unwrap().timestamps = None;
        sender.send_replace(Some(paused.clone()));
        tokio::task::yield_now().await;
        advance(Duration::from_secs(15)).await;
        paused.received = Instant::now();
        sender.send_replace(Some(paused));

        let (_, restored) = second_server.read_frame().await.unwrap();
        assert_eq!(restored["args"]["activity"]["state"], "Серия 2 · На паузе");
        second_server
            .write_frame(1, &json!({ "cmd": "SET_ACTIVITY" }))
            .await
            .unwrap();
        tokio::task::yield_now().await;

        sender.send_replace(None);
        let (_, clear) = second_server.read_frame().await.unwrap();
        assert!(clear["args"]["activity"].is_null());
        second_server
            .write_frame(1, &json!({ "cmd": "SET_ACTIVITY" }))
            .await
            .unwrap();
        drop(sender);
        worker.await.unwrap();
    }

    #[tokio::test(start_paused = true)]
    async fn clears_presence_when_frontend_heartbeats_stop() {
        use crate::discord::{run, Update};
        use tokio::sync::{mpsc, watch};
        use tokio::time::{advance, Instant};

        let (client, mut server) = pair();
        let mut client = Some(client);
        let (sender, receiver) = watch::channel(None);
        let (events, mut observed) = mpsc::unbounded_channel();
        let worker = tokio::spawn(run(receiver, move |_| {
            std::future::ready(client.take().ok_or("not running".into()))
        }));
        let fake_discord = tokio::spawn(async move {
            while let Ok((_, value)) = server.read_frame().await {
                events.send(value["args"]["activity"].clone()).unwrap();
                server
                    .write_frame(1, &json!({ "cmd": "SET_ACTIVITY" }))
                    .await
                    .unwrap();
            }
        });

        sender.send_replace(Some(Update {
            application_id: "1571940571214520440".into(),
            activity: Some(activity()),
            received: Instant::now(),
        }));
        assert!(!observed.recv().await.unwrap().is_null());
        tokio::task::yield_now().await;
        advance(Duration::from_secs(46)).await;
        assert!(observed.recv().await.unwrap().is_null());
        drop(sender);
        worker.await.unwrap();
        fake_discord.await.unwrap();
    }
}
