use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use russh::client::{self, Handler};
use russh::keys::{HashAlg, PublicKey};
use russh::{ChannelMsg, Disconnect};
use serde::{Deserialize, Serialize};
use tokio::time::timeout;

use crate::sshpolicy::{self, Clearance};

/*
 * SSH transport.
 *
 * The same posture as tls.rs, for the same reason: a homelab's host keys are
 * self-generated and no authority will ever vouch for them, so the control is
 * pinning. The key is fingerprinted on first contact, shown to the user, and
 * from then on every connection must present that exact key. A changed key
 * fails the connection rather than prompting.
 *
 * Two invariants hold here regardless of what the caller asks for:
 *
 *   1. A probe never authenticates. `check_server_key` returns false on a
 *      probe, which aborts the handshake before the auth stage — so there is
 *      no code path where a credential reaches an unverified host.
 *   2. Every command passes sshpolicy::authorise before a channel is opened.
 */

/// Cap on captured output. A `journalctl` with no `-n` should not be able to
/// pull the process into swap; the caller is told when it truncated.
const MAX_OUTPUT: usize = 256 * 1024;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const COMMAND_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyProbe {
    pub reachable: bool,
    pub fingerprint: String,
    pub fingerprint_display: String,
    /// The host presented a different key than the pinned one.
    pub changed: bool,
    pub key_type: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutput {
    pub command: String,
    pub clearance: Clearance,
    pub stdout: String,
    pub stderr: String,
    pub exit_status: Option<u32>,
    pub truncated: bool,
    pub duration_ms: u64,
    pub ran_at: String,
}

/// How to prove who we are. The value comes from the Credential Manager and is
/// never logged, echoed back, or written to the database.
pub enum SshAuth {
    Password(String),
    /// OpenSSH private key in PEM form, with an optional passphrase.
    Key {
        pem: String,
        passphrase: Option<String>,
    },
}

/// Records the key the host presented, and decides whether to continue.
struct Pinned {
    expected: Option<String>,
    /// Set to false by a probe so the handshake stops before authentication.
    accept: bool,
    seen: Arc<Mutex<Option<(String, String)>>>,
}

impl Handler for Pinned {
    type Error = russh::Error;

    async fn check_server_key(&mut self, key: &PublicKey) -> Result<bool, Self::Error> {
        let fp = key.fingerprint(HashAlg::Sha256).to_string();
        if let Ok(mut seen) = self.seen.lock() {
            *seen = Some((fp.clone(), key.algorithm().to_string()));
        }
        if !self.accept {
            return Ok(false);
        }
        Ok(match &self.expected {
            None => true,
            Some(expected) => normalise(expected) == normalise(&fp),
        })
    }
}

/// SSH fingerprints travel as `SHA256:base64`; compare on the payload only so a
/// stored value with or without the prefix still matches.
fn normalise(fp: &str) -> String {
    fp.trim()
        .trim_start_matches("SHA256:")
        .trim_end_matches('=')
        .to_string()
}

fn config() -> Arc<client::Config> {
    Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(180)),
        ..Default::default()
    })
}

/// Fetches the host key so the user can compare it against the server.
///
/// Nothing is trusted as a result of this call. The handshake is deliberately
/// aborted once the key is captured, so a probe can never turn into a session.
pub async fn probe_host_key(
    host: &str,
    port: u16,
    pinned: Option<String>,
) -> Result<HostKeyProbe, String> {
    let seen = Arc::new(Mutex::new(None));
    let handler = Pinned {
        expected: pinned.clone(),
        accept: false,
        seen: seen.clone(),
    };

    let attempt = timeout(
        CONNECT_TIMEOUT,
        client::connect(config(), (host, port), handler),
    )
    .await;

    let captured = seen.lock().ok().and_then(|g| g.clone());

    match captured {
        Some((fp, key_type)) => {
            let changed = pinned
                .as_deref()
                .is_some_and(|p| normalise(p) != normalise(&fp));
            Ok(HostKeyProbe {
                reachable: true,
                fingerprint_display: fp.clone(),
                fingerprint: fp,
                changed,
                key_type,
                message: if changed {
                    "A gazdagép kulcsa megváltozott. Amíg nem tisztázod, miért, ne fogadd el."
                        .to_string()
                } else if pinned.is_some() {
                    "A gazdagép kulcsa változatlan.".to_string()
                } else {
                    "Első kapcsolat: vesd össze az ujjlenyomatot a kiszolgálón (ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub)."
                        .to_string()
                },
            })
        }
        None => Ok(HostKeyProbe {
            reachable: false,
            fingerprint: String::new(),
            fingerprint_display: String::new(),
            changed: false,
            key_type: String::new(),
            message: match attempt {
                Err(_) => format!("Nem sikerült kapcsolódni {host}:{port} címre: időtúllépés."),
                Ok(Err(e)) => format!("Nem sikerült kapcsolódni: {e}"),
                Ok(Ok(_)) => "A kapcsolat létrejött, de a gazdagép nem mutatott kulcsot.".to_string(),
            },
        }),
    }
}

