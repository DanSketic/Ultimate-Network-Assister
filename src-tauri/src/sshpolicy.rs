use serde::{Deserialize, Serialize};

/*
 * What the application is allowed to run over SSH.
 *
 * This is the SSH counterpart of the blueprint's automation policy, and it
 * keeps the same rule the whole estate is built on: configuration is
 * reversible, storage is not. A wrong firewall rule is an outage you fix in a
 * minute; a wrong device path in `mkfs` is gone.
 *
 * Three clearances:
 *
 *   ReadOnly   inspection only — runs on request, no extra ceremony.
 *   Mutating   changes something — runs only when the caller confirms this
 *              exact command text, so a catalogue entry cannot be swapped out
 *              underneath the confirmation.
 *   Forbidden  destroys data or availability — the application never runs it,
 *              whatever the caller asks. It is shown to be copied and run at a
 *              real console, where the operator can see what they are doing.
 *
 * The frontend classifies too, so the user sees the clearance before pressing
 * anything. This copy is the one that actually decides: it is on the far side
 * of the IPC boundary and cannot be talked out of a verdict.
 */

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Clearance {
    ReadOnly,
    Mutating,
    Forbidden,
}

/// Substrings that make a command destructive no matter what surrounds them.
///
/// Matched against the whole command line rather than the first word, because
/// the dangerous part is often an argument (`… | dd of=/dev/sda`).
const FORBIDDEN: &[&str] = [
    // Filesystems and partition tables.
    "mkfs", "mke2fs", "mkswap", "wipefs", "sgdisk", "gdisk", "fdisk", "parted", "partx",
    // `dd` is checked as a word rather than a substring, below: as a substring
    // it also matches "add ", which turned `nft add rule` — and, worse, a
    // read-only `grep add …` — into commands the application refused to run.
    "badblocks", "shred", "if=/dev/zero", "of=/dev/",
    // ZFS and LVM.
    "zpool create", "zpool destroy", "zpool labelclear", "zpool replace", "zpool remove",
    "zfs destroy", "zfs rollback", "zfs receive", "zfs recv",
    "pvcreate", "pvremove", "vgremove", "lvremove", "lvreduce",
    // Encryption containers.
    "cryptsetup luksformat", "cryptsetup erase", "cryptsetup luksrmkey",
    // Guests and datasets.
    "qm destroy", "pct destroy", "vzdump --remove", "pvesm remove",
    // Availability.
    "shutdown", "reboot", "poweroff", "halt", "init 0", "init 6",
    // Wholesale deletion.
    "rm -rf /", "rm -fr /", "rm -rf /*", ":(){", "mkfs.",
]
.as_slice();

/// Commands that only read. Matched on the first word, or on a known-safe
/// subcommand where the tool itself can also write.
const READ_ONLY: &[&str] = [
    // Inventory and health.
    "lsblk", "blkid", "lscpu", "lsmem", "lspci", "lsusb", "lsmod", "hostnamectl", "uname",
    "uptime", "free", "df", "du", "dmidecode", "sensors", "nproc", "id", "whoami", "date",
    // Network.
    "ip", "bridge", "ss", "ethtool", "arp", "resolvectl", "dig", "host", "nslookup",
    "ping", "traceroute", "tracepath", "mtr",
    // Text and files, read side.
    "cat", "head", "tail", "less", "grep", "egrep", "awk", "sed -n", "wc", "ls", "stat",
    "find", "readlink", "realpath", "file", "md5sum", "sha256sum", "diff",
    // Services and logs.
    "systemctl status", "systemctl list-units", "systemctl is-active",
    "systemctl is-enabled", "journalctl", "dmesg", "ps", "top -b", "pidof",
    // Proxmox, read side.
    "pveversion", "pvesubscription get", "pvesm status", "pvesm list", "pvecm status",
    "pvecm nodes", "qm list", "qm config", "qm status", "pct list", "pct config",
    "pct status", "pvesh get", "ha-manager status",
    // ZFS and SMART, read side.
    "zpool status", "zpool list", "zpool history", "zpool iostat", "zpool get",
    "zfs list", "zfs get", "zfs mount", "smartctl -h", "smartctl -a", "smartctl -i",
    "smartctl --scan", "nvme list", "nvme smart-log",
    // Packages, read side.
    "apt list", "apt-cache", "dpkg -l", "dpkg -s", "dpkg-query",
    // UniFi / EdgeOS style shells.
    "info", "show", "mca-cli-op info", "cat /proc",
    /*
     * The live firewall.
     *
     * This is the one thing that turns a rule read from configuration into a
     * rule known to be in force, which is the distinction the whole interface
     * is built around — so it is worth listing precisely.
     *
     * Only the reading forms are here. `nft` on its own can flush a ruleset
     * and cut the machine off, so the bare command stays a mutating one; it is
     * `nft list` that is safe, and the matcher is a prefix, so `nft flush`
     * does not slip through on the back of it. `iptables-save` only prints.
     */
    "nft list", "iptables-save", "ip6tables-save", "nft -a list",
    "iptables -l", "iptables -s", "iptables -n -l", "ip6tables -l", "ip6tables -s",
    "conntrack -l", "ipset list",
]
.as_slice();

