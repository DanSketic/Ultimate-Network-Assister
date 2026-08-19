# Changelog

Every notable change to Ultimate Network Assister, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

The releases below 1.0.0 were reconstructed from the development history when the
project was first published. They describe what the application could actually do
at each stage rather than what was planned for it.

---

## [1.7.0] — 2026-08-19

### Added

- **The plan can now run the commands it prepares.** A step in the deployment
  planner has always carried exact command text, and the only thing to do with
  it was copy it. Where an SSH profile with an accepted host key exists, each
  command can be sent to that machine from the plan itself, under the same
  native policy the SSH console works under: the clearance badge comes from the
  policy rather than from the interface, a mutating command runs only once the
  operator has approved that exact text, and one approval authorises one run.

  Three gates come before the policy is even asked, and they matter more than
  the feature. A command with a blank left in it — `qm clone <template>`,
  `K3S_TOKEN=<token>`, a stanza of an interfaces file — is a shape rather than a
  command, and the application does not know what belongs in the blank; guessing
  is not one of its jobs. On a step marked "local console", reading is offered
  and changing is not, because the change is the kind that cuts the very session
  it would travel over. Destructive work stays where it was: prepared, shown,
  and run by a person at a console.

  `scripts/checks/plan-ssh.mjs` walks every step of every preset and measures
  which commands survive those gates, reading the forbidden and read-only lists
  out of `sshpolicy.rs` so the two sides cannot drift apart.

- **A preset for a single Proxmox host, on a network that already exists.** The
  other presets start from the network and put the hypervisor inside it. This
  one starts from the machine: firmware, disks, pools, sizing, a template,
  guests, backups, boot order, handover. VLANs, SSIDs, zones and rules are
  absent rather than switched off — a plan that lists VLANs you are not going to
  build is a plan you stop reading — so it produces no networks at all and the
  apply pipeline has nothing to write.

  Two things sit at its edge for the cases it does not assume: a trunk-bridge
  chapter for a host that is fed VLANs after all, and four guests worth having.
  Both start switched off, so the plan opens as the bare machine. That required
  the one model change: `defaultOff` on a module, for the chapters where "on
  unless you say otherwise" reads backwards.

- **The backup job is planned as commands rather than as advice.** Read what the
  cluster already has, create the job, then prove it produced a file. The
  creation is a `pvesh create /cluster/backup` the application can run over SSH
  on approval, which makes it the first place where the planner does the work it
  describes instead of describing work for someone else.

- **Where to add a backup job, said on the screen that reports there is none.**
  The Backup view stated the absence and stopped, which leaves the obvious next
  question unanswered by an application that knows the answer. It now names the
  place — Datacenter → Backup → Add — and, when the survey found one, a store
  that accepts backups and how much room it has.

### Changed

- **IoT and guests are only cut up per floor where the floors are cut off from
  each other.** Under the open-floor layout a sensor or guest subnet per floor
  separates nothing that is not already open; it only multiplies VLANs, keys and
  rules. Both now follow the layout by default and split only under full
  isolation, and either can be forced in either direction from the Addressing
  parameters. Full isolation produces exactly what it produced before.

- **"Assisted" now describes something the application does.** The mode said
  approval and execution stay with you, and the cap on a command-only step said
  running it needs your approval — while nothing existed to approve. With the
  plan able to run a command, the wording is true rather than aspirational.

### Fixed

- **A VPN range the gateway's own VPN server serves was reported as a clash.** A
  One-Click VPN network is created by the VPN server, carries no VLAN id and
  holds a range of its own, so a blueprint asking for a VPN network matched
  nothing by VLAN, tried to create one, and collided with the very thing it
  wanted. That is now a verdict of its own — provided elsewhere — which writes
  nothing, blocks nothing, and names the network that provides it. Two ordinary
  networks on one range still clash, and so does a non-VPN network aimed at a
  VPN range.

- **Two spellings of one subnet counted as two subnets.** The controller stores
  a network by its gateway, `192.168.40.1/24`, while other things that create
  networks write the network address. The clash check compared the strings, so
  the second spelling slipped past it — not merely a missed warning but a second
  network created on top of an existing range. Subnets are now compared as
  masked network addresses.

- **"No backup job at all" was said where the survey had been refused the
  list.** A read-only token can legitimately be denied `/cluster/backup`; the
  collector left the list empty either way, and the view read that as a finding
  about the cluster. Absence of a job and inability to look are now separate
  facts, in the view and in the exported report, the way pending updates already
  were. A snapshot written before the flag existed counts as "not read", since
  nobody asked it.

