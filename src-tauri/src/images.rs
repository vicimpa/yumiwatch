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
        return Err("Изображение должно находиться на CDN Yummy или Kodik.".into());
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

#[cfg(desktop)]
pub fn save_poster(
    directory: &std::path::Path,
    anime_id: u64,
    image: ImageResponse,
) -> Result<String, String> {
    use std::io::Write;
    let extension = match image.mime.as_str() {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/avif" => "avif",
        "image/gif" => "gif",
        _ => return Err("Неизвестный формат постера.".into()),
    };
    let bytes = STANDARD
        .decode(image.data)
        .map_err(|_| "Не удалось прочитать постер.".to_string())?;
    std::fs::create_dir_all(directory)
        .map_err(|_| "Не удалось открыть папку «Загрузки».".to_string())?;
    for index in 0..1000 {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!(" ({index})")
        };
        let path = directory.join(format!("yummy-{anime_id}-poster{suffix}.{extension}"));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut file) => {
                if file.write_all(&bytes).is_err() {
                    drop(file);
                    let _ = std::fs::remove_file(&path);
                    return Err("Не удалось записать постер.".into());
                }
                return Ok(path.to_string_lossy().into_owned());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Не удалось сохранить постер в «Загрузки».".into()),
        }
    }
    Err("Слишком много копий постера в «Загрузки».".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(desktop)]
    #[test]
    fn saves_poster_without_overwriting_an_existing_file() {
        let directory =
            std::env::temp_dir().join(format!("yummy-poster-test-{}", rand::random::<u64>()));
        let image = || ImageResponse {
            data: STANDARD.encode(b"poster"),
            mime: "image/webp".into(),
        };
        let first = save_poster(&directory, 42, image()).unwrap();
        let second = save_poster(&directory, 42, image()).unwrap();
        assert_ne!(first, second);
        assert_eq!(std::fs::read(&first).unwrap(), b"poster");
        assert_eq!(std::fs::read(&second).unwrap(), b"poster");
        assert!(save_poster(
            &directory,
            42,
            ImageResponse {
                data: STANDARD.encode(b"not an image"),
                mime: "text/html".into()
            }
        )
        .is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }
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
