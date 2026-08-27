use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{LogEntry, Profile};

/// Proxmox VE read-only collector.
///
/// Every call here is a GET. The token is expected to carry a read-only role
/// (`PVEAuditor` is enough), but the collector does not rely on that: it simply
/// never issues anything but GET.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProxmoxSnapshot {
    pub version: String,
    pub nodes: Vec<PveNode>,
    pub storages: Vec<PveStorage>,
    pub guests: Vec<PveGuest>,
    pub interfaces: Vec<PveInterface>,
    pub disks: Vec<PveDisk>,
    // Snapshots are stored as JSON and read back by a later build, so every
    // field added after the first release needs a default — without one, an
    // older row stops parsing and takes the whole load with it.
    #[serde(default)]
    pub backup_jobs: Vec<PveBackupJob>,
    /// Set when the cluster let us list backup jobs at all. A token scoped to
    /// read guests but not `/cluster/backup` is a sensible setup, and "there is
    /// no backup job" must never be said on the strength of a refused read.
    #[serde(default)]
    pub backup_jobs_readable: bool,
    #[serde(default)]
    pub backup_files: Vec<PveBackupFile>,
    #[serde(default)]
    pub certificates: Vec<PveCertificate>,
    #[serde(default)]
    pub updates: Vec<PveUpdate>,
    /// Set when the node refused to list updates, which a read-only token can
    /// legitimately be denied. Absence of updates and inability to look are
    /// different facts and must not both read as "nothing pending".
    #[serde(default)]
    pub updates_readable: bool,
}

/// A certificate the node serves, and when it stops being valid.
///
/// Read because it is the classic thing nobody notices until the morning it
/// breaks, and because it costs one call to an endpoint a read-only token is
/// already allowed.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PveCertificate {
    pub node: String,
    pub filename: String,
    pub subject: String,
    pub issuer: String,
    /// Unix seconds; 0 when the node did not say.
    pub not_after: u64,
    pub fingerprint: String,
}

/// A package with a newer version available.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PveUpdate {
    pub node: String,
    pub package: String,
    pub current: String,
    pub candidate: String,
    /// "important" marks the security and stability ones.
    pub priority: String,
    pub title: String,
}

/// A scheduled backup job, as configured.
///
/// A job existing is not evidence that it runs — that comes from the files it
/// left behind, which is why both are collected.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PveBackupJob {
    pub id: String,
    pub enabled: bool,
    pub schedule: String,
    pub storage: String,
    /// "all", or a comma-separated vmid list.
    pub selection: String,
    pub exclude: String,
    pub mode: String,
    pub retention: String,
    /// Unix seconds; 0 when the controller did not say.
    pub next_run: u64,
    pub mail_notification: String,
    pub comment: String,
}

