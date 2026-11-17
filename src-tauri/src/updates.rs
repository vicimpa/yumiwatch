use crate::backend::Backend;
use reqwest::{header, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

#[derive(Clone, Deserialize, Serialize)]
pub struct Release {
    tag_name: String,
    html_url: String,
    name: Option<String>,
    draft: bool,
    prerelease: bool,
}

#[derive(Default)]
struct CachedRelease {
    etag: Option<header::HeaderValue>,
    release: Option<Release>,
    retry_at: Option<Instant>,
}

#[derive(Default)]
pub struct ReleaseCache(Mutex<CachedRelease>);

fn retry_delay(status: StatusCode, headers: &header::HeaderMap, now: u64) -> Duration {
    let seconds = |name: &str| {
        headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0)
    };
    let reset = if headers
        .get("x-ratelimit-remaining")
        .is_some_and(|value| value == "0")
    {
        seconds("x-ratelimit-reset").saturating_sub(now)
    } else {
        0
    };
    Duration::from_secs(
        seconds("retry-after")
            .max(seconds("x-poll-interval"))
            .max(reset)
            .max(
                if matches!(
                    status,
                    StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS
                ) {
                    60
                } else {
                    0
                },
            ),
    )
}

#[tauri::command]
pub async fn latest_app_release(
    state: tauri::State<'_, Backend>,
    cache: tauri::State<'_, ReleaseCache>,
) -> Result<Option<Release>, String> {
    // Serialize checks from multiple windows and preserve the last release on 304.
    let mut cached = cache.0.lock().await;
    if cached.retry_at.is_some_and(|until| until > Instant::now()) {
        return Ok(cached.release.clone());
    }
    let mut request = state
        .client
        .get("https://api.github.com/repos/vicimpa/yummywatch/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .header(
            "User-Agent",
            concat!("YummyWatch/", env!("CARGO_PKG_VERSION")),
        )
        .timeout(Duration::from_secs(15));
    if let Some(etag) = &cached.etag {
        request = request.header(header::IF_NONE_MATCH, etag);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Не удалось проверить обновления.")?;
    let status = response.status();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    cached.retry_at = Instant::now().checked_add(retry_delay(status, response.headers(), now));
    if status == StatusCode::NOT_MODIFIED {
        return Ok(cached.release.clone());
    }
    if status == StatusCode::NOT_FOUND {
        cached.etag = None;
        cached.release = None;
        cached.retry_at = Some(Instant::now() + Duration::from_secs(3600));
        return Ok(None);
    }
    let response = response
        .error_for_status()
        .map_err(|_| "Сервис обновлений недоступен.")?;
    let etag = response.headers().get(header::ETAG).cloned();
    let release = response
        .json::<Release>()
        .await
        .map_err(|_| "Не удалось прочитать информацию об обновлении.")?;
    cached.etag = etag;
    cached.release = Some(release.clone());
    Ok(Some(release))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn respects_github_retry_and_poll_intervals() {
        let mut headers = header::HeaderMap::new();
        headers.insert("retry-after", "120".parse().unwrap());
        headers.insert("x-poll-interval", "300".parse().unwrap());
        assert_eq!(
            retry_delay(StatusCode::TOO_MANY_REQUESTS, &headers, 1000),
            Duration::from_secs(300)
        );
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        headers.insert("x-ratelimit-reset", "4600".parse().unwrap());
        assert_eq!(
            retry_delay(StatusCode::FORBIDDEN, &headers, 1000),
            Duration::from_secs(3600)
        );
    }

    #[test]
    fn handles_invalid_headers_and_expired_reset_without_retry_storms() {
        let mut headers = header::HeaderMap::new();
        headers.insert("retry-after", "invalid".parse().unwrap());
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        headers.insert("x-ratelimit-reset", "999".parse().unwrap());
        assert_eq!(
            retry_delay(StatusCode::TOO_MANY_REQUESTS, &headers, 1000),
            Duration::from_secs(60)
        );
        assert_eq!(retry_delay(StatusCode::OK, &headers, 1000), Duration::ZERO);
    }
}
