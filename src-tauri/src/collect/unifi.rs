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
     * Which firewall endpoint this controller actually answered on.
     *
     * The zone-based endpoints have carried three names for zones and two for
     * policies across releases, and the collector tries each until one answers.
     * That is fine for reading, where a wrong guess returns nothing. It is not
     * fine for writing, where a wrong guess is a request nobody can predict the
     * effect of — so the path that answered is recorded, and anything that ever
     * writes here may use that path and no other. An empty string means this
     * controller never answered, and therefore that nothing may be written.
     */
    #[serde(default)]
    pub zone_endpoint: String,
    #[serde(default)]
    pub policy_endpoint: String,
    /// Firewall zones as the controller keeps them, with their membership.
    #[serde(default)]
    pub zones: Vec<UnifiZone>,
    /*
     * One zone object and one policy object, verbatim.
     *
     * Kept for the same reason the raw ruleset is: a later build can read more
     * out of it than this one knows how to. But here there is a second, sharper
     * use. Writing an object whose full shape is not known is guesswork, and a
     * guessed firewall policy is the one guess that can lock somebody out of
     * their own gateway — a controller may accept a request missing fields and
     * fill them with defaults nobody chose. Cloning an object this controller
     * already holds and changing only the fields we own removes the guess: the
     * shape comes from the release that is going to receive it.
     *
     * Empty where the controller answered with no objects at all, which is
     * exactly the case where nothing may be written either.
     */
    #[serde(default)]
    pub zone_template: String,
    #[serde(default)]
    pub policy_template: String,
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
    /*
     * The estate's way out, as the gateway and the controller report it.
     *
     * Everything else here is inside the estate; this is the one link that
     * leaves it, and it was the one thing never collected. Two sources are read
     * and joined: the gateway's own WAN interface, which knows the address, the
     * mode and the port, and the controller's health summary, which knows the
     * ISP and whatever a speedtest last measured. Either can be present without
     * the other.
     */
    #[serde(default)]
    pub wans: Vec<UnifiWan>,
}

/// One WAN link.
///
/// Measurements the controller did not report come back as -1, not 0, on the
/// same reasoning as `UnifiRadio`: a link nobody has speed-tested is a
/// different thing from one measured at zero, and only the second is worth
/// saying anything about.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UnifiWan {
    /// The gateway this WAN belongs to. Empty where only the health summary
    /// saw it, which happens on releases that keep the detail to themselves.
    pub device_mac: String,
    /// "WAN" or "WAN2", as the controller labels the link.
    pub name: String,
    /// The interface carrying it: "eth8", "ppp0".
    pub ifname: String,
    /// How the address is obtained: "dhcp", "static", "pppoe".
    pub kind: String,
    pub ip: String,
    pub gateway_ip: String,
    pub nameservers: Vec<String>,
    pub up: bool,
    /// Negotiated speed in Mbit/s; 0 where the controller did not say.
    pub speed: u64,
    pub uptime_secs: u64,
    /// The ISP as the controller resolved it. Empty where it did not.
    pub isp: String,
    /// Round-trip time in ms; -1 where nothing measured it.
    pub latency_ms: i64,
    /// The last speedtest, in Mbit/s; -1 where none has ever run.
    pub xput_down: f64,
    pub xput_up: f64,
    /// Unix seconds of that speedtest; -1 where there has never been one.
    pub speedtest_at: i64,
    /// The physical port carrying the link, where the device names one.
    pub port_idx: u64,
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

/// A firewall zone and the networks in it.
///
/// Read so that a rule can be described — and eventually written — in terms of
/// the zones this controller actually has, rather than of names a blueprint
/// hoped for.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifiZone {
    pub id: String,
    pub name: String,
    /// Controller ids of the networks the zone contains.
    pub network_ids: Vec<String>,
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

/// A measurement, where -1 means the controller reported none.
fn as_measure(v: &Value, key: &str) -> f64 {
    v.get(key).and_then(Value::as_f64).unwrap_or(-1.0)
}