/// One backup that actually exists on a store.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PveBackupFile {
    pub storage: String,
    pub node: String,
    pub volid: String,
    pub vmid: u64,
    /// Unix seconds.
    pub ctime: u64,
    pub size: u64,
    pub protected: bool,
    /// "ok" / "failed" / empty. Only a Proxmox Backup Server store verifies;
    /// on a plain vzdump target this stays empty, which is a fact in itself.
    pub verification: String,
    pub notes: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PveNode {
    pub name: String,
    pub status: String,
    pub cpu_ratio: f64,
    pub cpu_count: u64,
    pub mem_used: u64,
    pub mem_total: u64,
    pub uptime_secs: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PveStorage {
    pub node: String,
    pub name: String,
    pub kind: String,
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub enabled: bool,
    /// Comma-separated content types, e.g. "images,rootdir,backup".
    #[serde(default)]
    pub content: String,
    /// Whether the store is currently mounted and answering.
    ///
    /// Separates "the administrator switched this off" from "we were told
    /// nothing about it": an inactive store legitimately reports no usage,
    /// whereas an active one that reports none points at the token's rights.
    #[serde(default)]
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PveGuest {
    pub vmid: u64,
    pub name: String,
    /// "qemu" or "lxc".
    pub kind: String,
    pub node: String,
    pub status: String,
    pub cpu_count: u64,
    pub mem_total: u64,
    pub disk_total: u64,
    pub tags: String,
    /*
     * The guest's own network interfaces.
     *
     * Which bridge a guest hangs off and which VLAN it is tagged into is the
     * one thing about a virtual machine that decides what it can reach, and it
     * lived nowhere in the survey — the map could draw a guest but not say what
     * network it was on. It comes from the guest's config, which is one call
     * per guest and the only place Proxmox keeps it.
     *
     * Empty where the config could not be read, which a survey taken before
     * this existed also produces; both mean "not measured", never "no network".
     */
    #[serde(default)]
    pub nics: Vec<PveGuestNic>,
}

/// One virtual interface of a guest, as its configuration has it.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PveGuestNic {
    /// "net0", as Proxmox numbers them.
    pub name: String,
    /// The device model — "virtio", "e1000" — or "veth" for a container.
    pub model: String,
    pub mac: String,
    /// The bridge it is plugged into, e.g. "vmbr0".
    pub bridge: String,
    /// The VLAN it is tagged into; absent where the bridge passes it untagged.
    pub vlan: Option<u64>,
    /// Whether the Proxmox firewall is switched on for this interface.
    pub firewall: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PveInterface {
    pub node: String,
    pub name: String,
    pub kind: String,
    pub address: Option<String>,
    pub cidr: Option<String>,
    pub bridge_ports: Option<String>,
    pub vlan_aware: bool,
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PveDisk {
    pub node: String,
    pub devpath: String,
    pub model: String,
    pub serial: String,
    pub size: u64,
    pub health: String,
    pub used_by: String,
}

const SOURCE: &str = "proxmox";

fn as_str(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn as_u64(v: &Value, key: &str) -> u64 {
    v.get(key)
        .and_then(|x| x.as_u64().or_else(|| x.as_f64().map(|f| f as u64)))
        .unwrap_or(0)
}

fn as_f64(v: &Value, key: &str) -> f64 {
    v.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}

fn as_bool(v: &Value, key: &str) -> bool {
    match v.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        Some(Value::String(s)) => s == "1" || s.eq_ignore_ascii_case("yes"),
        _ => false,
    }
}

/// Proxmox wraps every payload in `{ "data": … }`.
async fn get(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    path: &str,
) -> Result<Value, String> {
    let url = format!("{base}/api2/json{path}");
    let res = client
        .get(&url)
        .header("Authorization", format!("PVEAPIToken={token}"))
        .send()
        .await
        .map_err(|e| format!("{path}: {e}"))?;

    let status = res.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => format!("{path}: a token nem érvényes vagy lejárt (401)"),
            403 => format!("{path}: a tokennek nincs jogosultsága ehhez (403)"),
            other => format!("{path}: a kiszolgáló {other} kóddal válaszolt"),
        });
    }

    let body: Value = res.json().await.map_err(|e| format!("{path}: {e}"))?;
    Ok(body.get("data").cloned().unwrap_or(Value::Null))
}

fn array(v: &Value) -> Vec<Value> {
    v.as_array().cloned().unwrap_or_default()
}

/*
 * One `netN` line of a guest's configuration.
 *
 * Proxmox writes it as comma-separated `key=value` pairs, and the two guest
 * kinds spell the same facts differently: a virtual machine names the device
 * model as the key carrying the MAC (`virtio=AA:BB:...`), a container puts the
 * address in `hwaddr` and calls itself `veth`. Both shapes are read here rather
 * than in two places, because the question — which bridge, which VLAN — is the
 * same question.
 *
 * A line with no bridge is not a network interface this survey can say anything
 * about, and is left out rather than reported as a guest on no network.
 */
fn parse_nic(name: &str, line: &str) -> Option<PveGuestNic> {
    let mut nic = PveGuestNic {
        name: name.to_string(),
        ..Default::default()
    };

    for part in line.split(',') {
        let Some((key, value)) = part.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();

        match key {
            "bridge" => nic.bridge = value.to_string(),
            "tag" => nic.vlan = value.parse::<u64>().ok(),
            "firewall" => nic.firewall = value == "1",
            "hwaddr" => nic.mac = value.to_uppercase(),
            "type" => {
                if nic.model.is_empty() {
                    nic.model = value.to_string();
                }
            }
            // A virtual machine names its model as the key holding the MAC.
            _ if value.len() == 17 && value.matches(':').count() == 5 => {
                nic.model = key.to_string();
                nic.mac = value.to_uppercase();
            }
            _ => {}
        }
    }

    if nic.bridge.is_empty() {
        return None;
    }
    Some(nic)
}