/// Shell metacharacters that would let a benign-looking prefix carry a second
/// command. Their presence forces the stricter verdict of every segment.
const SPLITTERS: &[char] = &[';', '|', '&', '\n', '\r'];

fn strip_env_prefix(segment: &str) -> &str {
    // `LC_ALL=C zpool status` should classify as `zpool status`.
    let mut rest = segment.trim_start();
    loop {
        let Some(word) = rest.split_whitespace().next() else {
            return rest;
        };
        let is_assignment = word.contains('=')
            && word
                .split('=')
                .next()
                .is_some_and(|k| !k.is_empty() && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'));
        if !is_assignment {
            return rest;
        }
        rest = rest[word.len()..].trim_start();
    }
}

fn classify_segment(segment: &str) -> Clearance {
    let lower = segment.trim().to_ascii_lowercase();
    if lower.is_empty() {
        return Clearance::ReadOnly;
    }

    if FORBIDDEN.iter().any(|needle| lower.contains(needle)) {
        return Clearance::Forbidden;
    }

    // `dd` writes wherever it is pointed and is dangerous as a command, not as
    // a run of letters. Matched on whole words so it still catches it as an
    // argument — `xargs dd`, `time dd` — without catching every "add".
    if lower.split_whitespace().any(|word| word == "dd") {
        return Clearance::Forbidden;
    }

    // Redirection writes a file, whatever the command in front of it is.
    if lower.contains('>') {
        return Clearance::Mutating;
    }

    let stripped = strip_env_prefix(&lower);
    // `sudo`/`doas` do not change what the command does, only who does it.
    let stripped = stripped
        .strip_prefix("sudo ")
        .or_else(|| stripped.strip_prefix("doas "))
        .unwrap_or(stripped)
        .trim_start();

    if READ_ONLY.iter().any(|safe| {
        stripped == *safe
            || stripped.starts_with(&format!("{safe} "))
            || stripped.starts_with(&format!("{safe}\t"))
    }) {
        return Clearance::ReadOnly;
    }

    Clearance::Mutating
}

/// The verdict for a whole command line: the strictest of its segments.
pub fn classify(command: &str) -> Clearance {
    let mut verdict = Clearance::ReadOnly;
    for segment in command.split(SPLITTERS) {
        match classify_segment(segment) {
            Clearance::Forbidden => return Clearance::Forbidden,
            Clearance::Mutating => verdict = Clearance::Mutating,
            Clearance::ReadOnly => {}
        }
    }
    verdict
}

/// Gate in front of every execution. `confirmed` is the user having approved
/// this exact command text; it can raise Mutating to runnable but can never
/// touch Forbidden.
pub fn authorise(command: &str, confirmed: bool) -> Result<Clearance, String> {
    match classify(command) {
        Clearance::Forbidden => Err(
            "destruktív parancs: az alkalmazás nem futtatja. Másold ki, és futtasd konzolról, ahol látod, mit csinálsz."
                .to_string(),
        ),
        Clearance::Mutating if !confirmed => {
            Err("a parancs módosít: külön jóváhagyás nélkül nem fut".to_string())
        }
        verdict => Ok(verdict),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_are_read_only() {
        for cmd in [
            "zpool status tank",
            "LC_ALL=C smartctl -a /dev/sda",
            "sudo pvesm status",
            "ip -br link",
            "journalctl -u pve-cluster -n 50",
        ] {
            assert_eq!(classify(cmd), Clearance::ReadOnly, "{cmd}");
        }
    }

    /// The command is lowercased before it is matched, so an entry carrying a
    /// capital can never match anything. `smartctl -H` sat in this list unable
    /// to match the health check it was put there for, and every use of it was
    /// quietly treated as a command that modifies.
    #[test]
    fn the_allowlist_is_lowercase_or_it_matches_nothing() {
        for entry in READ_ONLY {
            assert_eq!(
                *entry,
                entry.to_ascii_lowercase(),
                "an allowlist entry with a capital can never match: {entry}"
            );
        }
    }

    /// Reading the live firewall is what turns a configured rule into a rule
    /// known to be in force, so it has to be allowed — and only in the forms
    /// that read. `nft` can flush a ruleset and cut the machine off.
    #[test]
    fn the_firewall_can_be_read_but_not_rewritten() {
        for cmd in [
            "nft list ruleset",
            "sudo nft list ruleset",
            "iptables-save",
            "LC_ALL=C iptables -S",
            "conntrack -L",
        ] {
            assert_eq!(classify(cmd), Clearance::ReadOnly, "{cmd}");
        }

        for cmd in [
            "nft flush ruleset",
            "nft add rule inet filter forward drop",
            "iptables -F",
            "nft list ruleset; nft flush ruleset",
        ] {
            assert_eq!(classify(cmd), Clearance::Mutating, "{cmd}");
        }
    }

    /// `dd` matched as a run of letters also matched "add", so `nft add rule`
    /// and even a read-only `grep add …` came back as destructive. It is a
    /// command, and is matched as one.
    #[test]
    fn dd_is_a_command_not_three_letters() {
        for cmd in ["dd if=/dev/sda of=/tmp/x", "time dd", "xargs dd"] {
            assert_eq!(classify(cmd), Clearance::Forbidden, "{cmd}");
        }
        for cmd in [
            "grep add /etc/network/interfaces",
            "ip addr show",
            "cat /etc/hosts",
        ] {
            assert_eq!(classify(cmd), Clearance::ReadOnly, "{cmd}");
        }
    }

    #[test]
    fn destructive_storage_is_forbidden_even_when_hidden() {
        for cmd in [
            "mkfs.xfs /dev/sdb",
            "zpool status; zpool destroy tank",
            "cat /etc/hosts | dd of=/dev/sda",
            "sudo reboot",
            "LC_ALL=C sgdisk --zap-all /dev/sdb",
        ] {
            assert_eq!(classify(cmd), Clearance::Forbidden, "{cmd}");
        }
    }

    #[test]
    fn writes_need_confirmation_and_forbidden_never_runs() {
        assert_eq!(classify("systemctl restart pveproxy"), Clearance::Mutating);
        assert_eq!(classify("echo test > /etc/motd"), Clearance::Mutating);
        assert!(authorise("systemctl restart pveproxy", false).is_err());
        assert!(authorise("systemctl restart pveproxy", true).is_ok());
        assert!(authorise("mkfs.ext4 /dev/sdb", true).is_err());
    }

    #[test]
    fn a_safe_prefix_cannot_smuggle_a_write() {
        assert_eq!(classify("ls /tmp && systemctl stop pve-firewall"), Clearance::Mutating);
    }
}
