use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use directories::ProjectDirs;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::EnvFilter;

const QUALIFIER: &str = "dev";
const ORGANIZATION: &str = "rusbview";
const APPLICATION: &str = "rusbview";
const LOG_DIR: &str = "logs";
const LOG_FILE_PREFIX: &str = "rusbview";

#[derive(Debug)]
pub struct LoggingGuard {
    _guard: WorkerGuard,
    log_dir: PathBuf,
}

impl LoggingGuard {
    pub fn log_dir(&self) -> &PathBuf {
        &self.log_dir
    }
}

pub fn init_logging() -> Result<LoggingGuard> {
    let log_dir = default_log_dir()?;
    std::fs::create_dir_all(&log_dir)
        .with_context(|| format!("failed to create log directory {}", log_dir.display()))?;

    let file_appender = tracing_appender::rolling::daily(&log_dir, LOG_FILE_PREFIX);
    let (writer, guard) = tracing_appender::non_blocking(file_appender);
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_ansi(false)
        .with_writer(writer)
        .try_init()
        .map_err(|error| anyhow!("failed to initialize logging subscriber: {error}"))?;

    Ok(LoggingGuard {
        _guard: guard,
        log_dir,
    })
}

pub fn default_log_dir() -> Result<PathBuf> {
    let project_dirs = ProjectDirs::from(QUALIFIER, ORGANIZATION, APPLICATION)
        .context("failed to resolve application cache directory")?;
    Ok(project_dirs.cache_dir().join(LOG_DIR))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_log_dir_ends_with_logs() {
        let path = default_log_dir().unwrap();
        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some(LOG_DIR)
        );
    }
}
