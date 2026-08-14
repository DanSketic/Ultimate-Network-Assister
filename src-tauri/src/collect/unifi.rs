use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{LogEntry, Profile};

/// UniFi Network read-only collector.
///
/// Two auth shapes are supported. An API key goes straight on the request as a
/// header; a username and password first exchange for a session cookie. Only
/// the login is a POST — everything after it is a GET.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UnifiSnapshot {
    pub site: String,
    pub devices: Vec<UnifiDevice>,
    pub networks: Vec<UnifiNetwork>,
    pub wlans: Vec<UnifiWlan>,
    pub firewall_rules: Vec<UnifiRule>,
    pub clients: Vec<UnifiClient>,
    // Added after the first release; see the note on ProxmoxSnapshot.
    #[serde(default)]
    pub port_profiles: Vec<UnifiPortProfile>,
    /*
     * The ruleset as the gateway holds it, verbatim.
     *
     * Kept as the untouched text rather than a parsed structure. Everything
     * else here came from the controller's configuration, which records an
     * intention; this came from the machine enforcing it. Storing the raw dump
     * means a later build can read more out of it than this one knows how to,
     * from surveys already taken — and means what the interface claims can
     * always be checked against what the gateway said.
     *
     * Empty when the profile has no ssh access, which is the ordinary case and
     * not an error.
     */
    #[serde(default)]
    pub live_firewall: String,
    /*
     * The same for IPv6, and the addresses needed to interpret it.
     *
     * An IPv6 table with no zone chains means one of two opposite things — the
     * family is not filtered, or the family is not carried — and no firewall
     * dump distinguishes them. `live_addresses` is `ip -br addr`, from which
     * the routable IPv6 addresses say which it is. Reading the first without
     * the second would let the survey report a leak on every estate that runs
     * no IPv6 at all.
     */
    #[serde(default)]
    pub live_firewall_v6: String,
    #[serde(default)]
    pub live_addresses: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifiDevice {
    pub mac: String,
    pub name: String,
    pub model: String,
    pub kind: String,
    pub state: i64,
    pub ip: String,
    pub version: String,
    pub uptime_secs: u64,
    pub clients: u64,
    /// Neighbour MACs seen over LLDP; the basis for physical links.
    pub uplink_mac: String,
    /// Which port of the parent this device hangs off, as the device itself
    /// reports it. A second measured source for the same fact as LLDP, and
    /// often the only one — plenty of hardware does not announce itself.
    #[serde(default)]
    pub uplink_remote_port: u64,
    /// The local port carrying that uplink.
    #[serde(default)]
    pub uplink_local_port: u64,
    /// Physical ports, where the device has any. Empty for access points.
    #[serde(default)]
    pub ports: Vec<UnifiPort>,
    /// Radios, where the device has any. Empty for switches and gateways.
    #[serde(default)]
    pub radios: Vec<UnifiRadio>,
}

/// One radio on an access point.
///
/// The controller reports the settings and the measurements in two separate
/// arrays of the same device object we already download; both are read and
/// joined on the radio's own name.
///
/// Channel utilisation is the number worth having. It is the share of airtime
/// the radio observed as busy — including other people's networks, which is
/// exactly what a channel choice has to account for and exactly what nobody can
/// see by looking at their own equipment.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifiRadio {
    /// The controller's own name for the radio, e.g. "wifi0".
    pub name: String,
    /// "ng" for 2.4 GHz, "na" for 5 GHz, "6e" for 6 GHz.
    pub band: String,
    pub channel: String,
    /// Channel width in MHz, as configured.
    pub width: u64,
    /// "auto" or "custom".
    pub tx_power_mode: String,
    /// dBm, when the controller reports a figure.
    pub tx_power: i64,
    /// Percentage of airtime seen busy; -1 when the controller did not say.
    pub utilisation: i64,
    /// The share of that which is this radio's own traffic.
    pub self_utilisation: i64,
    pub clients: u64,
    /// The controller's own 0–100 verdict; -1 when absent.
    pub satisfaction: i64,
}

