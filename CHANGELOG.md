# Changelog

Every notable change to Ultimate Network Assister, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

The releases below 1.0.0 were reconstructed from the development history when the
project was first published. They describe what the application could actually do
at each stage rather than what was planned for it.

---

## [1.5.0] — 2026-08-14

### Fixed

- **Firewall rules on a zone-based controller.** UniFi Network moved the
  firewall from numbered rulesets to policies between named zones, and the
  change is invisible from outside: the old `rest/firewallrule` endpoint still
  answers, still returns 200, and returns an empty list. Read on its own that
  says "this network has no firewall rules" — a false statement about somebody's
  estate, and the reason the policy view showed *0 rules* on a controller with a
  perfectly good firewall.

  The zone endpoints are now read when the legacy one comes back empty, under
  both names the API has carried, with the zone names fetched first so a policy
  is described by what it joins rather than by two identifiers. Every attempt
  goes in the survey log, so which endpoint answered is a matter of record
  rather than of assumption.

- **`dd` was matched as three letters rather than as a command**, so anything
  containing the word "add" was refused as destructive — `nft add rule`, and
  worse, a read-only `grep add …`. It is matched as a word now, which still
  catches it as an argument (`xargs dd`) without catching every "add".

- **An entry in the read-only allowlist carrying a capital could never match**,
  because the command is lowercased before comparison. `smartctl -H` — the disk
  health check — had been sitting in that list unable to match the command it
  was put there for, so every use of it was quietly treated as one that
  modifies and demanded confirmation. A test now keeps the list lowercase.

### Added

- **Reading the live firewall over SSH** is permitted as a read-only operation:
  `nft list`, `iptables-save`, `iptables -S`, `conntrack -L` and their kin. This
  is the one thing that turns a rule read from configuration into a rule known
  to be *in force*, which is the distinction the whole interface is built
  around. Only the reading forms are allowed — `nft` on its own can flush a
  ruleset and cut the machine off, so `nft flush` stays a command requiring
  confirmation.

---

## [1.4.0] — 2026-08-14

### Added

- **Cards can be dragged, and put back.** The automatic layout optimises a
  number; a person looking at their own network knows things the number does
  not — which switch is in the cellar, which two machines belong together, what
  the room actually looks like. So a card can be moved by hand and stays where
  it was put, and a control appears to return everything to the automatic
  arrangement. Only what was moved is remembered, so a device found by a later
  survey still lands somewhere sensible rather than at the origin.

  Movement is divided by the zoom, so a drag at 40% moves the card as far as
  the hand went rather than two and a half times further, and a move is only
  committed once the pointer has actually travelled — selecting a device by
  clicking it must not nudge it sideways.

### Fixed

- **A cable running along a tier now orders the devices it joins.** Since the
  hypervisor gained a measured cable to the switch it is plugged into, that
  cable could run the whole width of a row with everything else arching over
  it. The ordering could not see it at all: it orders each tier against the
  tiers above and below, and both ends of this cable are in the same row.

  It is counted now, and weighted for what it costs — a cable spanning three
  positions passes over three cards and everything they are wired to, which is
  worth about as much as a crossing each.

  That alone was not enough. Swapping neighbours could never reach the better
  arrangement, because every single swap left the total exactly where it was:
  the pair moved one position closer while another moved one further, so a
  search accepting only strict improvements sat on that plateau while the
  arrangement two moves away was plainly better. Lifting one end out and
  setting it down beside the other crosses the plateau in one step, and every
  placement is scored on the whole objective so a tidy row cannot be bought
  with a tangle above it.

  On a representative estate this puts the hypervisor beside its switch and
  takes crossings between separate devices to none.

---

## [1.3.0] — 2026-08-14

### Added

