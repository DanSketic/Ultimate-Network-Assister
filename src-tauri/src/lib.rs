mod apply;
mod collect;
mod secrets;
mod ssh;
mod sshpolicy;
mod tls;

use std::fs;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{Manager, State};

use collect::{
    now_iso, validate_base_url, validate_host, EndpointProbe, LogEntry, Profile, SurveySnapshot,
};

/// Application store.
///
/// Blueprints, connection profiles and survey snapshots are kept as JSON
/// payloads in one table each: the shapes are owned by the frontend and change
/// with it, and every read is "give me all of them". Secrets are deliberately
/// absent — those live in the Windows Credential Manager (see secrets.rs).
struct Db(Mutex<Connection>);

/// Where site backups are written. Kept next to the database so a restore and
/// the journal that references it stay together.
struct BackupDir(std::path::PathBuf);

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS blueprints (
    id         TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
    id         TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
    id         TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS apply_runs (
    id         TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
";

/// How many survey snapshots to keep. Older ones are pruned on each run.
const SNAPSHOT_HISTORY: usize = 20;

fn to_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn read_all(db: &Db, table: &str, order: &str) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(to_err)?;
    let mut stmt = conn
        .prepare(&format!("SELECT payload FROM {table} ORDER BY {order} DESC"))
        .map_err(to_err)?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(to_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(to_err)
}

fn upsert(db: &Db, table: &str, stamp_column: &str, id: &str, payload: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(to_err)?;
    conn.execute(
        &format!(
            "INSERT INTO {table} (id, payload, {stamp_column})
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, {stamp_column} = excluded.{stamp_column}"
        ),
        rusqlite::params![id, payload],
    )
    .map_err(to_err)?;
    Ok(())
}

fn delete_row(db: &Db, table: &str, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(to_err)?;
    conn.execute(
        &format!("DELETE FROM {table} WHERE id = ?1"),
        rusqlite::params![id],
    )
    .map_err(to_err)?;
    Ok(())
}

/* ------------------------------------------------------------- blueprints */

#[tauri::command]
fn list_blueprints(db: State<'_, Db>) -> Result<Vec<String>, String> {
    read_all(&db, "blueprints", "updated_at")
}

#[tauri::command]
fn save_blueprint(db: State<'_, Db>, id: String, payload: String) -> Result<(), String> {
    upsert(&db, "blueprints", "updated_at", &id, &payload)
}

#[tauri::command]
fn delete_blueprint(db: State<'_, Db>, id: String) -> Result<(), String> {
    delete_row(&db, "blueprints", &id)
}

/* ---------------------------------------------------------------- files */

/// Writes a file the user picked in a save dialog.
///
/// The path comes from the native dialog rather than from page content, which
/// is why this is a plain command instead of a broadly scoped filesystem
/// permission.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(to_err)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(to_err)
}

/* --------------------------------------------------------------- profiles */

fn load_profiles(db: &Db) -> Result<Vec<Profile>, String> {
    read_all(db, "profiles", "updated_at")?
        .into_iter()
        .map(|p| {
            serde_json::from_str::<Profile>(&p).map(|mut profile| {
                // Profiles written by an older build are brought forward on
                // read, so nothing downstream has to know two shapes.
                profile.migrate();
                profile
            })
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_err)
}

#[tauri::command]
fn list_profiles(db: State<'_, Db>) -> Result<Vec<Profile>, String> {
    let mut profiles = load_profiles(&db)?;
    // Sorted for a stable list; the UI groups by kind anyway.
    profiles.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(profiles)
}

/// Brings a profile into a saveable shape, or says why it is not one.
///
/// Pure, so the rules can be tested without a database: each half of a profile
/// is validated for its own shape, and whatever is switched off is cleared
/// rather than left half-filled.
fn normalise_profile(profile: Profile) -> Result<Profile, String> {
    let mut profile = profile;
    profile.migrate();

    match profile.kind.as_str() {
        // An API profile is addressed by origin. It may also carry ssh, but
        // the two are validated separately so a half-filled second address can
        // never ride along on a valid first one.
        "proxmox" | "unifi" => {
            profile.base_url = validate_base_url(&profile.base_url)?;
            profile.flavour = String::new();
        }
        // No API at all: ssh is the whole profile.
        "ssh" => {
            profile.base_url = String::new();
            profile.username = String::new();
            profile.fingerprint = None;
            profile.ssh_enabled = true;
            if !matches!(profile.flavour.as_str(), "proxmox" | "unifi" | "other") {
                profile.flavour = "other".to_string();
            }
        }
        other => return Err(format!("ismeretlen profiltípus: {other}")),
    }

    if profile.ssh_enabled {
        profile.ssh_host = validate_host(&profile.ssh_host)?;
        if profile.ssh_username.trim().is_empty() {
            return Err("az SSH eléréshez felhasználónév kell".to_string());
        }
        if profile.ssh_auth_method != "key" {
            profile.ssh_auth_method = "password".to_string();
        }
    } else {
        // Turning ssh off clears its address and drops the pinned host key, so
        // switching it back on starts from a fresh, deliberate acceptance.
        profile.ssh_host = String::new();
        profile.ssh_port = 0;
        profile.ssh_username = String::new();
        profile.ssh_auth_method = String::new();
        profile.ssh_fingerprint = None;
    }
    if profile.created_at.is_empty() {
        profile.created_at = now_iso();
    }
    Ok(profile)
}

#[tauri::command]
fn save_profile(db: State<'_, Db>, profile: Profile) -> Result<Profile, String> {
    let profile = normalise_profile(profile)?;
    let payload = serde_json::to_string(&profile).map_err(to_err)?;
    upsert(&db, "profiles", "updated_at", &profile.id, &payload)?;
    Ok(profile)
}

#[cfg(test)]
mod profile_tests {
    use super::*;

    fn api_profile() -> Profile {
        serde_json::from_str(
            r#"{ "id": "p1", "kind": "proxmox", "label": "pve01",
                 "baseUrl": "https://10.0.1.10:8006", "username": "svc@pve!ro",
                 "site": "", "fingerprint": "abcd" }"#,
        )
        .unwrap()
    }

    #[test]
    fn ssh_can_be_added_to_an_existing_api_profile() {
        let mut p = api_profile();
        p.ssh_enabled = true;
        p.ssh_host = "10.0.1.10".into();
        p.ssh_username = "root".into();
        let out = normalise_profile(p).unwrap();

        assert!(out.ssh_enabled);
        assert_eq!(out.ssh_host, "10.0.1.10");
        assert_eq!(out.ssh_auth_method, "password", "unset auth defaults to password");
        // The API half is untouched by adding the ssh half.
        assert_eq!(out.base_url, "https://10.0.1.10:8006");
        assert_eq!(out.fingerprint.as_deref(), Some("abcd"));
        assert_eq!(out.ssh_secret_key(), "p1:ssh");
    }

    #[test]
    fn ssh_needs_a_username_and_a_bare_host() {
        let mut p = api_profile();
        p.ssh_enabled = true;
        p.ssh_host = "10.0.1.10".into();
        assert!(normalise_profile(p.clone()).is_err(), "no username");

        p.ssh_username = "root".into();
        p.ssh_host = "ssh://10.0.1.10".into();
        assert!(normalise_profile(p).is_err(), "host with a scheme");
    }

    #[test]
    fn turning_ssh_off_clears_its_address_and_host_key() {
        let mut p = api_profile();
        p.ssh_enabled = true;
        p.ssh_host = "10.0.1.10".into();
        p.ssh_username = "root".into();
        p.ssh_fingerprint = Some("SHA256:AAAA".into());
        let mut off = normalise_profile(p).unwrap();

        off.ssh_enabled = false;
        let out = normalise_profile(off).unwrap();
        assert!(out.ssh_host.is_empty());
        assert!(out.ssh_username.is_empty());
        assert!(out.ssh_fingerprint.is_none(), "a dropped host key must not linger");
        // …and the API half still survives.
        assert_eq!(out.base_url, "https://10.0.1.10:8006");
    }

    #[test]
    fn an_ssh_only_profile_has_no_api_half() {
        let p: Profile = serde_json::from_str(
            r#"{ "id": "s1", "kind": "ssh", "label": "box", "baseUrl": "",
                 "username": "leftover", "site": "", "sshHost": "10.0.1.50",
                 "sshUsername": "root", "flavour": "nonsense" }"#,
        )
        .unwrap();
        let out = normalise_profile(p).unwrap();
        assert!(out.ssh_enabled, "an ssh profile is always ssh-enabled");
        assert!(out.base_url.is_empty());
        assert!(out.username.is_empty(), "the API username has no meaning here");
        assert_eq!(out.flavour, "other", "an unknown flavour falls back");
        assert_eq!(out.ssh_secret_key(), "s1", "kept where the older build put it");
    }

    #[test]
    fn an_unknown_kind_is_refused() {
        let mut p = api_profile();
        p.kind = "vmware".into();
        assert!(normalise_profile(p).is_err());
    }
}