/// Every `netN` line of one guest configuration, in order.
fn nics_of(config: &Value) -> Vec<PveGuestNic> {
    let Some(map) = config.as_object() else {
        return Vec::new();
    };

    let mut found: Vec<(u64, PveGuestNic)> = map
        .iter()
        .filter_map(|(key, value)| {
            let index = key.strip_prefix("net")?.parse::<u64>().ok()?;
            let nic = parse_nic(key, value.as_str()?)?;
            Some((index, nic))
        })
        .collect();

    found.sort_by_key(|(i, _)| *i);
    found.into_iter().map(|(_, nic)| nic).collect()
}

pub async fn collect(
    client: &reqwest::Client,
    profile: &Profile,
    secret: &str,
    log: &mut Vec<LogEntry>,
) -> Result<ProxmoxSnapshot, String> {
    let base = profile.base_url.trim_end_matches('/');
    let token = format!("{}={}", profile.username, secret);
    let mut snap = ProxmoxSnapshot::default();

    // Version first: it is the cheapest call that proves auth works.
    let version = get(client, base, &token, "/version").await?;
    snap.version = format!(
        "{} {}",
        as_str(&version, "release"),
        as_str(&version, "version")
    )
    .trim()
    .to_string();
    log.push(LogEntry::ok(SOURCE, format!("GET /version → {}", snap.version)));

    let nodes = array(&get(client, base, &token, "/nodes").await?);
    for n in &nodes {
        snap.nodes.push(PveNode {
            name: as_str(n, "node"),
            status: as_str(n, "status"),
            cpu_ratio: as_f64(n, "cpu"),
            cpu_count: as_u64(n, "maxcpu"),
            mem_used: as_u64(n, "mem"),
            mem_total: as_u64(n, "maxmem"),
            uptime_secs: as_u64(n, "uptime"),
        });
    }
    log.push(LogEntry::ok(
        SOURCE,
        format!("GET /nodes → {} csomópont", snap.nodes.len()),
    ));

    let resources = array(&get(client, base, &token, "/cluster/resources").await?);
    for r in &resources {
        let kind = as_str(r, "type");
        if kind == "qemu" || kind == "lxc" {
            snap.guests.push(PveGuest {
                vmid: as_u64(r, "vmid"),
                name: as_str(r, "name"),
                kind: kind.clone(),
                node: as_str(r, "node"),
                status: as_str(r, "status"),
                cpu_count: as_u64(r, "maxcpu"),
                mem_total: as_u64(r, "maxmem"),
                disk_total: as_u64(r, "maxdisk"),
                tags: as_str(r, "tags"),
                // Filled in below, one config call per guest.
                nics: Vec::new(),
            });
        }
    }
    let vms = snap.guests.iter().filter(|g| g.kind == "qemu").count();
    let cts = snap.guests.len() - vms;
    log.push(LogEntry::ok(
        SOURCE,
        format!("GET /cluster/resources → {vms} VM, {cts} LXC"),
    ));

    /*
     * What each guest is plugged into.
     *
     * One call per guest, which is the only way Proxmox offers it — the cluster
     * resource list carries no network detail at all. A guest whose config
     * cannot be read keeps an empty list and the run carries on: a token
     * without VM.Audit on one pool is a normal setup, and losing the whole
     * survey over it would be the wrong trade.
     */
    let mut with_nics = 0usize;
    let mut refused = 0usize;
    for i in 0..snap.guests.len() {
        let (node, kind, vmid) = {
            let g = &snap.guests[i];
            (g.node.clone(), g.kind.clone(), g.vmid)
        };
        match get(client, base, &token, &format!("/nodes/{node}/{kind}/{vmid}/config")).await {
            Ok(config) => {
                let nics = nics_of(&config);
                if !nics.is_empty() {
                    with_nics += 1;
                }
                snap.guests[i].nics = nics;
            }
            Err(_) => refused += 1,
        }
    }
    if !snap.guests.is_empty() {
        log.push(LogEntry::ok(
            SOURCE,
            format!(
                "GET /nodes/*/*/config → {with_nics} vendéggép hálózati beállítása{}",
                if refused > 0 {
                    format!(", {refused} nem volt olvasható")
                } else {
                    String::new()
                }
            ),
        ));
    }

    // Per-node detail. One node failing must not lose the others.
    for node in snap.nodes.clone() {
        let name = &node.name;

        match get(client, base, &token, &format!("/nodes/{name}/storage")).await {
            Ok(v) => {
                for s in array(&v) {
                    snap.storages.push(PveStorage {
                        node: name.clone(),
                        name: as_str(&s, "storage"),
                        kind: as_str(&s, "type"),
                        total: as_u64(&s, "total"),
                        used: as_u64(&s, "used"),
                        available: as_u64(&s, "avail"),
                        enabled: as_bool(&s, "enabled"),
                        content: as_str(&s, "content"),
                        active: as_bool(&s, "active"),
                    });
                }
                log.push(LogEntry::ok(
                    SOURCE,
                    format!(
                        "GET /nodes/{name}/storage → {} tároló",
                        snap.storages.iter().filter(|s| &s.node == name).count()
                    ),
                ));
            }
            Err(e) => log.push(LogEntry::fail(SOURCE, e)),
        }

        match get(client, base, &token, &format!("/nodes/{name}/network")).await {
            Ok(v) => {
                for i in array(&v) {
                    snap.interfaces.push(PveInterface {
                        node: name.clone(),
                        name: as_str(&i, "iface"),
                        kind: as_str(&i, "type"),
                        address: i.get("address").and_then(Value::as_str).map(String::from),
                        cidr: i.get("cidr").and_then(Value::as_str).map(String::from),
                        bridge_ports: i.get("bridge_ports").and_then(Value::as_str).map(String::from),
                        vlan_aware: as_bool(&i, "bridge_vlan_aware"),
                        active: as_bool(&i, "active"),
                    });
                }
                log.push(LogEntry::ok(
                    SOURCE,
                    format!(
                        "GET /nodes/{name}/network → {} interfész",
                        snap.interfaces.iter().filter(|s| &s.node == name).count()
                    ),
                ));
            }
            Err(e) => log.push(LogEntry::fail(SOURCE, e)),
        }

        // Disk inventory needs a slightly higher privilege than the rest, so a
        // failure here is expected on a narrowly scoped token.
        match get(client, base, &token, &format!("/nodes/{name}/disks/list")).await {
            Ok(v) => {
                for d in array(&v) {
                    snap.disks.push(PveDisk {
                        node: name.clone(),
                        devpath: as_str(&d, "devpath"),
                        model: as_str(&d, "model"),
                        serial: as_str(&d, "serial"),
                        size: as_u64(&d, "size"),
                        health: as_str(&d, "health"),
                        used_by: as_str(&d, "used"),
                    });
                }
                log.push(LogEntry::ok(
                    SOURCE,
                    format!(
                        "GET /nodes/{name}/disks/list → {} lemez",
                        snap.disks.iter().filter(|s| &s.node == name).count()
                    ),
                ));
            }
            Err(e) => log.push(LogEntry::fail(
                SOURCE,
                format!("{e} — a lemezleltár kimarad"),
            )),
        }

        collect_certificates(client, base, &token, name, &mut snap, log).await;
        collect_updates(client, base, &token, name, &mut snap, log).await;
    }

    collect_backups(client, base, &token, &mut snap, log).await;

    Ok(snap)
}

