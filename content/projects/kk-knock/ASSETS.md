# KK Knock — staged assets

**Staged:** 2026-09-24 (ADR-011). The owner allowed reusing the public product page's content.

**Source:** the public KK Knock introduction page and its public repository. The files are byte-identical to the images
the live product page serves. Every screen shows invented showcase data; there are no real users, accounts or hosts.

| File | Label | What it shows | Used on | Caveats |
|---|---|---|---|---|
| `assets/screens/{en,zh}/recording.jpg` | — (current UI, showcase data) | Recording with the live transcript line | Project page → "The product" | Localized: the Chinese page uses `zh/` |
| `assets/screens/{en,zh}/home_todo.jpg` | — | Todo list with due times taken from speech | Same | Same |
| `assets/screens/{en,zh}/thought_read.jpg` | — | A researched thought: summary and advantages | Same | Same |
| `assets/screens/{en,zh}/thought_sources.jpg` | — | End of a thought: recommendation, next steps, sources | Same | Same |
| `assets/capture/{idle,recording,processing}.png` | — | The KK Capture widget's three states | Same | Language-neutral |
| `assets/widgets/{en,zh}/todo.png` | — | The todo home-screen widget | Same | Localized |
| `assets/architecture.mmd` → `.svg` | CURRENT | Phone and self-hosted backend, data ownership, LLM providers | "Architecture"; "How I plan & design" thumbnail | The Cloudflare Tunnel is not drawn: configured, public acceptance pending |
| `assets/capture-states.mmd` → `.svg` | CURRENT | Capture job states on the phone | "When a capture fails" | From the committed capture state machine; the uncommitted ADR-057 work is not drawn |
| `assets/capture-flow.mmd` → `.svg` | CURRENT | Capture sequence with idempotent replay | "When a capture fails" | The server cache holds the returned response, not the transcript; the in-flight duplicate gap is stated in the text |

The home-page card and the page's lead figure show the product screens (recording → todo → researched note), with short step labels. The widget states stay in "The product" section, where they explain the interaction (ADR-017).

Screenshots are not labeled CURRENT / PROPOSED / HISTORICAL because they show the shipped UI with demo data, not
architecture. Code links are never added: the code repositories are private.