- **The port a machine is plugged into, even when it does not announce itself.**
  Until now a port could be named from two measured sources: what the far end
  said over LLDP, and what a UniFi device reported about its own uplink. A
  Proxmox host is neither — it is not in the controller's device list, and a
  stock install does not run `lldpd` — so the switch showed a port up at a
  speed with nobody's name on it, and the line from the hypervisor into the
  network was drawn as a guess.

  The controller knew all along. Every wired client it reports carries the
  switch and the port it was learned on, and the collector had been reading
  eight fields from that endpoint while discarding those two. They are read
  now, and used as a third measured source — the only one that reaches
  equipment the controller does not manage.

  Where a wired client's address matches a surveyed Proxmox node, the port
  takes the estate's own name for that node rather than its DHCP hostname, and
  the cable becomes a measured line to a named switch on a numbered port
  instead of an inferred one to the gateway. Where the controller has not
  learned it, the old behaviour stands and the line stays marked as inferred —
  the map now shows the difference between knowing and assuming.

  LLDP still outranks it: what the far end announced about itself is better
  evidence than what a switch learned from traffic.

---

## [1.2.0] — 2026-08-14

### Added

- **Wi-Fi findings that come from a measurement.** The application advised on
  channels and congestion in its sample data while its collector never read a
  single radio field — so on a real network that whole class of finding was
  silent. `radio_table` and `radio_table_stats` arrive inside the device object
  already being downloaded, and are now read: channel, width, transmit power,
  clients per radio, and channel utilisation.

  Utilisation is the number worth having. It is the share of airtime the radio
  observed as busy, *other people's networks included* — the one thing about
  Wi-Fi that does not show up in your own equipment's statistics and the thing
  actually slowing it down. Two rules use it: a radio working in a channel busy
  above two-thirds of the time, and access points configured onto the same
  channel in the same band. The second says plainly that the application cannot
  know whether they overlap on air, because that needs a measurement on site.

  A radio that reported no utilisation is recorded as -1 rather than 0: saying
  nothing and measuring an idle channel are different, and only the second is
  worth acting on.

- **Certificates and pending updates.** `/nodes/{node}/certificates/info` gives
  the expiry dates, which is the classic failure nobody notices until the
  morning the interface stops loading. Pending package updates are read where
  the token is permitted; where it is not, that is recorded rather than passed
  off as "nothing pending" — being unable to look and having nothing to find
  are different facts and only one of them is reassuring.

- **A survey is a file.** It can be written out and read back, which is what
  makes it portable: survey a site, take it home, compare it there, or send it
  to whoever asked. An imported file is validated natively before anything is
  stored — it is the one snapshot that did not come from this application's own
  collectors — and re-serialised into this build's shape, so what lands in the
  history is exactly as if the survey had been run here. A snapshot holds
  measurements only; no credential ever enters one.

- **The survey as a report.** A self-contained HTML document of what was found:
  findings, capacity, backup evidence, devices, rules, and the log of what was
  read. It opens anywhere with no reader and no network, prints from the
  browser, and can be read in a year by someone who has never heard of this
  application. Where the survey could not establish something the report says
  so — a document that quietly omits its gaps reads as though there were none.

### Changed

- Lists added to a snapshot after the fact are read defensively on the
  TypeScript side. Rust fills its own defaults, but an imported file can come
  from any build, and that is now a supported path rather than a theoretical one.

---

## [1.1.0] — 2026-08-14

### Added

- **What changed since the last survey.** The application had always kept a
  history of surveys and never once read it — only the newest was ever loaded.
  The Survey view now compares the current survey against an earlier one and
  lists what moved: a device that stopped answering, a port that quietly
  dropped from a gigabit to a tenth of it, a different device at the far end of
  a cable, a guest that lost its backup coverage, a firewall rule switched off,
  a store past ninety per cent, a disk whose SMART verdict turned. Each line
  carries the measurement rather than describing it — `1000 → 100 Mb/s` says
  more than any sentence about a port having slowed down.

  This is the question a person cannot answer by looking and a machine can, and
  it obeys the same rule as everything else here: a difference is only reported
  where *both* surveys measured the thing. A source present in one survey and
  absent from the other is named as not compared, because calling its contents
  "new" would be a claim about the estate that nothing measured supports.

- `list_snapshots` and `snapshot_by_id` on the native side. Listing returns
  headers only, so the picker stays cheap however long the history grows, and
  an earlier survey is loaded only once one is actually chosen.

---

## [1.0.0] — 2026-08-14

First public release, under the MIT licence.

### Added

- **Session restore.** The application reopens where it was left: the same view,
  the selected device, the zoom and pan of the topology, the recommendation or
  article that was open, and whether the surveyed or the sample estate was on
  screen. Stored separately from preferences, because a session is a bookmark
  rather than a decision, and it is discarded after 30 days — coming back after a
  month to a half-finished view of an estate that has since changed is worse than
  starting clean.