/// The certificates a node serves, and when they expire.
///
/// Read-only and cheap. This is the classic thing nobody notices until the
/// morning it breaks, and the node knows the answer already.
async fn collect_certificates(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    node: &str,
    snap: &mut ProxmoxSnapshot,
    log: &mut Vec<LogEntry>,
) {
    match get(client, base, token, &format!("/nodes/{node}/certificates/info")).await {
        Ok(v) => {
            for c in array(&v) {
                snap.certificates.push(PveCertificate {
                    node: node.to_string(),
                    filename: as_str(&c, "filename"),
                    subject: as_str(&c, "subject"),
                    issuer: as_str(&c, "issuer"),
                    not_after: as_u64(&c, "notafter"),
                    fingerprint: as_str(&c, "fingerprint"),
                });
            }
            log.push(LogEntry::ok(
                SOURCE,
                format!(
                    "GET /nodes/{node}/certificates/info → {} tanúsítvány",
                    snap.certificates.iter().filter(|c| c.node == node).count()
                ),
            ));
        }
        Err(e) => log.push(LogEntry::fail(SOURCE, format!("{e} — a tanúsítványok kimaradnak"))),
    }
}

/// Parses `/nodes/<node>/apt/update` into the pending package list.
///
/// Shared with the ssh read for the same reason the backup parser is: one set
/// of field names, so two ways in cannot disagree about what came back.
pub fn parse_updates(v: &Value, node: &str, snap: &mut ProxmoxSnapshot) -> usize {
    let before = snap.updates.len();
    for u in array(v) {
        snap.updates.push(PveUpdate {
            node: node.to_string(),
            package: as_str(&u, "Package"),
            current: as_str(&u, "OldVersion"),
            candidate: as_str(&u, "Version"),
            priority: as_str(&u, "Priority"),
            title: as_str(&u, "Title"),
        });
    }
    snap.updates.len() - before
}

