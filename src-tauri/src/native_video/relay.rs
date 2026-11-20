// FFmpeg's HLS demuxer needs HTTP for nested requests. The bridge exposes only
// opaque resources already registered by the provider resolver.
use crate::{
    alloha,
    backend::{self, Backend},
};
use http_body_util::Full;
use hyper::{
    body::{Bytes, Incoming},
    server::conn::http1,
    service::service_fn,
};
use hyper_util::rt::TokioIo;
use std::{convert::Infallible, ffi::CString, time::Duration};
use tauri::http::{header, Request, Response, StatusCode};
use tokio::{
    net::TcpListener,
    sync::{OnceCell, Semaphore},
};
use url::Url;

pub struct Relay {
    root: String,
}

impl Relay {
    async fn start(backend: Backend) -> Result<Self, String> {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|error| error.to_string())?;
        let address = listener.local_addr().map_err(|error| error.to_string())?;
        let token = alloha::token();
        let root = format!("http://{address}/{token}");
        tokio::spawn(async move {
            let permits = std::sync::Arc::new(Semaphore::new(16));
            while let Ok((stream, _)) = listener.accept().await {
                let Ok(permit) = permits.clone().try_acquire_owned() else {
                    continue;
                };
                let backend = backend.clone();
                let token = token.clone();
                tokio::spawn(async move {
                    let _permit = permit;
                    let connection = http1::Builder::new().keep_alive(false).serve_connection(
                        TokioIo::new(stream),
                        service_fn(|request| serve(request, &backend, &token)),
                    );
                    let _ = tokio::time::timeout(Duration::from_secs(35), connection).await;
                });
            }
        });
        Ok(Self { root })
    }

    pub async fn url(
        state: &OnceCell<Self>,
        backend: &Backend,
        raw: &str,
        extension: &str,
    ) -> Result<(CString, bool), String> {
        let url = Url::parse(raw).map_err(|_| "Некорректный адрес видео.")?;
        let host = url.host_str().unwrap_or_default();
        if !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
            return Err("Некорректный адрес видео.".into());
        }
        let relayed = matches!(
            (url.scheme(), host),
            ("yumiwatch-media", "localhost") | ("http" | "https", "yumiwatch-media.localhost")
        );
        let value = if relayed {
            if !resource_path(url.path()) || url.query().is_some() || url.fragment().is_some() {
                return Err("Некорректный ресурс видеопотока.".into());
            }
            let relay = state
                .get_or_try_init(|| Self::start(backend.clone()))
                .await?;
            format!("{}{}.{extension}", relay.root, url.path())
        } else if url.scheme() == "https" && !host.is_empty() {
            url.into()
        } else {
            return Err("Некорректный адрес видео.".into());
        };
        CString::new(value)
            .map(|url| (url, relayed))
            .map_err(|_| "Некорректный адрес видео.".into())
    }
}

fn resource_path(path: &str) -> bool {
    let mut parts = path.strip_prefix('/').unwrap_or("").split('/');
    matches!(parts.next(), Some("media" | "alloha"))
        && (0..2).all(|_| {
            parts.next().is_some_and(|part| {
                part.len() == 32
                    && part
                        .bytes()
                        .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            })
        })
        && parts.next().is_none()
}

async fn serve(
    request: Request<Incoming>,
    backend: &Backend,
    token: &str,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let head = request.method() == tauri::http::Method::HEAD;
    let mut response = if let Some(path) = request
        .uri()
        .path()
        .strip_prefix('/')
        .and_then(|route| {
            let (key, path) = route.split_once('/')?;
            (key == token && request.headers().get(header::ORIGIN).is_none())
                .then(|| format!("/{}", path.split_once('.').map_or(path, |(path, _)| path)))
        })
        .filter(|path| resource_path(path))
    {
        let (mut parts, _) = request.into_parts();
        parts.uri = path.parse().unwrap();
        backend.media(Request::from_parts(parts, Vec::new())).await
    } else {
        backend::error(StatusCode::NOT_FOUND, "Unknown resource")
    };
    if !head {
        response.headers_mut().remove(header::CONTENT_LENGTH);
    }
    Ok(response.map(|body| Full::new(Bytes::from(body))))
}