- **Capacity diagnosis on the overview.** A Proxmox store that reports no size is
  now listed as *not measured* instead of vanishing, and the panel explains why
  the figures are missing. The usual cause is named: Proxmox filters
  `/nodes/{node}/storage` per store by the caller's rights, so an API token
  without `Datastore.Audit` on `/storage` is answered with an empty list rather
  than an error, and only the capacity figures go missing while everything else
  in the survey succeeds.
- **The check suite ships with the project** (`npm test`). Nine measurements
  covering topology crossings, tier ordering, fit-to-content, routing cost,
  advice rules, capacity states, preset languages, dictionary completeness, and
  controls that are wired to nothing.

### Changed

- **Cables no longer cross, and no longer touch.** Three things were wrong at
  once. A cable spanning more than one tier took no part in the ordering, so
  nothing held a lane open for it and it crossed everything between its two ends;
  such cables now get a placeholder in each tier they pass through, and the
  placeholder keeps its place through layout. Routing decided detours by
  obstacle avoidance alone, so two cables could dodge the same card into each
  other; routes are now settled in order of how little freedom each has, and
  every later route counts a crossing — and a near miss — against a bow that
  would run over an earlier one. Finally the detour was chosen from the middle of
  a card while the curve is drawn from a fanned-out point, which was enough to
  put a line back across its neighbour; routing now runs a second pass against
  the endpoints the edge is actually drawn from. On a representative estate this
  took crossings from four to none and the tightest gap between two cables from
  0.1 px to 19.2 px.
- **Advice is derived from the survey.** The recommendations were a fixed list
  shown whatever had been measured, while the view claimed they were ranked by
  the survey. Eight rules now read the snapshot: guests with no backup file,
  backups nothing verifies, stores past 80 and 90 per cent, unreachable devices,
  weak Wi-Fi encryption, disks reporting a SMART warning, a host bridge that
  cannot tag on a network that does, and ports that negotiated below a gigabit
  with a known device at the far end. Plans state honestly what is done and what
  is not: the survey step is complete because it ran, a restore point is only
  claimed when a recent backup was found, and execution is never reported as done
  because the application does not perform it.
- **Parameter values follow the interface language.** Presets are written per
  language rather than translated, so a plan created in Hungarian kept Hungarian
  wording in its form fields after switching to English. A value matching a
  default in any language was never typed by anyone, so it now moves with the
  interface — while anything typed in is left exactly as typed. The same rule
  applies to household names and the plan's own title.
- **The desktop icon reads at desktop size.** The container always held every
  size up to 256 px; the problem was contrast. The plate's gradient darkened to a
  blue that left the lower half of the mark barely 4:1 against it, and at 32 px
  every edge is two pixels of blend. The gradient now ends on the application's
  own accent, which holds the mark above 7:1 everywhere it is drawn, and the mark
  is drawn larger with heavier arms.
- **Detours are proportionate.** The routing would throw a cable most of its own
  length sideways to dodge a near miss, drawing a loop that was harder to follow
  than what it avoided and that reached far below the estate, dragging the map's
  framing with it. A detour now costs by its size relative to the run: on the
  sample estate the worst stray fell from 94% of a cable's own length to 44%,
  and the drawing no longer extends past the cards at all — which took the
  fitted zoom from 58% to 63% for the same window.
- Routing results are cached, so hovering a device restyles the lines without
  re-solving their geometry: 557 ms at worst before, 1.08 ms after.
- `?view=&lang=&theme=&fit=1` in the address bar opens a named view in a named
  language without touching stored settings. It is what captures the
  documentation screenshots, and it makes a view linkable.

### Fixed

- **The application no longer opens dark on a light desktop.** The window
  configuration pinned the webview to a dark theme, so `prefers-color-scheme:
  light` never matched and *auto* could only ever resolve to dark. The window now
  follows the operating system, the query is asked for both themes explicitly
  rather than treating "not light" as dark, and a stored explicit choice is
  applied before the first paint so the window no longer flashes the wrong way
  round on start.
