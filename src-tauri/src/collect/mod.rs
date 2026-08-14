pub mod proxmox;
pub mod unifi;

use serde::{Deserialize, Serialize};

/// A saved way to reach one system.
///
/// One profile is one machine, not one protocol. A Proxmox host reached over
/// both the API and SSH is a single entry carrying both, because that is what
/// it is — keeping them apart meant typing the same address twice and getting
/// two rows in every list that could disagree with each other.
///
/// Secrets are deliberately absent: they live in the Windows Credential
/// Manager and are fetched only at request time.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    /// "proxmox", "unifi" or "ssh".
    pub kind: String,
    pub label: String,
    /// Origin only, e.g. https://10.0.1.10:8006. Empty for ssh profiles.
    #[serde(default)]
    pub base_url: String,
    /// Proxmox: the API token id (`user@realm!tokenname`). UniFi and ssh: the username.
    pub username: String,
    /// UniFi site name; ignored for the other kinds.
    #[serde(default)]
    pub site: String,
    /// Pinned leaf certificate for the https endpoint. None until accepted.
    #[serde(default)]
    pub fingerprint: Option<String>,

    /* ------------------------------------------------- optional ssh access */
    /// True when this system is also reachable over ssh.
    #[serde(default)]
    pub ssh_enabled: bool,
    /// Host name or address, without a scheme.
    #[serde(default)]
    pub ssh_host: String,
    /// 0 is read as the default 22.
    #[serde(default)]
    pub ssh_port: u16,
    #[serde(default)]
    pub ssh_username: String,
    /// "password" or "key".
    #[serde(default)]
    pub ssh_auth_method: String,
    /// Pinned host key. None until the user has compared it and accepted.
    #[serde(default)]
    pub ssh_fingerprint: Option<String>,
    /// Only for `kind == "ssh"`: which command catalogue to offer. For the
    /// other kinds the answer is the kind itself.
    #[serde(default)]
    pub flavour: String,

    /* ------------------------------------------------------------- legacy */
    // Written by the build where ssh was its own profile kind. Read so those
    // profiles survive the upgrade, never written back — the first save moves
    // them into the fields above and they disappear.
    #[serde(default, skip_serializing)]
    pub host: String,
    #[serde(default, skip_serializing)]
    pub port: u16,
    #[serde(default, skip_serializing)]
    pub auth_method: String,

    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub last_run: Option<String>,
}

impl Profile {
    pub fn ssh_port_or_default(&self) -> u16 {
        if self.ssh_port == 0 {
            22
        } else {
            self.ssh_port
        }
    }

    /// Moves a profile written by the older build into the current shape.
    ///
    /// Idempotent: once the ssh fields carry the address, the legacy ones are
    /// ignored, and the next save drops them for good.
    pub fn migrate(&mut self) {
        if self.ssh_host.is_empty() && !self.host.is_empty() {
            self.ssh_host = std::mem::take(&mut self.host);
            self.ssh_port = self.port;
            self.ssh_username = self.username.clone();
            self.ssh_auth_method = std::mem::take(&mut self.auth_method);
            self.ssh_enabled = true;
            // The old build stored the host key in the shared field.
            self.ssh_fingerprint = self.fingerprint.take();
        }
        if self.kind == "ssh" {
            self.ssh_enabled = true;
        }
    }

    /// Where this profile's ssh secret lives.
    ///
    /// An ssh-only profile keeps it under the bare id, which is where the
    /// older build put it — moving a credential to tidy a key name is not
    /// worth the chance of losing it. Everything else gets its own slot so the
    /// API secret and the ssh secret can coexist.
    pub fn ssh_secret_key(&self) -> String {
        if self.kind == "ssh" {
            self.id.clone()
        } else {
            format!("{}:ssh", self.id)
        }
    }
}

/// Rejects anything that is not a bare host name or IP address.
///
/// The value is handed to the TCP connector, so a stray scheme, port or path
/// here would silently change which machine gets the credential.
#[cfg(test)]
mod tests {
    use super::*;

