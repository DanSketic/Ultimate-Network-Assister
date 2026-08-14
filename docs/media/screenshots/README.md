# Screenshots

Captures of the running desktop application belong here. They are the one thing
in the documentation that cannot be generated from source, which is why they are
kept apart from `docs/media/`, where everything else is produced by
`npm run icons` and `npm run preview:media`.

Worth having, roughly in this order:

| File | What it should show |
| --- | --- |
| `topology.png` | The topology view on a surveyed estate, with port chips visible |
| `overview.png` | The overview, including a finding and the capacity panel |
| `advice.png` | A change plan, with its evidence and steps |
| `survey.png` | The connection profiles, with a pinned certificate |
| `planner.png` | A plan rendered as a guide |

Two things make them read well: use the light theme if the surrounding page is
light, and crop to the window rather than the whole desktop.

**Before committing one, look at what is in it.** A screenshot of a real estate
carries its addresses, host names and topology. Either capture the sample estate
— the application opens on it when no survey has been run — or blur what should
not be public.
