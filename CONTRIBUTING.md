# Contributing

Thank you for looking. This document is short because most of what matters here
is one idea applied consistently.

## The rule the code follows

> Say what was measured. Say what was inferred. Say what could not be
> established. Never present the third as the first.

A change that makes the application state something it did not measure is a bug,
however good it looks. Some examples of the rule in force:

- A firewall rule read from a controller is marked *unverified*, because reading
  a rule is not evidence that it takes effect.
- Backup coverage is judged from the files that exist, not from the jobs that are
  scheduled.
- A port with no LLDP neighbour draws no port number rather than a guessed one. A
  wrong port number on a topology map is worse than none, because someone will
  unplug that cable.
- The advice engine never reports a step as done unless it was done. The survey
  step is complete because the survey ran; execution is never complete, because
  the application does not execute anything.

If you find yourself writing a fallback that fills in a plausible value, stop and
report the absence instead.

## What a change carries

**A measurement.** The checks in `scripts/checks/` measure the things that were
hard to get right — crossings, fit, routing cost, dictionary completeness,
controls wired to nothing. A change that touches any of those should move the
numbers in the right direction, and say by how much.

```bash
npm test          # the measurements, one line each
npm run typecheck # strict, with unused locals as errors
cd src-tauri && cargo test
```

**Both languages.** `src/i18n/hu.ts` is the reference and its type defines the
English dictionary, so a missing key is a compile error. Presets under
`src/blueprint/presets/` are *written* per language rather than translated: the
wording in a generated plan should read as though a person wrote it in that
language. `npm test` includes a check that no English string is silently the
Hungarian one.

**A comment where the reason is not obvious.** Not what the code does — that is
readable — but why it is that way, especially where the obvious approach was
tried and failed. There are several places in the layout code where the obvious
approach is recorded alongside the reason it was abandoned; that is deliberate,
and it is what stops the next person reintroducing it.

## Safety boundaries that are not up for negotiation

These are enforced in Rust and should stay that way:

- **The write allowlist** in `src-tauri/src/apply.rs` has exactly two endpoints.
  Widening it needs a much better reason than convenience, and per-port overrides
  are specifically excluded: a wrong override cuts the controller's own uplink
  with no recovery from inside the application.
- **The SSH command policy** in `src-tauri/src/sshpolicy.rs` classifies every
  command before it runs, splits on shell separators, and takes the strictest
  verdict of the parts. There is exactly one place in the Rust tree that can
  execute anything, and it calls `authorise` first. Destructive storage and
  availability commands are never run by the application, and no user
  confirmation unlocks them.
- **Credentials** live in the operating system's credential store. Nothing that
  is written to the snapshot database may contain a secret.

## Schema changes

Snapshots and blueprints are stored as JSON and read back by later builds. Every
field added to a persisted type needs `#[serde(default)]`, and every field
removed needs `#[serde(default, skip_serializing)]` plus a migration. This is not
theoretical: a field added without a default once made every stored profile
unreadable, and took the user's saved connections with it.

## Style

- TypeScript is strict, with `verbatimModuleSyntax` and `noUnusedLocals`.
- Prefer the shape of the surrounding code over a personal preference.
- British spelling in prose and comments; the interface strings live in the
  dictionaries.
