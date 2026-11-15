use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex},
};

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedSession {
    token: String,
    user: SavedUser,
    remember: bool,
    refreshed_at: u64,
}

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct SavedUser {
    id: u64,
    nickname: String,
    avatar: Option<String>,
}

impl SavedSession {
    fn validate(&self) -> Result<(), String> {
        if !self.remember
            || self.token.trim().is_empty()
            || self.token.len() > 8192
            || self.user.id == 0
            || self.user.nickname.is_empty()
            || self.user.nickname.len() > 512
            || self
                .user
                .avatar
                .as_ref()
                .is_some_and(|value| value.len() > 4096)
        {
            return Err("Некорректная сохранённая сессия.".into());
        }
        Ok(())
    }
}

#[derive(Clone)]
pub struct SessionVault {
    file: PathBuf,
    lock: Arc<Mutex<()>>,
}

const STORAGE_ERROR: &str = "Не удалось сохранить вход в данных приложения. Проверь доступ к папке данных и свободное место.";
const MAX_SESSION_SIZE: u64 = 32 * 1024;

impl SessionVault {
    pub fn new(file: PathBuf) -> Self {
        Self {
            file,
            lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn load(&self) -> Result<Option<SavedSession>, String> {
        let _guard = self.lock.lock().map_err(|_| STORAGE_ERROR)?;
        let metadata = match fs::symlink_metadata(&self.file) {
            Ok(value) => value,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => {
                return Err("Не удалось прочитать сохранённый вход из данных приложения.".into())
            }
        };
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > MAX_SESSION_SIZE
        {
            return Err("Некорректный файл сохранённого входа.".into());
        }
        let raw = fs::read(&self.file).map_err(|_| "Не удалось прочитать сохранённый вход.")?;
        let session: SavedSession =
            serde_json::from_slice(&raw).map_err(|_| "Не удалось прочитать сохранённый вход.")?;
        session.validate()?;
        Ok(Some(session))
    }

    pub fn save(&self, session: Option<SavedSession>) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|_| STORAGE_ERROR)?;
        let Some(session) = session else {
            return match fs::remove_file(&self.file) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(_) => Err(STORAGE_ERROR.into()),
            };
        };
        session.validate()?;
        let parent = self.file.parent().ok_or(STORAGE_ERROR)?;
        let mut directory = fs::DirBuilder::new();
        directory.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            directory.mode(0o700);
        }
        directory.create(parent).map_err(|_| STORAGE_ERROR)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
                .map_err(|_| STORAGE_ERROR)?;
        }
        let raw = serde_json::to_vec(&session).map_err(|_| STORAGE_ERROR)?;
        let temporary = parent.join(format!("session-{:016x}.tmp", rand::random::<u64>()));
        let result = (|| -> std::io::Result<()> {
            let mut options = fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut output = options.open(&temporary)?;
            output.write_all(&raw)?;
            output.sync_all()?;
            drop(output);
            fs::rename(&temporary, &self.file)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
            return Err(STORAGE_ERROR.into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture {
        directory: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            Self {
                directory: std::env::temp_dir().join(format!(
                    "yummywatch-session-test-{:016x}",
                    rand::random::<u64>()
                )),
            }
        }
        fn vault(&self) -> SessionVault {
            SessionVault::new(self.directory.join("account/session-v1.json"))
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.directory);
        }
    }
    fn session(token: &str) -> SavedSession {
        SavedSession {
            token: token.into(),
            user: SavedUser {
                id: 42,
                nickname: "Test".into(),
                avatar: None,
            },
            remember: true,
            refreshed_at: 1,
        }
    }
    #[test]
    fn restores_from_disk_after_reopening_and_deletes_on_logout() {
        let fixture = Fixture::new();
        assert!(fixture.vault().load().unwrap().is_none());
        fixture.vault().save(Some(session("first"))).unwrap();
        assert!(fixture.vault().load().unwrap() == Some(session("first")));
        fixture.vault().save(Some(session("refreshed"))).unwrap();
        assert!(fixture.vault().load().unwrap() == Some(session("refreshed")));
        fixture.vault().save(None).unwrap();
        fixture.vault().save(None).unwrap();
        assert!(fixture.vault().load().unwrap().is_none());
        assert!(fs::read_dir(fixture.directory.join("account"))
            .unwrap()
            .next()
            .is_none());
    }
    #[test]
    fn rejects_unremembered_or_invalid_sessions_without_overwriting_the_saved_one() {
        let fixture = Fixture::new();
        fixture.vault().save(Some(session("valid"))).unwrap();
        let mut invalid = session("other");
        invalid.remember = false;
        assert!(fixture.vault().save(Some(invalid)).is_err());
        assert!(fixture.vault().save(Some(session(""))).is_err());
        assert!(fixture.vault().load().unwrap() == Some(session("valid")));
        let raw = serde_json::to_value(session("valid")).unwrap();
        assert!(raw.get("password").is_none());
        assert!(raw.get("verified").is_none());
    }
    #[cfg(unix)]
    #[test]
    fn creates_owner_only_file_and_directory() {
        use std::os::unix::fs::PermissionsExt;
        let fixture = Fixture::new();
        let vault = fixture.vault();
        vault.save(Some(session("private"))).unwrap();
        assert_eq!(
            fs::metadata(&vault.file).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(vault.file.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
    }
    #[test]
    fn reports_corrupt_files_without_removing_or_printing_them() {
        let fixture = Fixture::new();
        let vault = fixture.vault();
        vault.save(Some(session("test"))).unwrap();
        fs::write(&vault.file, b"invalid").unwrap();
        assert!(vault.load().is_err());
        assert!(vault.file.exists());
    }
    #[test]
    fn subprocess_storage_probe() {
        let Some(file) = std::env::var_os("YUMMYWATCH_SESSION_TEST_FILE") else {
            return;
        };
        let vault = SessionVault::new(file.into());
        match std::env::var("YUMMYWATCH_SESSION_TEST_ACTION")
            .unwrap()
            .as_str()
        {
            "write" => vault
                .save(Some(session("synthetic-process-token")))
                .unwrap(),
            "read" => assert!(vault.load().unwrap() == Some(session("synthetic-process-token"))),
            "clear" => vault.save(None).unwrap(),
            "empty" => assert!(vault.load().unwrap().is_none()),
            _ => panic!("Unknown storage probe action"),
        }
    }
    #[test]
    fn survives_real_process_restarts_without_a_system_credential_store() {
        let fixture = Fixture::new();
        for action in ["write", "read", "clear", "empty"] {
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["session::tests::subprocess_storage_probe", "--exact"])
                .env("YUMMYWATCH_SESSION_TEST_FILE", &fixture.vault().file)
                .env("YUMMYWATCH_SESSION_TEST_ACTION", action)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "Separate storage process failed: {action}"
            );
        }
    }
}
