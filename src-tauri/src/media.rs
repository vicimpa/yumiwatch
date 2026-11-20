//! Native CVH transport for CDNs that reject browser media headers.
use crate::{
    alloha::token,
    providers::{limited_body, Result},
};
use reqwest::Client;
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tauri::http::{HeaderMap, Method, Response};
use tokio::sync::Mutex;
use url::Url;

const CHUNK: u64 = 8 * 1024 * 1024;
struct Session {
    used: Instant,
    resources: HashMap<String, Url>,
    roots: Vec<Url>,
}
impl Session {
    fn register(&mut self, url: Url) -> Result<String> {
        if !self
            .roots
            .iter()
            .any(|root| root.origin() == url.origin() && url.path().starts_with(root.path()))
        {
            return Err("CVH вернул адрес за пределами потока.".into());
        }
        if let Some((id, _)) = self.resources.iter().find(|(_, value)| **value == url) {
            return Ok(id.clone());
        }
        if self.resources.len() >= 4096 {
            return Err("Слишком большой плейлист CVH.".into());
        }
        let id = token();
        self.resources.insert(id.clone(), url);
        Ok(id)
    }
}
#[derive(Clone, Default)]
pub struct Media(Arc<Mutex<HashMap<String, Session>>>);

fn media_url(raw: &str) -> Result<Url> {
    let url = Url::parse(raw).map_err(|_| "Некорректный адрес CVH.")?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || !url.host_str().is_some_and(|host| {
            host.ends_with(".okcdn.ru")
                || host.ends_with(".mycdn.me")
                || host.ends_with(".vkuser.net")
        })
    {
        return Err("Неизвестный CDN CVH.".into());
    }
    Ok(url)
}

fn bounded_range(raw: Option<&str>) -> Result<String> {
    let raw = raw
        .unwrap_or("bytes=0-")
        .strip_prefix("bytes=")
        .ok_or("Некорректный Range.")?;
    let (start, end) = raw.split_once('-').ok_or("Некорректный Range.")?;
    if start.is_empty() {
        let size = end
            .parse::<u64>()
            .ok()
            .filter(|size| *size > 0)
            .ok_or("Некорректный Range.")?;
        return Ok(format!("bytes=-{}", size.min(CHUNK)));
    }
    let start = start.parse::<u64>().map_err(|_| "Некорректный Range.")?;
    let limit = start.checked_add(CHUNK - 1).ok_or("Некорректный Range.")?;
    let end = if end.is_empty() {
        limit
    } else {
        end.parse::<u64>()
            .map_err(|_| "Некорректный Range.")?
            .min(limit)
    };
    if end < start {
        return Err("Некорректный Range.".into());
    }
    Ok(format!("bytes={start}-{end}"))
}

impl Media {
    pub async fn register(&self, mut result: Value) -> Result<Value> {
        let id = token();
        let mut session = Session {
            used: Instant::now(),
            resources: HashMap::new(),
            roots: Vec::new(),
        };
        for stream in result["streams"].as_array_mut().ok_or("Нет потоков CVH.")? {
            let url = media_url(stream["url"].as_str().ok_or("Нет адреса CVH.")?)?;
            session
                .roots
                .push(url.join("./").map_err(|_| "Некорректный поток CVH.")?);
            let resource = session.register(url.clone())?;
            stream["sourceHost"] = Value::String(url.host_str().unwrap().into());
            stream["url"] = Value::String(format!("media/{id}/{resource}"));
        }
        let mut sessions = self.0.lock().await;
        sessions.retain(|_, session| session.used.elapsed() < Duration::from_secs(180));
        if sessions.len() >= 8 {
            if let Some(oldest) = sessions
                .iter()
                .min_by_key(|(_, s)| s.used)
                .map(|(id, _)| id.clone())
            {
                sessions.remove(&oldest);
            }
        }
        sessions.insert(id, session);
        result["relay"] = Value::Bool(true);
        Ok(result)
    }

