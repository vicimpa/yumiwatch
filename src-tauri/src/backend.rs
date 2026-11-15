use reqwest::Client;
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tauri::http::{header, Method, Request, Response, StatusCode};
use tokio::sync::{Mutex, Semaphore};

use crate::{
    alloha::{self, Sessions},
    providers::{self, Candidate},
};

type Cache = Arc<Mutex<HashMap<String, (Instant, Value)>>>;

/// Native state only: no server, listener, child process, or bound socket.
#[derive(Clone)]
pub struct Backend {
    pub client: Client,
    sessions: Sessions,
    cache: Cache,
    transfers: Arc<Semaphore>,
    media: crate::media::Media,
}

impl Backend {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: Client::builder()
                .user_agent("Mozilla/5.0")
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(8))
                .build()?,
            sessions: Arc::default(),
            cache: Arc::default(),
            transfers: Arc::new(Semaphore::new(4)),
            media: crate::media::Media::default(),
        })
    }

    pub async fn resolve(&self, candidates: Vec<Candidate>) -> Result<Value, String> {
        if candidates.is_empty()
            || candidates.len() > 12
            || candidates
                .iter()
                .any(|c| c.url.len() > 4096 || c.dubbing.len() > 512 || c.episode.len() > 32)
        {
            return Err("Нужны источники выбранной серии.".into());
        }
        let key = serde_json::to_string(&candidates)
            .map_err(|_| "Некорректные источники.".to_string())?;
        {
            let cache = self.cache.lock().await;
            if let Some((_, value)) = cache
                .get(&key)
                .filter(|(time, _)| time.elapsed() < Duration::from_secs(30))
            {
                return Ok(value.clone());
            }
        }
        let result = tokio::time::timeout(Duration::from_secs(28), async {
            let mut errors = Vec::new();
            for candidate in candidates {
                let result = match providers::provider_url(&candidate.url) {
                    Ok((url, "alloha")) => {
                        alloha::resolve(&url, &candidate, &self.client, &self.sessions).await
                    }
                    Ok(_) => providers::resolve(&candidate, &self.client).await,
                    Err(error) => Err(error),
                };
                let result = match result {
                    Ok(value) if value["provider"] == "Aksor" => {
                        self.available_aksor_streams(value).await
                    }
                    other => other,
                };
                match result {
                    Ok(result) => {
                        return if result["provider"] == "CVH" {
                            self.media.register(result).await
                        } else {
                            Ok(result)
                        }
                    }
                    Err(error) => {
                        if !errors.contains(&error) {
                            errors.push(error);
                        }
                    }
                }
            }
            Err(errors.join(" "))
        })
        .await
        .map_err(|_| "Источники не ответили вовремя. Попробуй другую озвучку.".to_string())??;
        let mut cache = self.cache.lock().await;
        cache.retain(|_, (time, _)| time.elapsed() < Duration::from_secs(30));
        if cache.len() >= 64 {
            if let Some(oldest) = cache
                .iter()
                .min_by_key(|(_, (time, _))| time)
                .map(|(key, _)| key.clone())
            {
                cache.remove(&oldest);
            }
        }
        cache.insert(key, (Instant::now(), result.clone()));
        Ok(result)
    }

    async fn available_aksor_streams(&self, mut result: Value) -> Result<Value, String> {
        let mut probes = tokio::task::JoinSet::new();
        let mut seen = std::collections::HashSet::new();
        for stream in result["streams"].as_array().ok_or("Нет потоков Aksor.")? {
            let Some(raw) = stream["url"].as_str() else {
                continue;
            };
            let Ok(url) = url::Url::parse(raw) else {
                continue;
            };
            if !url
                .host_str()
                .is_some_and(|host| host.ends_with(".aksor.tv"))
                || !seen.insert(raw.to_owned())
            {
                continue;
            }
            let client = self.client.clone();
            let raw = raw.to_owned();
            probes.spawn(async move {
                let missing = client
                    .head(&raw)
                    .timeout(Duration::from_secs(2))
                    .send()
                    .await
                    .is_ok_and(|response| matches!(response.status().as_u16(), 404 | 410));
                (raw, missing)
            });
        }
        let mut missing = std::collections::HashSet::new();
        while let Some(probe) = probes.join_next().await {
            if let Ok((url, true)) = probe {
                missing.insert(url);
            }
        }
        let streams = result["streams"]
            .as_array_mut()
            .ok_or("Нет потоков Aksor.")?;
        streams.retain(|stream| {
            !stream["url"]
                .as_str()
                .is_some_and(|url| missing.contains(url))
        });
        if streams.is_empty() {
            return Err("Aksor удалил видеопоток (HTTP 404/410).".into());
        }
        Ok(result)
    }

    /// Tauri/WebView intercepts this scheme in-process. It never reaches the network stack.
    pub async fn media(&self, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
        let origin = request.headers().get(header::ORIGIN).cloned();
        if origin
            .as_ref()
            .is_some_and(|value| !local_origin(value.to_str().unwrap_or("")))
        {
            return error(StatusCode::FORBIDDEN, "Local origins only");
        }
        let mut response = if request.method() == Method::OPTIONS {
            Response::builder()
                .status(StatusCode::NO_CONTENT)
                .body(Vec::new())
                .unwrap()
        } else {
            let ids: Vec<_> = request
                .uri()
                .path()
                .trim_start_matches('/')
                .split('/')
                .collect();
            if ids.len() != 3
                || !matches!(ids[0], "alloha" | "media")
                || ids[1..].iter().any(|id| {
                    id.len() != 32
                        || !id
                            .bytes()
                            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
                })
            {
                return error(StatusCode::NOT_FOUND, "Unknown resource");
            }
            if !matches!(*request.method(), Method::GET | Method::HEAD) {
                return error(StatusCode::METHOD_NOT_ALLOWED, "Method not allowed");
            }
            let _permit = self
                .transfers
                .acquire()
                .await
                .expect("transfer semaphore closed");
            let result = if ids[0] == "media" {
                self.media
                    .relay(
                        &self.client,
                        ids[1],
                        ids[2],
                        request.method().clone(),
                        request.headers().clone(),
                    )
                    .await
            } else {
                alloha::relay(
                    &self.client,
                    &self.sessions,
                    ids[1],
                    ids[2],
                    request.method().clone(),
                    request.headers().clone(),
                )
                .await
            };
            match result {
                Ok(response) => response,
                Err(message) => error(
                    if message.contains("истекла") {
                        StatusCode::GONE
                    } else {
                        StatusCode::BAD_GATEWAY
                    },
                    &message,
                ),
            }
        };
        let headers = response.headers_mut();
        headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            "GET, HEAD, OPTIONS".parse().unwrap(),
        );
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            "Range, Content-Type".parse().unwrap(),
        );
        headers.insert(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Content-Length, Content-Range, Accept-Ranges"
                .parse()
                .unwrap(),
        );
        if let Some(origin) = origin {
            headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
            headers.insert(header::VARY, "Origin".parse().unwrap());
        }
        response
    }
}