/// A list of strings, however this release spells the key's contents.
fn as_strings(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

/*
 * The WAN links one gateway reports about itself.
 *
 * A gateway keeps them under `wan1` and `wan2`, and older firmware puts the
 * only one it has in `uplink` instead — the same object shape a switch uses for
 * the port it hangs off, which is why it is read last and only when the named
 * ones said nothing. Anything with neither an interface nor an address is not a
 * WAN this gateway has; a second WAN that was never wired is left out rather
 * than reported as a link that is down.
 */
fn wans_of(device: &Value) -> Vec<UnifiWan> {
    let mac = as_str(device, "mac");
    let ports = device
        .get("port_table")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let one = |label: &str, w: &Value| -> Option<UnifiWan> {
        let ifname = as_str(w, "ifname");
        let ip = as_str(w, "ip");
        if ifname.is_empty() && ip.is_empty() {
            return None;
        }

        // Nameservers are an array on some releases and numbered keys on
        // others; both are read, and duplicates are of no consequence here.
        let mut nameservers = as_strings(w, "nameservers");
        if nameservers.is_empty() {
            nameservers = as_strings(w, "dns");
        }
        for key in ["nameserver1", "nameserver2"] {
            let value = as_str(w, key);
            if !value.is_empty() && !nameservers.contains(&value) {
                nameservers.push(value);
            }
        }

        let gateway_ip = {
            let named = as_str(w, "gateway");
            if named.is_empty() {
                as_strings(w, "gateways").into_iter().next().unwrap_or_default()
            } else {
                named
            }
        };

        // Which socket it comes in on. The device says so directly on newer
        // firmware; otherwise the port table is matched on the interface name,
        // which is the same join the port view already relies on.
        let port_idx = match as_u64(w, "port_idx") {
            0 => ports
                .iter()
                .find(|p| !ifname.is_empty() && as_str(p, "ifname") == ifname)
                .map(|p| as_u64(p, "port_idx"))
                .unwrap_or(0),
            idx => idx,
        };

        Some(UnifiWan {
            device_mac: mac.clone(),
            name: label.to_uppercase(),
            ifname,
            kind: as_str(w, "type"),
            ip,
            gateway_ip,
            nameservers,
            // A WAN with an address and no explicit state is up: the gateway
            // does not hand out an address for a link it is not carrying.
            up: match w.get("up") {
                Some(Value::Bool(b)) => *b,
                Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
                _ => !as_str(w, "ip").is_empty(),
            },
            speed: as_u64(w, "speed"),
            uptime_secs: as_u64(w, "uptime"),
            isp: String::new(),
            latency_ms: as_measure(w, "latency") as i64,
            xput_down: as_measure(w, "xput_down"),
            xput_up: as_measure(w, "xput_up"),
            speedtest_at: as_measure(w, "speedtest_lastrun") as i64,
            port_idx,
        })
    };

    let named: Vec<UnifiWan> = ["wan1", "wan2"]
        .iter()
        .filter_map(|key| device.get(*key).and_then(|w| one(key, w)))
        .collect();

    if !named.is_empty() {
        return named;
    }

    device
        .get("uplink")
        .filter(|u| as_str(u, "type") == "wan")
        .and_then(|u| one("wan1", u))
        .into_iter()
        .collect()
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
                        // The membership has carried both spellings; either is
                        // the same fact and both are read.
                        let network_ids = ["network_ids", "networkIds"]
                            .iter()
                            .find_map(|key| z.get(*key).and_then(Value::as_array))
                            .map(|list| {
                                list.iter()
                                    .filter_map(Value::as_str)
                                    .map(String::from)
                                    .collect::<Vec<String>>()
                            })
                            .unwrap_or_default();
                        snap.zones.push(UnifiZone {
                            id: id.clone(),
                            name: name.clone(),
                            network_ids,
                        });
                        zones.insert(id, name);
                        named += 1;
                    }
                }
                // One object kept whole, as the shape a write would have to
                // match. The first is as good as any: they are all this
                // release's schema.
                if let Some(first) = items.first() {
                    snap.zone_template = first.to_string();
                }
                snap.zone_endpoint = path.clone();
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
                if let Some(first) = items.first() {
                    snap.policy_template = first.to_string();
                }
                policies = items;
                snap.policy_endpoint = path.clone();
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

/*
 * What the controller knows about the way out that the gateway does not.
 *
 * `stat/health` carries the WAN subsystem: the ISP the address resolves to, the
 * latency the controller measures, and whatever a speedtest last recorded. None
 * of it can be read off the gateway's own interface, and the ISP name is the
 * one line that tells somebody looking at the map which of their two links they
 * are looking at.
 *
 * It is also the fallback. Some releases answer `stat/device` without a `wan1`
 * object at all, and on those this is the only place the way out shows up — so
 * a summary that names an address nothing else claimed becomes a link in its
 * own right, with no gateway attributed to it rather than a guessed one.
 */