- **A Hungarian column header stood in the English interface.** The household
  editor's client-VLAN column was never translated.

---

## [1.6.0] — 2026-08-14

### Added

- **Zone isolation is now measured rather than assumed.** The policy matrix had
  every off-diagonal cell unverified, and correctly so: reading a controller's
  configuration establishes what someone intended, never what the gateway
  enforces. A survey of a UniFi profile with SSH access now also reads
  `iptables-save` from the gateway and parses the loaded ruleset. Each ordered
  zone pair has its own chain whose final rule carries no match and is therefore
  the default for that pair, so "guest cannot reach the LAN" stops being a claim
  about configuration and becomes one about what is in force. Rules found in the
  loaded ruleset are marked measured, and the zone table reports isolation from
  the same source, so the three cannot disagree.

  What it refuses to conclude is the more important half. A chain whose last
  rule is conditional yields nothing, because a chain that can be fallen out of
  answers a question about a different chain. A network whose bridge the ruleset
  never mentioned stays unverified — such a network is not thereby open and not
  thereby closed. A configured rule absent from the ruleset stays unverified
  rather than being reported as missing: the gateway names a rule's id only on
  the log line beside it, logging is per-rule, and a rule with logging off leaves
  no trace to find. The matrix note says how many cells were decided, and says
  the reading is IPv4 — the IPv6 table is separate and is not included.

  The raw dump is kept in the snapshot verbatim rather than only its conclusions,
  so a later build can read more out of surveys already taken, and so what the
  interface claims can always be checked against what the gateway said.

- **IPv6 is read too, and compared against IPv4.** A rule that stops traffic
  over IPv4 while the same traffic passes over IPv6 is a separation the estate
  believes it has and does not, and it is invisible from either table alone —
  the controller will report the rule as configured, loaded and working. The
  survey now reads `ip6tables-save` as well and reports the disagreement as a
  finding, naming both networks.

  The comparison turns on a fact that had to be measured rather than assumed. An
  IPv6 table carrying no zone rules means one of two opposite things: the family
  is not filtered, or the family is not carried. The first makes an IPv4 block
  no block at all; the second makes the IPv4 verdict the whole truth. Nothing in
  a firewall dump separates them, so the survey also reads `ip -br addr` and
  looks for a routable IPv6 address on both ends. Link-local addresses do not
  count — `fe80::/10` never crosses between networks, and counting it would
  report a leak on every estate running no IPv6 at all. With no addresses read,
  no leak is claimed. With no IPv6 table read, the matrix shows IPv4 and the
  note says that is what it is showing.

### Fixed

- **SSH discarded the exit status of every command it ran.** The channel loop
  stopped listening at `Eof`, which the server sends when it has finished
  sending output — one message before it says how the command ended. The status
  was therefore usually absent, and only usually, because a server is free to
  send it first: a race rather than a consistent absence, which is why it
  presented as two commands failing and a third succeeding on a gateway that had
  run all three. Nothing depended on the status until the survey's live reads
  did, at which point a hundred kilobytes of ruleset was recorded as unreadable.
  The loop now reads to the close. No output was ever truncated by this — `Eof`
  means the data is complete — so only the status was lost.

  The live reads also no longer require a status to accept output. A status that
  was never reported is not a failure; a reported non-zero one still is.

- **A failed live read said "empty output" whatever had happened.** A command
  that printed nothing, one that timed out, and one that exited non-zero all
  reported the same phrase, and each needs something different done about it.
  The log now names which.

- **The live reads were skipped when SSH lived on its own profile.** One machine
  reached over two protocols is one profile in this model, but nothing stops a
  separate SSH entry for the same gateway, and that is a reasonable way to have
  set it up. The survey only looked for SSH on the UniFi profile itself, so an
  estate with the credentials filed separately got "nothing verified" while
  holding everything needed to verify it. A selected SSH profile marked as a
  UniFi host is now used as well. The profile's own access is preferred, since
  it is the one certain to be the same machine, and which profile was read is
  logged either way — attributing one gateway's ruleset to another site would be
  a wrong answer rather than a missing one.

- **"0 confirmed" did not say why it was zero.** Nothing read and nothing
  matched look identical in a count and call for opposite remedies: the first is
  a question of access, the second of what the gateway logs. The panel now says
  which it is.

- **A firewall table holding only its chain policies read as unread.** The
  parser returned early on a dump with no rule lines, which is wrong in the one
  place it matters most: an IPv6 table with nothing but `:FORWARD ACCEPT` is a
  real and readable answer — the zone system is absent and the family's default
  decides. Treating it as "could not be read" made exactly the gateways that
  forward IPv6 unfiltered look like the ones whose IPv6 could not be examined.
  Found by the check written alongside it.

