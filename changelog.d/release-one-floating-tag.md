### Changed

- **A release moves one floating tag, `v0`, and no longer adds a `v0.N` tag.** QuantEcon's standalone actions each move one floating major tag, and no workflow pins a `v0.N`: every consumer uses `@v0`, as the README recommends. v0.31.0 is the first release without one. The `v0.N` tags made up to v0.30.2 stay where they are, so a workflow pinned to one keeps working. The release checklist in `AGENTS.md` moves `v0` alone.