    /// Exactly what the previous build wrote for a standalone ssh profile.
    const LEGACY_SSH: &str = r#"{
        "id": "ssh-abc", "kind": "ssh", "label": "pve01 konzol", "baseUrl": "",
        "username": "root", "site": "", "fingerprint": "SHA256:AAAA",
        "host": "10.0.1.10", "port": 2222, "authMethod": "key", "flavour": "proxmox",
        "createdAt": "2026-08-12T10:00:00Z", "lastRun": null
    }"#;

    /// A profile written before ssh existed at all.
    const LEGACY_API: &str = r#"{
        "id": "proxmox-1", "kind": "proxmox", "label": "pve01",
        "baseUrl": "https://10.0.1.10:8006", "username": "svc@pve!ro", "site": "",
        "fingerprint": "abcd", "createdAt": "2026-08-01T10:00:00Z", "lastRun": null
    }"#;

    #[test]
    fn a_legacy_ssh_profile_keeps_its_address_and_host_key() {
        let mut p: Profile = serde_json::from_str(LEGACY_SSH).unwrap();
        p.migrate();
        assert!(p.ssh_enabled);
        assert_eq!(p.ssh_host, "10.0.1.10");
        assert_eq!(p.ssh_port, 2222);
        assert_eq!(p.ssh_username, "root");
        assert_eq!(p.ssh_auth_method, "key");
        assert_eq!(p.ssh_fingerprint.as_deref(), Some("SHA256:AAAA"));
        // Its secret must stay where the old build put it.
        assert_eq!(p.ssh_secret_key(), "ssh-abc");
    }

    #[test]
    fn migrating_twice_changes_nothing() {
        let mut p: Profile = serde_json::from_str(LEGACY_SSH).unwrap();
        p.migrate();
        let once = serde_json::to_string(&p).unwrap();
        p.migrate();
        assert_eq!(once, serde_json::to_string(&p).unwrap());
    }

    #[test]
    fn the_legacy_fields_are_dropped_on_save() {
        let mut p: Profile = serde_json::from_str(LEGACY_SSH).unwrap();
        p.migrate();
        let saved = serde_json::to_string(&p).unwrap();
        assert!(!saved.contains("\"host\""), "{saved}");
        assert!(!saved.contains("\"authMethod\""), "{saved}");
        // And it still reads back as itself.
        let again: Profile = serde_json::from_str(&saved).unwrap();
        assert_eq!(again.ssh_host, "10.0.1.10");
    }

    #[test]
    fn a_profile_from_before_ssh_existed_still_loads() {
        let mut p: Profile = serde_json::from_str(LEGACY_API).unwrap();
        p.migrate();
        assert!(!p.ssh_enabled);
        assert_eq!(p.base_url, "https://10.0.1.10:8006");
        assert_eq!(p.fingerprint.as_deref(), Some("abcd"));
        // An API profile's ssh secret gets its own slot so the two can coexist.
        assert_eq!(p.ssh_secret_key(), "proxmox-1:ssh");
    }

    #[test]
    fn a_snapshot_written_before_the_backup_fields_existed_still_parses() {
        // The regression that broke profile loading: a stored snapshot from an
        // older build must never fail to deserialize.
        let old = r#"{
            "id": "survey-1", "startedAt": "", "finishedAt": "", "log": [], "errors": [],
            "proxmox": { "version": "8.2", "nodes": [], "storages": [], "guests": [],
                         "interfaces": [], "disks": [] },
            "unifi": { "site": "default", "devices": [], "networks": [], "wlans": [],
                       "firewallRules": [], "clients": [] }
        }"#;
        let snap: SurveySnapshot = serde_json::from_str(old).expect("old snapshot must still parse");
        assert!(snap.proxmox.unwrap().backup_jobs.is_empty());
        assert!(snap.unifi.unwrap().port_profiles.is_empty());
    }

    #[test]
    fn a_host_must_be_a_bare_address() {
        assert!(validate_host("10.0.1.10").is_ok());
        assert!(validate_host("pve01.local").is_ok());
        assert!(validate_host("https://10.0.1.10").is_err());
        assert!(validate_host("10.0.1.10:22").is_err());
        assert!(validate_host("root@10.0.1.10").is_err());
        assert!(validate_host("  ").is_err());
    }
}

pub fn validate_host(raw: &str) -> Result<String, String> {
    let host = raw.trim();
    if host.is_empty() {
        return Err("a gazdanév nem lehet üres".to_string());
    }
    if host.contains("://") || host.contains('/') {
        return Err("csak gazdanevet vagy IP-címet adj meg, séma és útvonal nélkül".to_string());
    }
    if host.contains(':') && !host.starts_with('[') {
        return Err("a portot külön mezőben add meg".to_string());
    }
    if host
        .chars()
        .any(|c| c.is_whitespace() || c == '@' || c == '\\')
    {
        return Err("a gazdanév nem tartalmazhat szóközt, @ vagy \\ karaktert".to_string());
    }
    Ok(host.to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub time: String,
    pub source: String,
    pub message: String,
    /// false marks a call that failed; the survey continues regardless.
    pub ok: bool,
}

impl LogEntry {
    pub fn ok(source: &str, message: impl Into<String>) -> Self {
        Self {
            time: now_hms(),
            source: source.to_string(),
            message: message.into(),
            ok: true,
        }
    }

    pub fn fail(source: &str, message: impl Into<String>) -> Self {
        Self {
            time: now_hms(),
            source: source.to_string(),
            message: message.into(),
            ok: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SurveySnapshot {
    pub id: String,
    pub started_at: String,
    pub finished_at: String,
    pub log: Vec<LogEntry>,
    pub errors: Vec<String>,
    pub proxmox: Option<proxmox::ProxmoxSnapshot>,
    pub unifi: Option<unifi::UnifiSnapshot>,
}

/// Certificate details shown before a fingerprint is accepted.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EndpointProbe {
    pub reachable: bool,
    pub fingerprint: String,
    pub fingerprint_display: String,
    /// True when the presented certificate differs from the pinned one.
    pub changed: bool,
    pub message: String,
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn now_hms() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

/// Rejects anything that is not a plain https origin.
///
/// The URL is joined with fixed API paths, so a stray path or query on the
/// profile would silently change which endpoint gets called.
pub fn validate_base_url(raw: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(raw.trim()).map_err(|e| format!("érvénytelen cím: {e}"))?;

    if url.scheme() != "https" {
        return Err("csak https címet fogadunk el".to_string());
    }
    if url.host_str().is_none() {
        return Err("a cím nem tartalmaz gazdanevet".to_string());
    }
    if url.path() != "/" && !url.path().is_empty() {
        return Err("a cím csak a kiszolgáló gyökere lehet, útvonal nélkül".to_string());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("a cím nem tartalmazhat lekérdezést vagy horgonyt".to_string());
    }

    Ok(url.origin().ascii_serialization())
}
