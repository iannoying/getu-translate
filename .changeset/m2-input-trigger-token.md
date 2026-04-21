---
"@getu/extension": minor
---

feat(input): trigger-token mode + Options UI for input-field translation (M2 PR B)

Adds immersive-translate-style trigger-token support (e.g. `hello //en `) alongside the existing triple-space trigger. Users can switch modes from **Options → Input Translation → Trigger Mode** and customize the token prefix. IME composition (Chinese / Japanese / Korean) is respected so typing through an IME never misfires the token match. Config schema bumped to v069 with a non-destructive migration that backfills `triple-space` + `//` defaults.