#[tauri::command]
fn delete_profile(db: State<'_, Db>, id: String) -> Result<(), String> {
    // Remove the secrets first: a profile row without a credential is
    // harmless, an orphaned credential is not. Both slots and the key
    // passphrase go, and a missing one is not an error — most profiles never
    // had all three.
    secrets::delete(&id).ok();
    secrets::delete(&format!("{id}:ssh")).ok();
    secrets::delete(&format!("{id}:ssh:passphrase")).ok();
    secrets::delete(&format!("{id}:passphrase")).ok();
    delete_row(&db, "profiles", &id)
}

/* ---------------------------------------------------------------- secrets */

/// Stores one of a profile's two possible secrets.
///
/// `ssh` picks the slot: false is the API token or password, true is the ssh
/// credential. They are separate entries so a system reached both ways does
/// not have to share one.
#[tauri::command]
fn store_profile_secret(
    db: State<'_, Db>,
    id: String,
    secret: String,
    ssh: bool,
) -> Result<(), String> {
    if secret.trim().is_empty() {
        return Err("üres titkot nem tárolunk".to_string());
    }
    if !ssh {
        return secrets::store(&id, &secret);
    }
    let profile = load_profiles(&db)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or("nincs ilyen profil")?;
    secrets::store(&profile.ssh_secret_key(), &secret)
}