fn take(buffer: &mut Vec<u8>, chunk: &[u8], truncated: &mut bool) {
    let room = MAX_OUTPUT.saturating_sub(buffer.len());
    if room == 0 {
        *truncated = true;
        return;
    }
    if chunk.len() > room {
        buffer.extend_from_slice(&chunk[..room]);
        *truncated = true;
    } else {
        buffer.extend_from_slice(chunk);
    }
}

/// Runs one command and returns what it printed.
///
/// No pty is requested and no shell is spawned: the command string is handed
/// to the server's exec channel exactly as given. It is authorised first —
/// there is no path from here to a destructive command.
pub async fn run_command(
    host: &str,
    port: u16,
    username: &str,
    pinned: &str,
    auth: SshAuth,
    command: &str,
    confirmed: bool,
) -> Result<CommandOutput, String> {
    let clearance = sshpolicy::authorise(command, confirmed)?;
    if pinned.trim().is_empty() {
        return Err("a gazdagép kulcsa nincs elfogadva, a parancs nem indul".to_string());
    }

    let started = Instant::now();
    let seen = Arc::new(Mutex::new(None));
    let handler = Pinned {
        expected: Some(pinned.to_string()),
        accept: true,
        seen: seen.clone(),
    };

    let mut handle = timeout(
        CONNECT_TIMEOUT,
        client::connect(config(), (host, port), handler),
    )
    .await
    .map_err(|_| format!("időtúllépés {host}:{port} kapcsolódásakor"))?
    .map_err(|e| {
        let presented = seen.lock().ok().and_then(|g| g.clone());
        match presented {
            Some((fp, _)) if normalise(&fp) != normalise(pinned) => format!(
                "a gazdagép kulcsa megváltozott — várt: {pinned}, kapott: {fp}"
            ),
            _ => format!("kapcsolódás sikertelen: {e}"),
        }
    })?;

    let authenticated = match auth {
        SshAuth::Password(password) => handle
            .authenticate_password(username, password)
            .await
            .map_err(|e| format!("hitelesítés sikertelen: {e}"))?,
        SshAuth::Key { pem, passphrase } => {
            let key = russh::keys::decode_secret_key(&pem, passphrase.as_deref())
                .map_err(|e| format!("a privát kulcs nem olvasható: {e}"))?;
            let hash = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|e| format!("hitelesítés sikertelen: {e}"))?
                .flatten();
            handle
                .authenticate_publickey(
                    username,
                    russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key), hash),
                )
                .await
                .map_err(|e| format!("hitelesítés sikertelen: {e}"))?
        }
    };

    if !authenticated.success() {
        return Err(format!(
            "a(z) {username} felhasználót a kiszolgáló nem fogadta el"
        ));
    }

    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("csatorna nem nyitható: {e}"))?;
    channel
        .exec(true, command)
        .await
        .map_err(|e| format!("a parancs nem indult: {e}"))?;

    let mut stdout: Vec<u8> = Vec::new();
    let mut stderr: Vec<u8> = Vec::new();
    let mut exit_status = None;
    let mut truncated = false;

    let pump = async {
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { ref data } => take(&mut stdout, data, &mut truncated),
                ChannelMsg::ExtendedData { ref data, ext } if ext == 1 => {
                    take(&mut stderr, data, &mut truncated)
                }
                ChannelMsg::ExitStatus { exit_status: code } => exit_status = Some(code),
                ChannelMsg::Close | ChannelMsg::Eof => break,
                _ => {}
            }
        }
    };

    let outcome = timeout(COMMAND_TIMEOUT, pump).await;
    handle
        .disconnect(Disconnect::ByApplication, "", "en")
        .await
        .ok();

    if outcome.is_err() {
        truncated = true;
    }

    Ok(CommandOutput {
        command: command.to_string(),
        clearance,
        stdout: String::from_utf8_lossy(&stdout).to_string(),
        stderr: String::from_utf8_lossy(&stderr).to_string(),
        exit_status,
        truncated,
        duration_ms: started.elapsed().as_millis() as u64,
        ran_at: crate::collect::now_iso(),
    })
}