- A Proxmox storage entry without a `content` field — as written by builds before
  that field existed — no longer breaks the backup summary.

---

## [0.9.0] — Advice from measurements

### Added

- Advice view backed by an inference pass over the survey, with each finding
  carrying its evidence and a change plan ending in how to undo it.
- Change plans can be copied to the clipboard or exported as a Markdown
  checklist, both produced by one writer so the pasted and the saved version
  cannot disagree. Each carries where its content came from, so a checklist that
  outlives the window is not mistaken for a statement about a real estate.

---

## [0.8.0] — A topology you can read

### Added

- Port chips on both ends of a cable, coloured by negotiated link speed, with a
  leader line back to the exact point on the card.
- Fit-to-content that frames the whole estate, solved from measured on-screen
  positions rather than from a layout that a scroll container is free to shift.

### Changed

- Tier ordering by barycentre and median sweeps, keeping whichever arrangement
  measures fewer crossings, finished by swapping neighbouring pairs.
- Cables bow around the cards between their ends instead of running through them,
  since a line disappearing into a box reads as ending there.
- Device cards enlarged and the port strip laid out the way the hardware is:
  one row where the switch has one, two rows where it has two, with unreported
  ports left as gaps rather than closed up.

---

## [0.7.0] — Port-level detail

### Added

- Per-port collection from UniFi: state, negotiated speed, PoE, port profile and
  tagged-VLAN handling, joined to the LLDP neighbour table by port index.
- A device's own uplink report as a second measured source for the same fact,
  which is often the only one — plenty of hardware never announces itself.
- Port profiles read from the controller, so a dry run can offer to leave a
  profile alone rather than only to create one.
- Original device glyphs for gateways, switches, access points, hosts, guests,
  storage, cameras and clients. Deliberately not vendor logos.

---

## [0.6.0] — Backup and recovery, as evidence

### Added

- Proxmox backup jobs and the files they actually left behind, collected
  separately and compared: a scheduled job is not evidence that it runs.
- Verdicts limited to what the data supports — verified, partial, stale, missing.
  A restore test is reported as unprovable because Proxmox does not record one,
  rather than shown as a number that would look like proof.

---

## [0.5.0] — SSH bound to a system

### Added

- SSH sessions attached to the saved Proxmox or UniFi system rather than kept as
  a separate kind of profile: one machine is one entry, reachable both ways.
- Host-key pinning on first use, with the probe aborting the handshake before
  authentication so a key can be inspected without offering a credential.
- A command policy enforced natively: read-only commands run freely, mutating
  ones require the user to confirm that exact command text, and destructive
  storage and availability commands are never run by the application at all. The
  badge the user reads and the rule that runs are the same answer.

---

## [0.4.0] — Deployment planner

### Added

- Blueprints resolved into a plan and rendered as a guide, with modules,
  parameters and per-port assignments.
- An apply pipeline that compiles, dry-runs against a token, checks its gates,
  journals what it did and can roll it back.
- A write allowlist with exactly two endpoints. The application writes port
  *profiles* and networks, never per-port overrides — a wrong override cuts the
  controller's own uplink, with no way back from inside the application.

---

## [0.3.0] — Real surveys

### Added

- Read-only collectors for Proxmox VE and UniFi Network: nodes, storages, guests,
  interfaces, disks, devices, networks, WLANs, firewall rules and clients.
- Certificate pinning on first use, with credentials held in the Windows
  Credential Manager and never written to the snapshot database.
- A provenance model applied throughout: measured, inferred, unverified, and
  unverifiable. A firewall rule read from configuration is not evidence that the
  rule takes effect, and the interface says so.

---

## [0.2.0] — Two languages

### Added

- Full English alongside Hungarian, with the dictionary typed so a missing key
  is a compile error rather than a blank on screen.
- Presets written per language rather than machine-translated, so the wording in
  a generated plan reads as though a person wrote it.

---

## [0.1.0] — First working shell

### Added

- Desktop application on Tauri with an undecorated window and an app-drawn title
  bar.
- Topology, policy, overview, survey, planner and knowledge views against a
  sample estate.
- Light and dark themes, and an accent that follows the theme.

[1.0.0]: https://github.com/DanSketic/Ultimate-Network-Assister/releases/tag/v1.0.0
