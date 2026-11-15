use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::time::Duration;

#[derive(Serialize)]
pub struct ImageResponse {
    pub data: String,
    pub mime: String,
}
fn image_url(raw: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(raw).map_err(|_| "Некорректный адрес изображения.")?;
    let allowed = url.host_str().is_some_and(|host| {
        host == "static.yani.tv"
            || host == "i.kodikres.com"
            || host.ends_with(".kodikres.com")
            || host.ends_with(".solodcdn.com")
    });
    if raw.len() > 8192
        || url.scheme() != "https"
        || !allowed
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("Изображение должно находиться на CDN Yani или Kodik.".into());
    }
    Ok(url)
}
pub async fn fetch(client: &reqwest::Client, raw: &str) -> Result<ImageResponse, String> {
    let mut url = image_url(raw)?;
    for _ in 0..5 {
        let response = client
            .get(url.clone())
            .header("Accept", "image/avif,image/webp,image/*")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|_| "Не удалось загрузить изображение.")?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|value| value.to_str().ok())
                .ok_or("CDN не указал адрес изображения.")?;
            let next = url
                .join(location)
                .map_err(|_| "Некорректный адрес изображения.")?;
            url = image_url(next.as_str())?;
            continue;
        }
        if !response.status().is_success() {
            return Err("CDN не предоставил изображение.".into());
        }
        let mime = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .to_owned();
        if !mime.starts_with("image/") {
            return Err("CDN вернул не изображение.".into());
        }
        let bytes = crate::providers::limited_body(response, 8 * 1024 * 1024).await?;
        return Ok(ImageResponse {
            data: STANDARD.encode(bytes),
            mime,
        });
    }
    Err("Слишком много перенаправлений изображения.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_public_image_cdns() {
        for url in [
            "https://static.yani.tv/poster.jpg",
            "https://i.kodikres.com/shot.jpg",
        ] {
            assert!(image_url(url).is_ok());
        }
        for url in [
            "https://127.0.0.1/a",
            "http://static.yani.tv/a",
            "https://static.yani.tv.evil.example/a",
            "https://user:pass@static.yani.tv/a",
            "https://static.yani.tv:444/a",
        ] {
            assert!(image_url(url).is_err());
        }
    }
}