    pub async fn relay(
        &self,
        client: &Client,
        session: &str,
        resource: &str,
        method: Method,
        headers: HeaderMap,
    ) -> Result<Response<Vec<u8>>> {
        let mut url = {
            let mut sessions = self.0.lock().await;
            let session = sessions
                .get_mut(session)
                .filter(|s| s.used.elapsed() < Duration::from_secs(180))
                .ok_or("Сессия просмотра истекла.")?;
            let url = session
                .resources
                .get(resource)
                .ok_or("Неизвестный ресурс CVH.")?
                .clone();
            session.used = Instant::now();
            url
        };
        let range = bounded_range(headers.get("range").and_then(|v| v.to_str().ok()))?;
        for _ in 0..4 {
            // Only native headers go upstream. Browser Origin/Sec-Fetch/Accept
            // make okcdn reject a playable H.264/AAC file with HTTP 400.
            let mut request = client
                .request(method.clone(), url.clone())
                .timeout(Duration::from_secs(25));
            let path = url.path().to_ascii_lowercase();
            if method == Method::GET
                && !path.ends_with(".m3u8")
                && (headers.contains_key("range") || path.ends_with(".mp4"))
            {
                request = request.header("Range", &range);
            }
            let response = request.send().await.map_err(|_| "Нет связи с CVH.")?;
            if response.status().is_redirection() {
                let location = response
                    .headers()
                    .get("location")
                    .and_then(|v| v.to_str().ok())
                    .ok_or("Некорректное перенаправление CVH.")?;
                url = media_url(
                    url.join(location)
                        .map_err(|_| "Некорректное перенаправление CVH.")?
                        .as_str(),
                )?;
                continue;
            }
            let playlist = response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.to_lowercase().contains("mpegurl"))
                || path.ends_with(".m3u8");
            if playlist && method == Method::GET && response.status().is_success() {
                let bytes = limited_body(response, 512000).await?;
                let text = std::str::from_utf8(&bytes).map_err(|_| "Некорректный плейлист CVH.")?;
                let mut sessions = self.0.lock().await;
                let state = sessions
                    .get_mut(session)
                    .ok_or("Сессия просмотра истекла.")?;
                let text = crate::alloha::rewrite_playlist(text, &url, |raw| {
                    state.register(media_url(raw)?)
                })?;
                return Ok(Response::builder()
                    .header("content-type", "application/vnd.apple.mpegurl")
                    .body(text.into_bytes())
                    .unwrap());
            }
            let mut result = Response::builder().status(response.status());
            for name in [
                "content-type",
                "content-length",
                "content-range",
                "accept-ranges",
            ] {
                if let Some(value) = response.headers().get(name) {
                    result = result.header(name, value);
                }
            }
            let bytes = if method == Method::HEAD || !response.status().is_success() {
                Vec::new()
            } else {
                limited_body(response, 32 * 1024 * 1024).await?
            };
            return Ok(result.body(bytes).unwrap());
        }
        Err("Слишком много перенаправлений CVH.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn bounds_open_ended_suffix_and_explicit_ranges() {
        assert_eq!(bounded_range(Some("bytes=0-1")).unwrap(), "bytes=0-1");
        assert_eq!(
            bounded_range(Some("bytes=100-")).unwrap(),
            "bytes=100-8388707"
        );
        assert_eq!(
            bounded_range(Some("bytes=-99999999")).unwrap(),
            "bytes=-8388608"
        );
        for raw in ["bytes=10-1", "bytes=0-1,5-7", "bytes=-0", "bytes=a-b"] {
            assert!(bounded_range(Some(raw)).is_err());
        }
    }
    #[tokio::test]
    async fn registers_only_known_cdn_urls_and_hides_them_from_media_urls() {
        let media = Media::default();
        let result=media.register(json!({"provider":"CVH","streams":[{"quality":360,"type":"mp4","url":"https://vd249.okcdn.ru/video.mp4"}]})).await.unwrap();
        assert_eq!(result["relay"], true);
        assert!(result["streams"][0]["url"]
            .as_str()
            .unwrap()
            .starts_with("media/"));
        let vk=media.register(json!({"provider":"CVH","streams":[{"quality":360,"type":"hls","url":"https://ok30-3.vkuser.net/video.m3u8?cmd=videoPlayerCdn"}]})).await.unwrap();
        assert_eq!(vk["streams"][0]["sourceHost"], "ok30-3.vkuser.net");
        assert!(media_url("https://ok30-3.vkuser.net.evil.example/video.m3u8").is_err());
        assert!(media
            .register(json!({"streams":[{"url":"https://127.0.0.1/private"}]}))
            .await
            .is_err());
    }
}