- **The command area shows what was actually sent.** Commands go out with a
  `PATH` assignment that reaches the administrative binaries, which meant the
  interface displayed one string while the machine ran another. A
  "command not found" is not diagnosable under that arrangement — there is no
  way to tell a missing program from a wrong path, or a build carrying the
  prefix from one that predates it. The executed line is now shown whenever it
  differs from the typed one.

- **Four more read-only commands: IPv6 rules, address sets, neighbours, and an
  inventory.** `ip6tables-save`, because a rule set that stops traffic over IPv4
  and passes the same traffic over IPv6 is a common way to be wrong and reading
  one table cannot show it. `ipset list`, because a zone rule names the set it
  matches and never its members. `lldpcli show neighbors`, which is a fourth
  source for what is on a port and the only one that does not require the far
  end to be managed equipment — a stock Proxmox install is neither managed nor
  announcing itself, which is why its port has been an inference. And a plain
  directory listing for when none of the firewall tools are present, which
  answers "then what does this machine use" rather than repeating that they are
  missing.

### Changed

- **The firewall rules are grouped by source zone.** A hundred and fifty rows in
  one list is not a list anyone reads; grouped, it is one heading per zone,
  collapsed, each carrying its rule count, how many destinations it touches, how
  many of its rules block, and how many are confirmed in the loaded ruleset.
  Grouping by source rather than by zone pair because the two differ by an order
  of magnitude — that many rules span most of the ordered pairs but only as many
  sources as there are zones — and because "what may this network reach" is the
  question people arrive with. Finding one specific pair is what the filter is
  for, and a filter now opens the groups it matched: left collapsed, a search
  would answer with headings and hide the rows it was asked to find.

  The arrangement is not invented for the display. The gateway dispatches on
  exactly this, one chain per source, before it reaches the per-pair chains, so
  a group here is a chain there.

  The source column went with it — the heading is the source, and repeating it
  down every row of its own group spent one column of six saying nothing.

- **The survey's result panel sits above the button that starts a run.** Once a
  survey exists, its counts are what someone opens the view to read; the button
  is what they came for the first time only.

- **`iptables-save` is offered before `nft`, and is not a fallback.** A UniFi
  gateway was measured carrying `iptables-nft` and `xtables-nft-multi` with no
  `nft` installed at all: the kernel holds the ruleset in nftables and the only
  tool present to print it speaks iptables syntax. Same rules, different words
  for them. Both remain available everywhere, because which one a machine has
  is not knowable in advance — only by asking it.

- **`lldpcli show` is allowed; bare `lldpcli` is not.** `lldpctl` and `lldpcli`
  are one program under two names and share a command set, so an allowance for
  the neighbour table would have carried `configure` in behind `show`.

### Fixed

- **Zone policies were listed by identifier.** The rules came through, and read
  `6a3fd548f46cd67f56c41d14 → 6a423bf0f46cd67f56c4c475` — which is no more use
  than not having them. Names are now resolved from the networks already
  collected as well as from the zone endpoint, which is tried under each name
  the API has carried, so a controller that will not list its zones still
  produces a readable table. Where an end has no name, what the policy says it
  matches — `ANY`, `INTERNET`, an address — is shown in preference to a
  24-character identifier.

### Changed

- **The policy view is four panels rather than one column.** Tolerable at a
  dozen rules and unusable at a hundred and fifty: the security signals — the
  part worth reading first — sat below a table nobody reads top to bottom.
  Zones, matrix, rules and signals are now separate, the counts are on the tabs
  so nothing is hidden by being unselected, and only the chosen one scrolls.
  The rules table has a filter, because with that many the question is never
  "what are they all" but "what touches this zone".

---

## [1.5.1] — 2026-08-14

### Fixed

- **A password the server would have taken, refused.** Only the plain
  `password` method was offered. Many servers — UniFi OS devices among them —
  advertise `keyboard-interactive` instead, where the same secret is sent as
  the answer to a prompt. The command-line client tries both without mentioning
  it, which is why a session that worked from a terminal failed here with
  nothing to go on. Both are tried now.

- **The refusal now says what would have worked.** When authentication fails,
  the message carries the list of methods the server says it will accept.
  That turns a dead end into an instruction: a server offering only `publickey`
  is telling you it is set to `PermitRootLogin prohibit-password`, and no
  password will ever get in — a key has to go on the profile instead.

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
