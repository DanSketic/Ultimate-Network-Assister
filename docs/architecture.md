# Architecture

How a measurement becomes a picture, and where the boundaries sit.

## Shape

```
┌─────────────────────────── desktop shell (Rust / Tauri) ───────────────────────┐
│                                                                                │
│  collect/         apply.rs        sshpolicy.rs   ssh.rs      secrets   db      │
│  read-only GETs   write allowlist classifier     transport   OS store  SQLite  │
│      │                 ▲               ▲            ▲                          │
└──────┼─────────────────┼───────────────┼────────────┼──────────────────────────┘
       │ snapshot        │ operations    │ verdict    │ command
┌──────▼─────────────────┴───────────────┴────────────┴──────────────────────────┐
│                          interface (React / TypeScript)                        │
│                                                                                │
│  survey/mapping.ts   →  Estate  →  views                                       │
│  survey/advice.ts    →  Recommendation[]                                       │
│  blueprint/          →  Blueprint → ResolvedBlueprint → Plan → guide           │
│  lib/flows.ts        →  drawn cables, port chips                               │
└────────────────────────────────────────────────────────────────────────────────┘
```

Everything that touches a network, a credential or a disk is on the Rust side.
The interface receives measurements and renders them; it cannot reach a system
except through a named command.

## From API to picture

**`src-tauri/src/collect/`** issues the reads. Every call is a `GET`, and each
one appends a line to the survey log, including its failures — a node that could
not be read must not silently disappear from the estate. The result is a
`SurveySnapshot`: raw measurement, normalised but uninterpreted.

**`src/survey/mapping.ts`** turns a snapshot into an `Estate`. This is where
interpretation happens, and where the provenance rule is applied: measured,
inferred, unverified, unverifiable. Tier ordering happens here too — nodes are
placed in tiers, ordered by barycentre and median sweeps, with placeholders
holding lanes open for cables that skip a tier.

**`src/lib/flows.ts`** turns nodes and links into drawn geometry: which way each
cable leaves its card, what detour it takes around the cards in between, and
where its port chips sit. Routing is settled in order of how little freedom each
cable has, and the result is cached — it depends on the estate's shape, not on
which device the pointer is over.

**`src/survey/advice.ts`** turns the same snapshot into change plans. Every rule
is triggered by something measured, and its wording repeats only what was
measured.

## The apply pipeline

```
compile → dry run (token) → gates → apply → journal → rollback
```

Only the deployment planner writes anything, and only through
`src-tauri/src/apply.rs::endpoint_for`, which maps an operation kind to a URL.
That function is the allowlist: two entries, UniFi networks and UniFi port
profiles. Anything not in it cannot be written, whatever the plan says.

Per-port overrides are excluded on purpose. The plan carries the exact per-port
values and shows them to you, but the application writes port *profiles* — a
wrong override cuts the controller's own uplink, and there is no recovery from
inside the application.

## SSH

`src-tauri/src/sshpolicy.rs` classifies a command into `ReadOnly`, `Mutating` or
`Forbidden` before anything runs. It splits on `;`, `|` and `&` and takes the
strictest verdict of the parts, so a safe prefix cannot smuggle a write.

- `ReadOnly` runs.
- `Mutating` runs only when the user has confirmed that exact command text.
  Editing the field clears the confirmation, so an approval cannot carry over to
  a command nobody read.
- `Forbidden` is never run by the application. It is not a permission the user
  can grant; destructive storage and availability commands are shown and
  explained, and that is all.

There is exactly one `.exec(` in the Rust tree, in `ssh.rs`, and `authorise` is
called immediately before it. The interface asks the same classifier for the
badge it displays, so what you read and what the machine enforces cannot drift.

The plan's own commands go through that same classifier. A step in the
deployment planner has always carried exact command text; where an SSH profile
with an accepted host key exists, it can now be sent to that machine instead of
being copied by hand. Three gates come first, before the policy is even asked:

- A command with a blank left in it — `qm clone <template>`, `K3S_TOKEN=<token>`
  — is a shape, not a command. The application does not know what belongs in the
  blank, and guessing is not one of its jobs.
- On a step marked "local console", reading is offered and changing is not: the
  change is one that can cut the very session it would travel over.
- Destructive actions are excluded here as they are everywhere else.

`scripts/checks/plan-ssh.mjs` walks every step of every preset and measures which
commands survive those gates, reading the native forbidden and read-only lists
out of `sshpolicy.rs` so the two sides cannot drift apart.

Host keys are pinned on first use. The probe that fetches a key aborts the
handshake before authentication, so a key can be inspected without a credential
ever being offered.

## Storage

| What | Where | Why |
| --- | --- | --- |
| Credentials | Windows Credential Manager | Never in the project's own files |
| Snapshots, blueprints, apply journal | SQLite beside the application | Measurements, no secrets |
| Theme and language | `localStorage` | A decision about the application |
| Last session | `localStorage`, separate key | A bookmark, discarded after 30 days |

Snapshots and blueprints are JSON read back by later builds, so every field added
to a persisted type carries `#[serde(default)]`. A field added without one once
made every stored profile unreadable.

## Internationalisation

`src/i18n/hu.ts` is the reference dictionary and its type defines the English
one, so a missing key fails the build rather than showing a blank.

Presets are a different matter: they are *written* per language rather than
translated, because a generated installation guide should read as though a person
wrote it. That has a consequence the interface handles explicitly — a plan
created in one language holds that language's wording in its form fields. A value
matching a default in any language was never typed by anyone, so it follows the
interface language; anything else is the user's and is left alone.