#[tauri::command]
fn profile_has_secret(id: String) -> bool {
    secrets::exists(&id)
}

/// Removes one of a profile's two secrets. `ssh` picks the slot.
///
/// Used when ssh access is switched off: the profile keeps existing, so the
/// credential has to go on its own or it outlives the thing that referenced it.
#[tauri::command]
fn delete_profile_secret(db: State<'_, Db>, id: String, ssh: bool) -> Result<(), String> {
    if !ssh {
        return secrets::delete(&id);
    }
    let key = load_profiles(&db)?
        .into_iter()
        .find(|p| p.id == id)
        .map_or_else(|| format!("{id}:ssh"), |p| p.ssh_secret_key());
    // A profile that never had an ssh secret is not an error to clean up.
    secrets::delete(&key).ok();
    secrets::delete(&format!("{key}:passphrase")).ok();
    Ok(())
}

/* ------------------------------------------------------------------ probe */

/// Fetches the endpoint's certificate fingerprint so the user can accept it.
///
/// Nothing is trusted as a result of this call: the fingerprint is only stored
/// once the user confirms it, and from then on every request must match.
#[tauri::command]
async fn probe_endpoint(base_url: String, pinned: Option<String>) -> Result<EndpointProbe, String> {
    let base = validate_base_url(&base_url)?;
    let (client, verifier) = tls::pinned_client(pinned.clone(), 10)?;

    let result = client.get(&base).send().await;
    let seen = verifier.seen_fingerprint();

    match (result, seen) {
        // Any HTTP status is fine — the handshake is what we came for.
        (Ok(_), Some(fp)) => Ok(EndpointProbe {
            reachable: true,
            fingerprint_display: tls::format_fingerprint(&fp),
            changed: false,
            fingerprint: fp,
            message: if pinned.is_some() {
                "A tanúsítvány változatlan.".to_string()
            } else {
                "Első kapcsolat: ellenőrizd az ujjlenyomatot a kiszolgálón, mielőtt elfogadod."
                    .to_string()
            },
        }),
        (Err(e), seen) => {
            let changed = pinned.is_some()
                && seen.as_deref().is_some_and(|s| Some(s) != pinned.as_deref());
            Ok(EndpointProbe {
                reachable: false,
                fingerprint_display: seen.as_deref().map(tls::format_fingerprint).unwrap_or_default(),
                fingerprint: seen.unwrap_or_default(),
                changed,
                message: if changed {
                    "A kiszolgáló tanúsítványa megváltozott. A kapcsolat megszakadt.".to_string()
                } else {
                    format!("Nem sikerült kapcsolódni: {e}")
                },
            })
        }
        (Ok(_), None) => Err("a kapcsolat létrejött, de tanúsítvány nélkül".to_string()),
    }
}