async fn collect_wan_health(
    client: &reqwest::Client,
    profile: &Profile,
    secret: &str,
    api: &str,
    snap: &mut UnifiSnapshot,
    log: &mut Vec<LogEntry>,
) {
    let path = format!("{api}/stat/health");
    let items = match get(client, profile, secret, &path).await {
        Ok(items) => items,
        Err(e) => {
            log.push(LogEntry::fail(SOURCE, e));
            return;
        }
    };

    let Some(wan) = items
        .iter()
        .find(|s| as_str(s, "subsystem") == "wan")
    else {
        log.push(LogEntry::ok(
            SOURCE,
            "GET stat/health → nincs WAN alrendszer a válaszban".to_string(),
        ));
        return;
    };

    let ip = as_str(wan, "wan_ip");
    let isp = {
        let name = as_str(wan, "isp_name");
        if name.is_empty() {
            as_str(wan, "isp_organization")
        } else {
            name
        }
    };
    let latency = as_measure(wan, "latency") as i64;
    let xput_down = as_measure(wan, "xput_down");
    let xput_up = as_measure(wan, "xput_up");
    let speedtest_at = as_measure(wan, "speedtest_lastrun") as i64;
    let uptime = as_u64(wan, "uptime");

    // The address decides which link this describes; with nothing to match on,
    // a single WAN is unambiguous and several are not, so several are left
    // alone rather than all told the same story.
    let target = snap
        .wans
        .iter()
        .position(|w| !ip.is_empty() && w.ip == ip)
        .or(if snap.wans.len() == 1 { Some(0) } else { None });

    match target {
        Some(i) => {
            let w = &mut snap.wans[i];
            if w.isp.is_empty() {
                w.isp = isp.clone();
            }
            if w.latency_ms < 0 {
                w.latency_ms = latency;
            }
            if w.xput_down < 0.0 {
                w.xput_down = xput_down;
            }
            if w.xput_up < 0.0 {
                w.xput_up = xput_up;
            }
            if w.speedtest_at <= 0 {
                w.speedtest_at = speedtest_at;
            }
            if w.uptime_secs == 0 {
                w.uptime_secs = uptime;
            }
        }
        None if !ip.is_empty() => snap.wans.push(UnifiWan {
            name: "WAN".to_string(),
            ip: ip.clone(),
            gateway_ip: as_strings(wan, "gateways").into_iter().next().unwrap_or_default(),
            nameservers: as_strings(wan, "nameservers"),
            // The controller's own verdict on the subsystem, which is the only
            // statement about the link this endpoint makes.
            up: as_str(wan, "status") == "ok",
            uptime_secs: uptime,
            isp: isp.clone(),
            latency_ms: latency,
            xput_down,
            xput_up,
            speedtest_at,
            ..Default::default()
        }),
        None => {}
    }

    log.push(LogEntry::ok(
        SOURCE,
        format!(
            "GET stat/health → WAN {} {}",
            if ip.is_empty() { "cím nélkül".to_string() } else { ip },
            if isp.is_empty() {
                "(szolgáltató ismeretlen)".to_string()
            } else {
                format!("({isp})")
            }
        ),
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
        snap.wans.extend(wans_of(d));
    }
    let offline = snap.devices.iter().filter(|d| d.state == 0).count();
    log.push(LogEntry::ok(
        SOURCE,
        format!(
            "GET stat/device → {} eszköz ({offline} offline)",
            snap.devices.len()
        ),
    ));
    if !snap.wans.is_empty() {
        let down = snap.wans.iter().filter(|w| !w.up).count();
        log.push(LogEntry::ok(
            SOURCE,
            format!("stat/device → {} WAN kapcsolat ({down} nem él)", snap.wans.len()),
        ));
    }

    collect_wan_health(client, profile, secret, &api, &mut snap, log).await;

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

/// What a gateway says about its way out, across the shapes it says it in.
///
/// The WAN is the one link where the releases disagree most: two named objects
/// on current firmware, a single `uplink` on older, an array of nameservers
/// here and numbered keys there. Parsing it wrong is not visible in the
/// interface — a missing address reads as "no WAN", which is a false statement
/// about somebody's estate — so each shape is pinned here.
#[cfg(test)]
mod tests {
    use super::*;

    fn device(body: &str) -> Value {
        serde_json::from_str(body).unwrap()
    }

    #[test]
    fn both_wans_of_a_dual_wan_gateway_are_read() {
        let d = device(
            r#"{
                "mac": "gw", "type": "udm",
                "wan1": { "ifname": "eth8", "ip": "81.2.3.4", "netmask": "255.255.255.0",
                          "gateway": "81.2.3.1", "type": "dhcp", "up": true, "speed": 1000,
                          "uptime": 86400, "nameservers": ["1.1.1.1", "9.9.9.9"] },
                "wan2": { "ifname": "eth9", "ip": "10.64.0.7", "type": "dhcp", "up": false }
            }"#,
        );
        let wans = wans_of(&d);
        assert_eq!(wans.len(), 2);
        assert_eq!(wans[0].name, "WAN1");
        assert_eq!(wans[0].ip, "81.2.3.4");
        assert_eq!(wans[0].gateway_ip, "81.2.3.1");
        assert_eq!(wans[0].nameservers, vec!["1.1.1.1", "9.9.9.9"]);
        assert_eq!(wans[0].device_mac, "gw");
        assert!(wans[0].up);
        assert!(!wans[1].up);
    }

    #[test]
    fn a_wan_that_was_never_wired_is_not_reported_as_a_dead_link() {
        let d = device(
            r#"{ "mac": "gw", "type": "udm",
                 "wan1": { "ifname": "eth8", "ip": "81.2.3.4" },
                 "wan2": { "up": false } }"#,
        );
        let wans = wans_of(&d);
        assert_eq!(wans.len(), 1, "{wans:?}");
    }

    #[test]
    fn an_address_with_no_state_reads_as_up() {
        let d = device(r#"{ "mac": "gw", "wan1": { "ifname": "eth8", "ip": "81.2.3.4" } }"#);
        assert!(wans_of(&d)[0].up);
    }

    #[test]
    fn older_firmware_keeps_the_only_wan_in_the_uplink_object() {
        let d = device(
            r#"{ "mac": "gw", "type": "ugw",
                 "uplink": { "type": "wan", "ifname": "eth0", "ip": "81.2.3.4",
                             "up": true, "speed": 1000,
                             "gateways": ["81.2.3.1"], "nameservers": ["1.1.1.1"] } }"#,
        );
        let wans = wans_of(&d);
        assert_eq!(wans.len(), 1);
        assert_eq!(wans[0].ip, "81.2.3.4");
        assert_eq!(wans[0].gateway_ip, "81.2.3.1");
    }

    #[test]
    fn a_switchs_uplink_is_not_mistaken_for_a_wan() {
        let d = device(
            r#"{ "mac": "sw", "type": "usw",
                 "uplink": { "type": "wire", "ifname": "eth0", "ip": "10.0.1.2", "up": true } }"#,
        );
        assert!(wans_of(&d).is_empty());
    }

    #[test]
    fn numbered_nameserver_keys_are_read_too() {
        let d = device(
            r#"{ "mac": "gw", "wan1": { "ifname": "eth8", "ip": "81.2.3.4",
                 "nameserver1": "1.1.1.1", "nameserver2": "8.8.8.8" } }"#,
        );
        assert_eq!(wans_of(&d)[0].nameservers, vec!["1.1.1.1", "8.8.8.8"]);
    }

    #[test]
    fn the_socket_is_found_through_the_port_table_when_the_wan_does_not_name_it() {
        let d = device(
            r#"{ "mac": "gw",
                 "wan1": { "ifname": "eth8", "ip": "81.2.3.4" },
                 "port_table": [ { "port_idx": 1, "ifname": "eth0" },
                                 { "port_idx": 9, "ifname": "eth8" } ] }"#,
        );
        assert_eq!(wans_of(&d)[0].port_idx, 9);
    }

    #[test]
    fn what_nobody_measured_comes_back_as_minus_one() {
        let d = device(r#"{ "mac": "gw", "wan1": { "ifname": "eth8", "ip": "81.2.3.4" } }"#);
        let w = &wans_of(&d)[0];
        assert_eq!(w.latency_ms, -1);
        assert_eq!(w.xput_down, -1.0);
        assert_eq!(w.speedtest_at, -1);
    }
}