fn local_origin(origin: &str) -> bool {
    if matches!(
        origin,
        "tauri://localhost" | "http://tauri.localhost" | "https://tauri.localhost"
    ) {
        return true;
    }
    // Vite is used only during development, never in the packaged application.
    cfg!(debug_assertions)
        && url::Url::parse(origin).is_ok_and(|url| {
            url.scheme() == "http"
                && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
                && url.path() == "/"
        })
}

pub fn error(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::tests::candidate;

    #[tokio::test]
    #[ignore = "requires live Yani/provider network access"]
    async fn live_provider_transport() {
        let backend = Backend::new().unwrap();
        let mut failures = Vec::new();
        let hls_uri = regex::Regex::new(r#"URI="([^"]+)""#).unwrap();
        for (anime, family) in [
            (10531, "aksor"),
            (10531, "kodik"),
            (10531, "alloha"),
            (26053, "cvh"),
            (21747, "cvh"),
            (21747, "kodik"),
            (21747, "alloha"),
        ] {
            let payload: Value = backend
                .client
                .get(format!("https://api.yani.tv/anime/{anime}/videos"))
                .timeout(Duration::from_secs(15))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            let videos = payload["response"].as_array().expect("Yani videos");
            let video = videos
                .iter()
                .filter(|v| {
                    providers::provider_url(v["iframe_url"].as_str().unwrap_or(""))
                        .is_ok_and(|(_, f)| f == family)
                })
                .min_by_key(|v| {
                    (
                        !v["data"]["dubbing"]
                            .as_str()
                            .unwrap_or("")
                            .contains(if anime == 21747 { "SHIZA" } else { "AniLibria" }),
                        v["number"]
                            .as_str()
                            .unwrap_or("")
                            .parse::<u32>()
                            .unwrap_or(9999),
                    )
                })
                .expect("provider fixture");
            let input = Candidate {
                url: video["iframe_url"].as_str().unwrap().into(),
                video_id: video["video_id"].as_u64().unwrap(),
                dubbing: video["data"]["dubbing"].as_str().unwrap().into(),
                episode: video["number"].as_str().unwrap().into(),
            };
            let result = match backend.resolve(vec![input]).await {
                Ok(value) => value,
                Err(error) => {
                    println!("{family}: resolver failed: {error}");
                    failures.push(family);
                    continue;
                }
            };
            let stream = result["streams"]
                .as_array()
                .unwrap()
                .iter()
                .min_by_key(|s| s["quality"].as_u64().unwrap())
                .unwrap();
            let path = stream["url"].as_str().unwrap();
            if result["relay"] == true {
                let mut resource =
                    url::Url::parse(&format!("yumiwatch-media://localhost/{path}")).unwrap();
                let mut loaded_segment = false;
                for _ in 0..4 {
                    let response = backend
                        .media(
                            Request::builder()
                                .uri(resource.as_str())
                                .header("Origin", "tauri://localhost")
                                .body(vec![])
                                .unwrap(),
                        )
                        .await;
                    println!(
                        "{family}: native resource {}, bytes={}",
                        response.status(),
                        response.body().len()
                    );
                    if !response.status().is_success() {
                        break;
                    }
                    if !response.body().starts_with(b"#EXTM3U") {
                        loaded_segment = !response.body().is_empty();
                        break;
                    }
                    let manifest = std::str::from_utf8(response.body()).unwrap();
                    // Encryption keys and initialization also use the registered protocol.
                    for line in manifest.lines().filter(|line| {
                        line.starts_with("#EXT-X-KEY:") || line.starts_with("#EXT-X-MAP:")
                    }) {
                        if let Some(captures) = hls_uri.captures(line) {
                            let response = backend
                                .media(
                                    Request::builder()
                                        .uri(resource.join(&captures[1]).unwrap().as_str())
                                        .header("Origin", "tauri://localhost")
                                        .body(vec![])
                                        .unwrap(),
                                )
                                .await;
                            assert!(response.status().is_success(), "HLS key/init failed");
                        }
                    }
                    let next = manifest
                        .lines()
                        .find(|line| !line.starts_with('#') && !line.trim().is_empty())
                        .expect("HLS resource");
                    resource = resource.join(next).unwrap();
                }
                if !loaded_segment {
                    failures.push(family);
                }
            } else {
                // Match the browser: follow media redirects and omit Origin for
                // native MP4, which has no CORS requirement.
                let client = Client::builder()
                    .redirect(reqwest::redirect::Policy::limited(5))
                    .build()
                    .unwrap();
                let mut request = client
                    .get(path)
                    .header("Range", "bytes=0-1023")
                    .timeout(Duration::from_secs(20));
                if stream["type"] != "mp4" {
                    request = request.header("Origin", "tauri://localhost");
                }
                match request.send().await {
                    Ok(response) => {
                        println!(
                            "{family}: {} {} CORS={:?}",
                            stream["type"],
                            response.status(),
                            response.headers().get("access-control-allow-origin")
                        );
                        if !response.status().is_success() {
                            failures.push(family);
                        }
                    }
                    Err(_) => {
                        println!("{family}: media request failed");
                        failures.push(family);
                    }
                }
            }
        }
        assert!(failures.is_empty(), "Failed live providers: {failures:?}");
    }

    #[tokio::test]
    async fn native_backend_needs_no_listener_and_rejects_unregistered_resources() {
        let backend = Backend::new().unwrap();
        assert!(backend.resolve(vec![]).await.is_err());
        assert!(backend
            .resolve(vec![candidate("https://127.0.0.1/private", "Studio")])
            .await
            .is_err());
        let request = Request::builder()
            .uri("yumiwatch-media://localhost/alloha/unknown/resource")
            .body(vec![])
            .unwrap();
        assert_eq!(backend.media(request).await.status(), StatusCode::NOT_FOUND);
        let request = Request::builder()
            .uri(format!(
                "yumiwatch-media://localhost/alloha/{}/{}",
                "a".repeat(32),
                "b".repeat(32)
            ))
            .body(vec![])
            .unwrap();
        assert_eq!(backend.media(request).await.status(), StatusCode::GONE);
        let request = Request::builder()
            .method(Method::OPTIONS)
            .uri("yumiwatch-media://localhost/")
            .header("Origin", "tauri://localhost")
            .body(vec![])
            .unwrap();
        let response = backend.media(request).await;
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            response.headers()["access-control-allow-origin"],
            "tauri://localhost"
        );
        let request = Request::builder()
            .uri("yumiwatch-media://localhost/")
            .header("Origin", "https://evil.example")
            .body(vec![])
            .unwrap();
        assert_eq!(backend.media(request).await.status(), StatusCode::FORBIDDEN);
    }
}