/* -------------------------------------------------------------------- ssh */

/// Fetches the host key so the user can compare it against the server.
///
/// The handshake is aborted as soon as the key is captured, so no credential
/// is ever offered to a host that has not been accepted yet.
#[tauri::command]
async fn probe_ssh_host(
    host: String,
    port: u16,
    pinned: Option<String>,
) -> Result<ssh::HostKeyProbe, String> {
    let host = validate_host(&host)?;
    ssh::probe_host_key(&host, if port == 0 { 22 } else { port }, pinned).await
}

/// What the policy makes of a command, without running it.
///
/// The frontend classifies too, so the user sees the verdict before pressing
/// anything; this is the same answer from the side that actually decides.
#[tauri::command]
fn classify_ssh_command(command: String) -> sshpolicy::Clearance {
    sshpolicy::classify(&command)
}

/// Runs one command on an ssh profile.
///
/// `confirmed` is the user having approved this exact command text. It can
/// unlock a mutating command; it can never unlock a destructive one.
#[tauri::command]
async fn run_ssh_command(
    db: State<'_, Db>,
    profile_id: String,
    command: String,
    confirmed: bool,
) -> Result<ssh::CommandOutput, String> {
    let profile = load_profiles(&db)?
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or("nincs ilyen profil")?;

    if !profile.ssh_enabled {
        return Err("ezen a profilon nincs bekapcsolva az SSH elérés".to_string());
    }
    let pinned = profile
        .ssh_fingerprint
        .clone()
        .ok_or("a gazdagép kulcsa nincs elfogadva, a parancs nem indul")?;

    let key = profile.ssh_secret_key();
    let secret = secrets::read(&key)?;
    let auth = if profile.ssh_auth_method == "key" {
        // The passphrase, when there is one, is stored on its own entry so the
        // key material and the passphrase never share a single secret blob.
        ssh::SshAuth::Key {
            pem: secret,
            passphrase: secrets::read(&format!("{key}:passphrase")).ok(),
        }
    } else {
        ssh::SshAuth::Password(secret)
    };

    ssh::run_command(
        &profile.ssh_host,
        profile.ssh_port_or_default(),
        &profile.ssh_username,
        &pinned,
        auth,
        &command,
        confirmed,
    )
    .await
}

/* ----------------------------------------------------------------- survey */

