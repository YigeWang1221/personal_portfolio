# FoodShelter — staged assets

**Staged:** 2026-09-24 (ADR-011, ADR-015). Diagram sources (`.mmd`) are rendered to `.svg` with `npm run diagrams`; both are committed.

| File | Label | What it shows | Used on | Caveats |
|---|---|---|---|---|
| `assets/donation-flow.mmd` → `.svg` | CURRENT | One donation from submission to delivery, with the queues and the status strings the code sets | "One donation, end to end" | Traced from the event handlers at the pinned commit (redesign, 2026-09-25) |
| `assets/domain-model.mmd` → `.svg` | CURRENT | Partial class diagram of the objects on the donation path | "Who owns what: the object model" | Redrawn from the code; the teammate-authored UML PDFs are not used |

FoodShelter is no longer a home-page card (ADR-017); the partial class diagram is the page's lead figure.