/// Packages with a newer version waiting.
///
/// Proxmox guards this endpoint more tightly than the rest of the audit surface,
/// so a read-only token is quite likely to be refused. That is recorded rather
/// than treated as an error: "nothing is pending" and "we were not allowed to
/// look" are different facts, and only the first is reassuring.
async fn collect_updates(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    node: &str,
    snap: &mut ProxmoxSnapshot,
    log: &mut Vec<LogEntry>,
) {
    match get(client, base, token, &format!("/nodes/{node}/apt/update")).await {
        Ok(v) => {
            snap.updates_readable = true;
            parse_updates(&v, node, snap);
            log.push(LogEntry::ok(
                SOURCE,
                format!(
                    "GET /nodes/{node}/apt/update → {} frissítés",
                    snap.updates.iter().filter(|u| u.node == node).count()
                ),
            ));
        }
        Err(e) => log.push(LogEntry::fail(
            SOURCE,
            format!("{e} — a függőben lévő frissítések nem olvashatók ezzel a tokennel"),
        )),
    }
}

/// Parses `/cluster/backup` into jobs.
///
/// Shared by the API read and the ssh one: `pvesh get` returns the same objects
/// the API does, so the difference between them is how the bytes arrived and
/// nothing else. One parser means a job read over ssh cannot come out subtly
/// different from the same job read over HTTPS.
pub fn parse_backup_jobs(v: &Value, snap: &mut ProxmoxSnapshot) -> usize {
    let before = snap.backup_jobs.len();
    for j in array(v) {
                let all = as_bool(&j, "all");
                snap.backup_jobs.push(PveBackupJob {
                    id: as_str(&j, "id"),
                    // Proxmox omits `enabled` when the job is on.
                    enabled: j.get("enabled").map(|_| as_bool(&j, "enabled")).unwrap_or(true),
                    schedule: {
                        let s = as_str(&j, "schedule");
                        if s.is_empty() {
                            // Pre-7.0 jobs carry day-of-week plus a start time.
                            let dow = as_str(&j, "dow");
                            let start = as_str(&j, "starttime");
                            format!("{dow} {start}").trim().to_string()
                        } else {
                            s
                        }
                    },
                    storage: as_str(&j, "storage"),
                    selection: if all {
                        "all".to_string()
                    } else {
                        as_str(&j, "vmid")
                    },
                    exclude: as_str(&j, "exclude"),
                    mode: as_str(&j, "mode"),
                    retention: {
                        let prune = as_str(&j, "prune-backups");
                        if prune.is_empty() {
                            let max = as_u64(&j, "maxfiles");
                            if max > 0 {
                                format!("maxfiles={max}")
                            } else {
                                String::new()
                            }
                        } else {
                            prune
                        }
                    },
                    next_run: as_u64(&j, "next-run"),
                    mail_notification: as_str(&j, "mailnotification"),
                    comment: as_str(&j, "comment"),
                });
            }
    snap.backup_jobs.len() - before
}