/// Runs a read-only survey across the given profiles.
///
/// A failing profile does not abort the run: its error is recorded and the
/// others still produce data. Everything the run learns is measured, never
/// inferred — inference happens later, in the mapping layer, and is labelled.
#[tauri::command]
async fn run_survey(db: State<'_, Db>, profile_ids: Vec<String>) -> Result<SurveySnapshot, String> {
    let all = load_profiles(&db)?;
    let selected: Vec<Profile> = all
        .into_iter()
        .filter(|p| profile_ids.contains(&p.id))
        .collect();

    if selected.is_empty() {
        return Err("nincs kiválasztott profil".to_string());
    }

    let started_at = now_iso();
    let mut log: Vec<LogEntry> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut snapshot = SurveySnapshot {
        id: format!("survey-{started_at}"),
        started_at: started_at.clone(),
        ..Default::default()
    };

    for profile in selected {
        let label = profile.label.clone();

        if profile.fingerprint.is_none() {
            errors.push(format!(
                "{label}: a tanúsítvány ujjlenyomata nincs elfogadva, a profil kimarad"
            ));
            log.push(LogEntry::fail(&profile.kind, format!("{label}: nincs rögzített ujjlenyomat")));
            continue;
        }

        let secret = match secrets::read(&profile.id) {
            Ok(s) => s,
            Err(e) => {
                errors.push(format!("{label}: {e}"));
                log.push(LogEntry::fail(&profile.kind, format!("{label}: {e}")));
                continue;
            }
        };

        let (client, _) = match tls::pinned_client(profile.fingerprint.clone(), 30) {
            Ok(c) => c,
            Err(e) => {
                errors.push(format!("{label}: {e}"));
                continue;
            }
        };

        match profile.kind.as_str() {
            "proxmox" => match collect::proxmox::collect(&client, &profile, &secret, &mut log).await {
                Ok(s) => snapshot.proxmox = Some(s),
                Err(e) => {
                    errors.push(format!("{label}: {e}"));
                    log.push(LogEntry::fail("proxmox", e));
                }
            },
            "unifi" => {
                let outcome = async {
                    collect::unifi::login(&client, &profile, &secret, &mut log).await?;
                    collect::unifi::collect(&client, &profile, &secret, &mut log).await
                }
                .await;
                match outcome {
                    Ok(s) => snapshot.unifi = Some(s),
                    Err(e) => {
                        errors.push(format!("{label}: {e}"));
                        log.push(LogEntry::fail("unifi", e));
                    }
                }
            }
            other => errors.push(format!("{label}: ismeretlen profiltípus ({other})")),
        }
    }

    snapshot.finished_at = now_iso();
    snapshot.log = log;
    snapshot.errors = errors;

    if snapshot.proxmox.is_none() && snapshot.unifi.is_none() {
        return Err(format!(
            "a felmérés egyetlen forrásból sem hozott adatot: {}",
            snapshot.errors.join("; ")
        ));
    }

    let payload = serde_json::to_string(&snapshot).map_err(to_err)?;
    upsert(&db, "snapshots", "created_at", &snapshot.id, &payload)?;
    prune_snapshots(&db)?;

    Ok(snapshot)
}

fn prune_snapshots(db: &Db) -> Result<(), String> {
    let conn = db.0.lock().map_err(to_err)?;
    conn.execute(
        "DELETE FROM snapshots WHERE id NOT IN (
            SELECT id FROM snapshots ORDER BY created_at DESC LIMIT ?1
         )",
        rusqlite::params![SNAPSHOT_HISTORY as i64],
    )
    .map_err(to_err)?;
    Ok(())
}

/// The most recent snapshot that still parses.
///
/// A snapshot written by an older build can carry a shape this one no longer
/// understands. That is not worth an error: a survey is a cache of a
/// measurement and can always be run again, whereas failing here would take
/// the connection profiles down with it — and those are the part the user
/// actually typed. Unreadable rows are skipped and the newest readable one
/// wins; if none are readable, the app opens on the demo estate.
#[tauri::command]
fn latest_snapshot(db: State<'_, Db>) -> Result<Option<SurveySnapshot>, String> {
    Ok(read_all(&db, "snapshots", "created_at")?
        .iter()
        .find_map(|payload| serde_json::from_str::<SurveySnapshot>(payload).ok()))
}