/// One physical port, as the controller reports it.
///
/// Everything here is measured. What is *on* a port comes from the device's own
/// LLDP neighbour table where the neighbour speaks LLDP, and is left empty
/// otherwise rather than guessed — an unlabelled port is a fact worth seeing.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifiPort {
    /// 1-based port number as printed on the case.
    pub idx: u64,
    pub name: String,
    pub up: bool,
    pub enabled: bool,
    /// Negotiated speed in Mbit/s; 0 when the port is down.
    pub speed: u64,
    pub full_duplex: bool,
    /// True where the port is delivering power.
    pub poe_enabled: bool,
    pub poe_power: String,
    /// Port profile / native network id the controller has on this port.
    pub port_conf_id: String,
    /// "all", "disabled" or a tagged-VLAN group name.
    pub tagged_vlan_mgmt: String,
    /// LLDP neighbour, when the far end announces itself.
    pub neighbour_mac: String,
    pub neighbour_name: String,
    pub neighbour_port: String,
    pub is_uplink: bool,
}

/// A port profile as the controller has it.
///
/// Collected because the apply layer writes these, and a dry run that cannot
/// see the current value can only ever offer to create — never to leave alone.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifiPortProfile {
    pub id: String,
    pub name: String,
    /// "all", "native", "customize" or "disabled".
    pub forward: String,
    /// Network id of the untagged network; resolved to a VLAN by the caller.
    pub native_network_id: String,
    pub tagged_vlans: Vec<u64>,
    pub poe_mode: String,
    /// True for the profiles UniFi ships and will not let anyone change.
    pub builtin: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifiNetwork {
    pub id: String,
    pub name: String,
    pub vlan: Option<u64>,
    pub subnet: String,
    pub purpose: String,
    pub enabled: bool,
    pub dhcp_enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifiWlan {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub security: String,
    pub network_id: String,
    pub is_guest: bool,
    /// Number of private pre-shared keys configured on the SSID.
    pub ppsk_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifiRule {
    pub id: String,
    pub name: String,
    pub action: String,
    pub ruleset: String,
    pub index: i64,
    pub enabled: bool,
    pub protocol: String,
    pub dst_port: String,
    pub src: String,
    pub dst: String,
    pub logging: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifiClient {
    pub mac: String,
    pub hostname: String,
    pub ip: String,
    pub network: String,
    pub vlan: Option<u64>,
    pub wired: bool,
    pub ap_mac: String,
    pub oui: String,
    /// For a wired client: the switch it is plugged into, and which port.
    ///
    /// This is the third measured source for what is on a port, and the only
    /// one that works for equipment the controller does not manage. A Proxmox
    /// host is not a UniFi device, so it has no uplink report, and a stock
    /// install does not announce itself over LLDP — but the controller still
    /// learned its MAC on a port, and says so here.
    #[serde(default)]
    pub switch_mac: String,
    #[serde(default)]
    pub switch_port: u64,
}

const SOURCE: &str = "unifi";

fn as_str(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn as_u64_opt(v: &Value, key: &str) -> Option<u64> {
    v.get(key).and_then(|x| {
        x.as_u64()
            .or_else(|| x.as_str().and_then(|s| s.parse::<u64>().ok()))
    })
}

fn as_u64(v: &Value, key: &str) -> u64 {
    as_u64_opt(v, key).unwrap_or(0)
}

fn as_i64(v: &Value, key: &str) -> i64 {
    v.get(key).and_then(Value::as_i64).unwrap_or(0)
}

/// Reads a device's port table, matching each port to its LLDP neighbour.
///
/// The two live in separate arrays on the device object and are joined on the
/// port index. A port with no neighbour entry is reported empty rather than
/// guessed: "nothing announced itself here" is a different fact from "nothing
/// is plugged in", and the interface says which.
/// Reads a device's radios, joining the settings to the measurements.
///
/// `radio_table` holds what the radio is set to and `radio_table_stats` what it
/// observed; the controller keys both on the radio's own name. Both arrive
/// inside the device object already being downloaded, so this costs nothing
/// beyond reading fields that were previously discarded.
///
/// Absent measurements are reported as -1 rather than 0: a radio that did not
/// report its utilisation is a different thing from one that measured an idle
/// channel, and only the second is worth acting on.
fn radios_of(device: &Value) -> Vec<UnifiRadio> {
    let stats: Vec<&Value> = device
        .get("radio_table_stats")
        .and_then(Value::as_array)
        .map(|a| a.iter().collect())
        .unwrap_or_default();

    device
        .get("radio_table")
        .and_then(Value::as_array)
        .map(|radios| {
            radios
                .iter()
                .map(|r| {
                    let name = as_str(r, "name");
                    let stat = stats.iter().find(|s| as_str(s, "name") == name);
                    let measured = |key: &str| {
                        stat.and_then(|s| s.get(key))
                            .and_then(Value::as_i64)
                            .unwrap_or(-1)
                    };

                    UnifiRadio {
                        band: as_str(r, "radio"),
                        // The configured channel can be the literal "auto".
                        channel: r
                            .get("channel")
                            .map(|c| c.as_str().map(String::from).unwrap_or_else(|| c.to_string()))
                            .unwrap_or_default(),
                        width: as_u64(r, "ht"),
                        tx_power_mode: as_str(r, "tx_power_mode"),
                        tx_power: as_i64(r, "tx_power"),
                        utilisation: measured("cu_total"),
                        self_utilisation: measured("cu_self_tx").max(measured("cu_self_rx")),
                        clients: stat.map(|s| as_u64(s, "num_sta")).unwrap_or(0),
                        satisfaction: measured("satisfaction"),
                        name,
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn ports_of(device: &Value) -> Vec<UnifiPort> {
    let neighbours: Vec<&Value> = device
        .get("lldp_table")
        .and_then(Value::as_array)
        .map(|a| a.iter().collect())
        .unwrap_or_default();

    device
        .get("port_table")
        .and_then(Value::as_array)
        .map(|ports| {
            ports
                .iter()
                .map(|p| {
                    let idx = as_u64(p, "port_idx");
                    let lldp = neighbours
                        .iter()
                        .find(|n| as_u64(n, "local_port_idx") == idx && idx != 0);
                    UnifiPort {
                        idx,
                        name: as_str(p, "name"),
                        up: as_bool(p, "up"),
                        enabled: as_bool(p, "enable"),
                        speed: as_u64(p, "speed"),
                        full_duplex: as_bool(p, "full_duplex"),
                        poe_enabled: as_bool(p, "poe_enable"),
                        poe_power: as_str(p, "poe_power"),
                        port_conf_id: as_str(p, "portconf_id"),
                        tagged_vlan_mgmt: as_str(p, "tagged_vlan_mgmt"),
                        neighbour_mac: lldp.map(|n| as_str(n, "chassis_id")).unwrap_or_default(),
                        neighbour_name: lldp
                            .map(|n| {
                                let sys = as_str(n, "system_name");
                                if sys.is_empty() {
                                    as_str(n, "chassis_descr")
                                } else {
                                    sys
                                }
                            })
                            .unwrap_or_default(),
                        neighbour_port: lldp.map(|n| as_str(n, "port_id")).unwrap_or_default(),
                        is_uplink: as_bool(p, "is_uplink"),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn as_bool(v: &Value, key: &str) -> bool {
    match v.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        _ => false,
    }
}

/// Whether the profile authenticates with an API key rather than a password.
///
/// UniFi API keys are issued to the controller, not to a person, so an empty
/// username is the signal.
fn uses_api_key(profile: &Profile) -> bool {
    profile.username.trim().is_empty()
}

pub async fn login(
    client: &reqwest::Client,
    profile: &Profile,
    secret: &str,
    log: &mut Vec<LogEntry>,
) -> Result<(), String> {
    if uses_api_key(profile) {
        log.push(LogEntry::ok(SOURCE, "API kulcsos hitelesítés, bejelentkezés nem kell"));
        return Ok(());
    }

    let base = profile.base_url.trim_end_matches('/');
    let res = client
        .post(format!("{base}/api/auth/login"))
        .json(&json!({ "username": profile.username, "password": secret }))
        .send()
        .await
        .map_err(|e| format!("bejelentkezés: {e}"))?;

    let status = res.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            400 | 401 => "a felhasználónév vagy a jelszó nem megfelelő".to_string(),
            429 => "túl sok próbálkozás, a vezérlő ideiglenesen tiltja a bejelentkezést".to_string(),
            other => format!("bejelentkezés sikertelen ({other})"),
        });
    }

    log.push(LogEntry::ok(SOURCE, "POST /api/auth/login → munkamenet létrejött"));
    Ok(())
}

async fn get(
    client: &reqwest::Client,
    profile: &Profile,
    secret: &str,
    path: &str,
) -> Result<Vec<Value>, String> {
    let base = profile.base_url.trim_end_matches('/');
    let mut req = client.get(format!("{base}{path}"));
    if uses_api_key(profile) {
        req = req.header("X-API-KEY", secret).header("Accept", "application/json");
    }

    let res = req.send().await.map_err(|e| format!("{path}: {e}"))?;
    let status = res.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => format!("{path}: a munkamenet lejárt vagy a kulcs érvénytelen (401)"),
            403 => format!("{path}: nincs jogosultság (403)"),
            404 => format!("{path}: nincs ilyen végpont — ellenőrizd a site nevét"),
            other => format!("{path}: a vezérlő {other} kóddal válaszolt"),
        });
    }

    let body: Value = res.json().await.map_err(|e| format!("{path}: {e}"))?;
    // Classic endpoints wrap in `data`; the integration API returns a bare array.
    Ok(body
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| body.as_array().cloned())
        .unwrap_or_default())
}

/// Firewall rules as the zone-based releases keep them.
///
/// UniFi Network moved the firewall from numbered rulesets to policies between
/// named zones, and the change is invisible from the outside: the old
/// `rest/firewallrule` endpoint still answers, still returns 200, and returns
/// an empty list. Read on its own that says "this network has no firewall
/// rules", which is a false statement about somebody's estate.
///
/// The zone names are fetched first so a policy can be described by what it
/// joins rather than by two identifiers. Both calls are tried, both outcomes go
/// in the log, and a controller old enough not to have these endpoints simply
/// records that they were not there — the legacy rules it did return still
/// stand.
async fn collect_zone_policies(
    client: &reqwest::Client,
    profile: &Profile,
    secret: &str,
    site: &str,
    snap: &mut UnifiSnapshot,
    log: &mut Vec<LogEntry>,
) {
    let v2 = format!("/proxy/network/v2/api/site/{site}");

    /*
     * Every name we can put to an identifier.
     *
     * A policy refers to its two ends by id, and those ids are a mixture: some
     * name a firewall zone, some name a network. Seeded from the networks
     * already collected, so even a controller that will not list its zones
     * produces a readable table rather than a wall of hex — which is what the
     * first version of this did, and it was no more use than nothing.
     */
    let mut zones: std::collections::HashMap<String, String> = snap
        .networks
        .iter()
        .map(|n| (n.id.clone(), n.name.clone()))
        .collect();
    let from_networks = zones.len();

    // The endpoint under each name it has carried; the first that answers wins.
    let mut named = 0usize;
    for path in [
        format!("{v2}/firewall/zones"),
        format!("{v2}/firewall/zone"),
        format!("{v2}/firewall-zones"),
    ] {
        match get(client, profile, secret, &path).await {
            Ok(items) if !items.is_empty() => {
                for z in &items {
                    let id = as_str(z, "_id");
                    let name = as_str(z, "name");
                    if !id.is_empty() && !name.is_empty() {
                        zones.insert(id, name);
                        named += 1;
                    }
                }
                log.push(LogEntry::ok(SOURCE, format!("GET {path} → {named} zóna")));
                break;
            }
            Ok(_) => log.push(LogEntry::ok(SOURCE, format!("GET {path} → üres"))),
            Err(e) => log.push(LogEntry::fail(SOURCE, e)),
        }
    }

    if named == 0 {
        log.push(LogEntry::ok(
            SOURCE,
            format!("a zónaneveket a hálózatok adják ({from_networks} név)"),
        ));
    }

    // The endpoint under both names it has carried, so a controller in between
    // is not missed. The first that answers wins.
    let mut policies: Vec<Value> = Vec::new();
    let mut answered: Option<String> = None;
    for path in [
        format!("{v2}/firewall-policies"),
        format!("{v2}/firewall/policies"),
    ] {
        match get(client, profile, secret, &path).await {
            Ok(items) if !items.is_empty() => {
                policies = items;
                answered = Some(path);
                break;
            }
            Ok(_) => log.push(LogEntry::ok(SOURCE, format!("GET {path} → üres"))),
            Err(e) => log.push(LogEntry::fail(SOURCE, e)),
        }
    }

    let Some(path) = answered else { return };

    // The policy's endpoints are objects rather than plain ids, and their shape
    // has moved about between releases: the zone can be on the object or beside
    // it. Both are looked for, and a zone that cannot be named keeps its id,
    // which is still more use than an empty cell.
    let endpoint = |p: &Value, side: &str| -> String {
        let node = p.get(side);

        // The identifier, wherever this release keeps it.
        let id = ["zone_id", "zoneId", "network_id", "networkId"]
            .iter()
            .find_map(|key| node.and_then(|n| n.get(*key)).and_then(Value::as_str))
            .map(String::from)
            .or_else(|| {
                [format!("{side}_zone_id"), format!("{side}_networkconf_id")]
                    .iter()
                    .find_map(|key| p.get(key).and_then(Value::as_str))
                    .map(String::from)
            })
            .unwrap_or_default();

        if let Some(name) = zones.get(&id) {
            return name.clone();
        }

        // No name for it. What the policy says it is matching — "ANY",
        // "INTERNET", an address — is more use than an identifier, and where
        // even that is absent the identifier is all there is.
        let target = node
            .and_then(|n| n.get("matching_target"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !target.is_empty() && target != "OBJECT" {
            return target.to_string();
        }
        if id.is_empty() {
            return "—".to_string();
        }
        id
    };

    for (i, p) in policies.iter().enumerate() {
        snap.firewall_rules.push(UnifiRule {
            id: as_str(p, "_id"),
            name: as_str(p, "name"),
            action: as_str(p, "action"),
            // Zone policies have no numbered ruleset; the pair of zones is the
            // equivalent, and is what someone reading the map wants anyway.
            ruleset: format!("{} → {}", endpoint(p, "source"), endpoint(p, "destination")),
            index: p
                .get("index")
                .and_then(Value::as_i64)
                .unwrap_or_else(|| i as i64),
            enabled: p.get("enabled").map_or(true, |v| v.as_bool().unwrap_or(true)),
            protocol: as_str(p, "protocol"),
            dst_port: p
                .get("destination")
                .and_then(|d| d.get("port"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            src: endpoint(p, "source"),
            dst: endpoint(p, "destination"),
            logging: as_bool(p, "logging"),
        });
    }

    log.push(LogEntry::ok(
        SOURCE,
        format!("GET {path} → {} zóna-szabály", policies.len()),
    ));
}

pub async fn collect(
    client: &reqwest::Client,
    profile: &Profile,
    secret: &str,
    log: &mut Vec<LogEntry>,
) -> Result<UnifiSnapshot, String> {
    let site = if profile.site.trim().is_empty() {
        "default"
    } else {
        profile.site.trim()
    };
    let api = format!("/proxy/network/api/s/{site}");

    let mut snap = UnifiSnapshot {
        site: site.to_string(),
        ..Default::default()
    };

    // Devices prove both auth and the site name in one call.
    let devices = get(client, profile, secret, &format!("{api}/stat/device")).await?;
    for d in &devices {
        snap.devices.push(UnifiDevice {
            mac: as_str(d, "mac"),
            name: as_str(d, "name"),
            model: as_str(d, "model"),
            kind: as_str(d, "type"),
            state: as_i64(d, "state"),
            ip: as_str(d, "ip"),
            version: as_str(d, "version"),
            uptime_secs: as_u64(d, "uptime"),
            clients: as_u64(d, "num_sta"),
            uplink_mac: d
                .get("uplink")
                .and_then(|u| u.get("uplink_mac"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            uplink_remote_port: d
                .get("uplink")
                .map(|u| as_u64(u, "uplink_remote_port"))
                .unwrap_or(0),
            uplink_local_port: d.get("uplink").map(|u| as_u64(u, "port_idx")).unwrap_or(0),
            ports: ports_of(d),
            radios: radios_of(d),
        });
    }
    let offline = snap.devices.iter().filter(|d| d.state == 0).count();
    log.push(LogEntry::ok(
        SOURCE,
        format!(
            "GET stat/device → {} eszköz ({offline} offline)",
            snap.devices.len()
        ),
    ));

    match get(client, profile, secret, &format!("{api}/rest/networkconf")).await {
        Ok(items) => {
            for n in &items {
                snap.networks.push(UnifiNetwork {
                    id: as_str(n, "_id"),
                    name: as_str(n, "name"),
                    vlan: as_u64_opt(n, "vlan"),
                    subnet: as_str(n, "ip_subnet"),
                    purpose: as_str(n, "purpose"),
                    enabled: n.get("enabled").map_or(true, |v| v.as_bool().unwrap_or(true)),
                    dhcp_enabled: as_bool(n, "dhcpd_enabled"),
                });
            }
            let vlans = snap.networks.iter().filter(|n| n.vlan.is_some()).count();
            log.push(LogEntry::ok(
                SOURCE,
                format!(
                    "GET rest/networkconf → {} hálózat, {vlans} VLAN",
                    snap.networks.len()
                ),
            ));
        }
        Err(e) => log.push(LogEntry::fail(SOURCE, e)),
    }

    match get(client, profile, secret, &format!("{api}/rest/portconf")).await {
        Ok(items) => {
            for p in &items {
                snap.port_profiles.push(UnifiPortProfile {
                    id: as_str(p, "_id"),
                    name: as_str(p, "name"),
                    forward: as_str(p, "forward"),
                    native_network_id: as_str(p, "native_networkconf_id"),
                    tagged_vlans: p
                        .get("tagged_vlan_mgmt")
                        .and_then(Value::as_array)
                        .map(|a| a.iter().filter_map(Value::as_u64).collect())
                        .unwrap_or_default(),
                    poe_mode: as_str(p, "poe_mode"),
                    builtin: as_bool(p, "attr_no_delete") || as_bool(p, "attr_hidden"),
                });
            }
            log.push(LogEntry::ok(
                SOURCE,
                format!(
                    "GET rest/portconf → {} port profil",
                    snap.port_profiles.len()
                ),
            ));
        }
        Err(e) => log.push(LogEntry::fail(SOURCE, e)),
    }

    match get(client, profile, secret, &format!("{api}/rest/wlanconf")).await {
        Ok(items) => {
            for w in &items {
                snap.wlans.push(UnifiWlan {
                    id: as_str(w, "_id"),
                    name: as_str(w, "name"),
                    enabled: w.get("enabled").map_or(true, |v| v.as_bool().unwrap_or(true)),
                    security: as_str(w, "security"),
                    network_id: as_str(w, "networkconf_id"),
                    is_guest: as_bool(w, "is_guest"),
                    ppsk_count: w
                        .get("private_preshared_keys")
                        .and_then(Value::as_array)
                        .map_or(0, Vec::len),
                });
            }
            log.push(LogEntry::ok(
                SOURCE,
                format!("GET rest/wlanconf → {} SSID", snap.wlans.len()),
            ));
        }
        Err(e) => log.push(LogEntry::fail(SOURCE, e)),
    }

    match get(client, profile, secret, &format!("{api}/rest/firewallrule")).await {
        Ok(items) => {
            for r in &items {
                snap.firewall_rules.push(UnifiRule {
                    id: as_str(r, "_id"),
                    name: as_str(r, "name"),
                    action: as_str(r, "action"),
                    ruleset: as_str(r, "ruleset"),
                    index: as_i64(r, "rule_index"),
                    enabled: r.get("enabled").map_or(true, |v| v.as_bool().unwrap_or(true)),
                    protocol: as_str(r, "protocol"),
                    dst_port: as_str(r, "dst_port"),
                    src: as_str(r, "src_networkconf_id"),
                    dst: as_str(r, "dst_networkconf_id"),
                    logging: as_bool(r, "logging"),
                });
            }
            log.push(LogEntry::ok(
                SOURCE,
                format!("GET rest/firewallrule → {} szabály", snap.firewall_rules.len()),
            ));
        }
        Err(e) => log.push(LogEntry::fail(
            SOURCE,
            format!("{e} — a zóna-alapú szabályok külön végponton élnek az újabb kiadásokban"),
        )),
    }

    // Newer releases moved the firewall to zones and answer the old endpoint
    // with an empty list rather than an error, which reads as "no rules" when
    // it means "not here any more".
    if snap.firewall_rules.is_empty() {
        collect_zone_policies(client, profile, secret, site, &mut snap, log).await;
    }

    match get(client, profile, secret, &format!("{api}/stat/sta")).await {
        Ok(items) => {
            for c in &items {
                snap.clients.push(UnifiClient {
                    mac: as_str(c, "mac"),
                    hostname: as_str(c, "hostname"),
                    ip: as_str(c, "ip"),
                    network: as_str(c, "network"),
                    vlan: as_u64_opt(c, "vlan"),
                    wired: as_bool(c, "is_wired"),
                    ap_mac: as_str(c, "ap_mac"),
                    oui: as_str(c, "oui"),
                    switch_mac: as_str(c, "sw_mac"),
                    switch_port: as_u64(c, "sw_port"),
                });
            }
            let unknown = snap.clients.iter().filter(|c| c.oui.is_empty()).count();
            log.push(LogEntry::ok(
                SOURCE,
                format!(
                    "GET stat/sta → {} kliens ({unknown} nem azonosított)",
                    snap.clients.len()
                ),
            ));
        }
        Err(e) => log.push(LogEntry::fail(SOURCE, e)),
    }

    Ok(snap)
}