/// Backup jobs and the files they left behind.
///
/// Both halves matter and neither substitutes for the other: a job proves
/// intent, a file proves it ran. The view compares them, so a job that has
/// silently stopped producing anything is visible instead of reassuring.
///
/// Failures here never abort the survey — a token scoped narrowly enough to
/// read guests but not `/cluster/backup` is a normal, sensible setup.
async fn collect_backups(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    snap: &mut ProxmoxSnapshot,
    log: &mut Vec<LogEntry>,
) {
    match get(client, base, token, "/cluster/backup").await {
        Ok(v) => {
            parse_backup_jobs(&v, snap);
            snap.backup_jobs_readable = true;
            log.push(LogEntry::ok(
                SOURCE,
                format!("GET /cluster/backup → {} mentési feladat", snap.backup_jobs.len()),
            ));
        }
        Err(e) => log.push(LogEntry::fail(
            SOURCE,
            format!("{e} — a mentési feladatok kimaradnak"),
        )),
    }

    // A shared store is listed on every node; asking each one would return the
    // same files over and over, so each store is read exactly once.
    let mut seen: Vec<String> = Vec::new();
    let stores: Vec<(String, String)> = snap
        .storages
        .iter()
        .filter(|s| s.enabled && s.content.split(',').any(|c| c.trim() == "backup"))
        .filter_map(|s| {
            if seen.contains(&s.name) {
                None
            } else {
                seen.push(s.name.clone());
                Some((s.node.clone(), s.name.clone()))
            }
        })
        .collect();

    for (node, store) in stores {
        let path = format!("/nodes/{node}/storage/{store}/content?content=backup");
        match get(client, base, token, &path).await {
            Ok(v) => {
                let before = snap.backup_files.len();
                for f in array(&v) {
                    snap.backup_files.push(PveBackupFile {
                        storage: store.clone(),
                        node: node.clone(),
                        volid: as_str(&f, "volid"),
                        vmid: as_u64(&f, "vmid"),
                        ctime: as_u64(&f, "ctime"),
                        size: as_u64(&f, "size"),
                        protected: as_bool(&f, "protected"),
                        verification: f
                            .get("verification")
                            .and_then(|x| x.get("state"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        notes: as_str(&f, "notes"),
                    });
                }
                log.push(LogEntry::ok(
                    SOURCE,
                    format!(
                        "GET {store} content=backup → {} mentés",
                        snap.backup_files.len() - before
                    ),
                ));
            }
            Err(e) => log.push(LogEntry::fail(SOURCE, format!("{e} — {store} kimarad"))),
        }
    }
}

/// How a guest says what it is plugged into.
///
/// The two guest kinds write the same facts in different words, and both
/// spellings come off real configurations. Reading either one wrong is silent:
/// the guest still appears on the map, just on no network — which is worse than
/// not drawing it, because it looks like an answer.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_virtual_machine_names_its_model_as_the_key_holding_the_mac() {
        let nic = parse_nic("net0", "virtio=DE:AD:BE:EF:00:01,bridge=vmbr0,tag=20,firewall=1")
            .expect("a nic");
        assert_eq!(nic.model, "virtio");
        assert_eq!(nic.mac, "DE:AD:BE:EF:00:01");
        assert_eq!(nic.bridge, "vmbr0");
        assert_eq!(nic.vlan, Some(20));
        assert!(nic.firewall);
    }

    #[test]
    fn a_container_keeps_the_address_under_hwaddr() {
        let nic = parse_nic(
            "net0",
            "name=eth0,bridge=vmbr1,hwaddr=aa:bb:cc:dd:ee:ff,ip=dhcp,type=veth",
        )
        .expect("a nic");
        assert_eq!(nic.mac, "AA:BB:CC:DD:EE:FF");
        assert_eq!(nic.model, "veth");
        assert_eq!(nic.bridge, "vmbr1");
        assert_eq!(nic.vlan, None, "an untagged interface has no VLAN, not zero");
    }

    #[test]
    fn an_interface_with_no_bridge_is_not_reported_as_a_network() {
        assert!(parse_nic("net0", "virtio=DE:AD:BE:EF:00:01").is_none());
    }

    #[test]
    fn every_interface_is_read_in_order() {
        let config: Value = serde_json::from_str(
            r#"{
                "name": "docker",
                "net1": "virtio=DE:AD:BE:EF:00:02,bridge=vmbr1",
                "net0": "virtio=DE:AD:BE:EF:00:01,bridge=vmbr0,tag=20",
                "scsi0": "local-zfs:vm-101-disk-0,size=32G"
            }"#,
        )
        .unwrap();
        let nics = nics_of(&config);
        assert_eq!(nics.len(), 2, "{nics:?}");
        assert_eq!(nics[0].name, "net0");
        assert_eq!(nics[1].bridge, "vmbr1");
    }

    #[test]
    fn a_config_that_says_nothing_about_networks_yields_none() {
        let config: Value = serde_json::from_str(r#"{ "name": "x", "cores": 2 }"#).unwrap();
        assert!(nics_of(&config).is_empty());
    }
}