/// Enough about each kept snapshot to choose between them.
///
/// Deliberately not the snapshots themselves: a survey of a real estate is a
/// large document, and a list that has to load every one of them to draw a
/// dropdown would get slower the longer the history is kept.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotHeader {
    pub id: String,
    pub started_at: String,
    pub finished_at: String,
    pub devices: usize,
    pub guests: usize,
    pub errors: usize,
}

#[tauri::command]
fn list_snapshots(db: State<'_, Db>) -> Result<Vec<SnapshotHeader>, String> {
    Ok(read_all(&db, "snapshots", "created_at")?
        .iter()
        .filter_map(|payload| serde_json::from_str::<SurveySnapshot>(payload).ok())
        .map(|s| SnapshotHeader {
            id: s.id.clone(),
            started_at: s.started_at.clone(),
            finished_at: s.finished_at.clone(),
            devices: s.unifi.as_ref().map_or(0, |u| u.devices.len()),
            guests: s.proxmox.as_ref().map_or(0, |p| p.guests.len()),
            errors: s.errors.len(),
        })
        .collect())
}

/// One kept snapshot by id, for comparing against the current one.
#[tauri::command]
fn snapshot_by_id(db: State<'_, Db>, id: String) -> Result<Option<SurveySnapshot>, String> {
    Ok(read_all(&db, "snapshots", "created_at")?
        .iter()
        .filter_map(|payload| serde_json::from_str::<SurveySnapshot>(payload).ok())
        .find(|s| s.id == id))
}

/* ------------------------------------------------------------------ apply */

/// Everything a write needs: the profile, its secret, and a pinned client.
///
/// The fingerprint check happens here rather than at each call site, so there
/// is no path to a write over an unverified certificate.
async fn open_session(
    db: &Db,
    profile_id: &str,
) -> Result<(apply::Session, Profile, String), String> {
    let profile = load_profiles(db)?
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or("nincs ilyen profil")?;

    if profile.kind != "unifi" {
        return Err("írás jelenleg csak UniFi vezérlőre támogatott".to_string());
    }
    if profile.fingerprint.is_none() {
        return Err("a profil tanúsítványa nincs elfogadva, írás nem indulhat".to_string());
    }

    let secret = secrets::read(&profile.id)?;
    let (client, _) = tls::pinned_client(profile.fingerprint.clone(), 60)?;
    let session = apply::Session::open(client, &profile, &secret).await?;
    Ok((session, profile, secret))
}

/// Takes a site backup and writes it to disk. Nothing may be written before
/// this succeeds.
#[tauri::command]
async fn take_site_backup(
    db: State<'_, Db>,
    dir: State<'_, BackupDir>,
    profile_id: String,
) -> Result<apply::BackupResult, String> {
    let target = dir.0.clone();
    let (session, _, secret) = open_session(&db, &profile_id).await?;
    apply::take_backup(&session, &secret, &target).await
}

#[tauri::command]
async fn apply_operations(
    db: State<'_, Db>,
    profile_id: String,
    dry_run_token: String,
    confirm_token: String,
    backup_path: String,
    operations: Vec<apply::WriteOp>,
) -> Result<apply::ApplyRun, String> {
    let (session, profile, secret) = open_session(&db, &profile_id).await?;

    let run = apply::apply(
        &session,
        apply::ApplyRequest {
            profile: &profile,
            secret: &secret,
            dry_run_token: &dry_run_token,
            confirm_token: &confirm_token,
            backup_path: &backup_path,
            operations,
        },
    )
    .await?;

    let payload = serde_json::to_string(&run).map_err(to_err)?;
    upsert(&db, "apply_runs", "created_at", &run.id, &payload)?;
    Ok(run)
}

