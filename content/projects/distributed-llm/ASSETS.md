# Distributed LLM Training on HPC — staged assets

**Staged:** 2026-09-24 (ADR-011, ADR-015). Diagram sources (`.mmd`) are rendered to `.svg` with `npm run diagrams`; both are committed.

| File | Label | What it shows | Used on | Caveats |
|---|---|---|---|---|
| `assets/pipeline.mmd` → `.svg` | CURRENT | Tokenization, Slurm jobs, DDP and FSDP trainers, rank-0 measurement | Project page lead and automation section; plan-and-design thumbnail | Redrawn from the code; the team's original image contains a cluster username and is not used |

**Chart (2026-09-26, ADR-017).** `scaling-vs-quality` is not a file: it is declared in `meta.yaml` (`kind: chart`) and
drawn as inline SVG at build time. Throughput bars come from the HPC-05 ledger row (1× baseline; 3.83–3.97× on four
GPUs, printed as the `ddp_scaling` fact) and perplexity bars from HPC-15 (single-GPU baseline and the committed FSDP
logs). The caption states the model, hardware, the fixed token budget, single runs and the mixed log sources. The
pipeline diagram is now the lead visual and supports "Experiment automation on Slurm". The home card uses a compact contribution-oriented schematic; the result chart stays in the detailed results section (ADR-018).