#[tauri::command]
async fn rollback_apply_run(
    db: State<'_, Db>,
    profile_id: String,
    run_id: String,
) -> Result<apply::ApplyRun, String> {
    let stored = read_all(&db, "apply_runs", "created_at")?;
    let mut run: apply::ApplyRun = stored
        .iter()
        .filter_map(|p| serde_json::from_str::<apply::ApplyRun>(p).ok())
        .find(|r| r.id == run_id)
        .ok_or("nincs ilyen futás a naplóban")?;

    let (session, _, secret) = open_session(&db, &profile_id).await?;
    let outcome = apply::rollback(&session, &secret, &mut run).await;

    // The journal is saved either way: a partial rollback is exactly the state
    // someone will need to read afterwards.
    let payload = serde_json::to_string(&run).map_err(to_err)?;
    upsert(&db, "apply_runs", "created_at", &run.id, &payload)?;

    outcome.map(|()| run)
}

#[tauri::command]
fn list_apply_runs(db: State<'_, Db>) -> Result<Vec<apply::ApplyRun>, String> {
    read_all(&db, "apply_runs", "created_at")?
        .into_iter()
        .map(|p| serde_json::from_str::<apply::ApplyRun>(&p).map_err(to_err))
        .collect()
}

#[tauri::command]
fn clear_snapshots(db: State<'_, Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(to_err)?;
    conn.execute("DELETE FROM snapshots", []).map_err(to_err)?;
    Ok(())
}

/// Brings the window back if the restored position lands off every monitor.
///
/// The saved position is from the display arrangement the app was last closed
/// on. Unplug a dock and that position can be somewhere no screen reaches any
/// more — the window is running, focused, and completely invisible, with no way
/// to drag it back because the title bar is off-screen too.
///
/// The test is how much of the window actually lands on a monitor rather than
/// whether its corner does: a window one pixel onto the screen is not usable.
fn ensure_on_screen(window: &tauri::WebviewWindow) {
    /// Enough of the window to grab and drag, roughly a title bar's worth.
    const MIN_VISIBLE: i64 = 200 * 40;

    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    let Ok(monitors) = window.available_monitors() else {
        return;
    };
    if monitors.is_empty() {
        return;
    }

    let (wx, wy) = (position.x as i64, position.y as i64);
    let (ww, wh) = (size.width as i64, size.height as i64);

    let visible: i64 = monitors
        .iter()
        .map(|monitor| {
            let mp = monitor.position();
            let ms = monitor.size();
            let (mx, my) = (mp.x as i64, mp.y as i64);
            let (mw, mh) = (ms.width as i64, ms.height as i64);

            let overlap_x = (wx + ww).min(mx + mw) - wx.max(mx);
            let overlap_y = (wy + wh).min(my + mh) - wy.max(my);
            overlap_x.max(0) * overlap_y.max(0)
        })
        .max()
        .unwrap_or(0);

    if visible < MIN_VISIBLE {
        let _ = window.center();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The webview is not always a secure context on Windows, so
        // navigator.clipboard can be unavailable; the frontend prefers this
        // plugin and only falls back to the web API.
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        // Remembers where the window was and how big it was.
        //
        // DECORATIONS is deliberately absent from the flags: this window is
        // undecorated and draws its own title bar, so restoring a saved
        // decoration state could put a second one back after an upgrade.
        // VISIBLE is out too — a window saved while hidden should still open.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED
                        | tauri_plugin_window_state::StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                ensure_on_screen(&window);
            }

            let dir = app.path().app_local_data_dir()?;
            fs::create_dir_all(&dir)?;
            let conn = Connection::open(dir.join("blueprints.sqlite3"))?;
            conn.execute_batch(SCHEMA)?;
            app.manage(Db(Mutex::new(conn)));
            app.manage(BackupDir(dir.join("backups")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_blueprints,
            save_blueprint,
            delete_blueprint,
            write_text_file,
            read_text_file,
            list_profiles,
            save_profile,
            delete_profile,
            store_profile_secret,
            profile_has_secret,
            delete_profile_secret,
            probe_endpoint,
            probe_ssh_host,
            classify_ssh_command,
            run_ssh_command,
            run_survey,
            latest_snapshot,
            clear_snapshots,
            list_snapshots,
            snapshot_by_id,
            take_site_backup,
            apply_operations,
            rollback_apply_run,
            list_apply_runs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
