# Cloud-Native Web Application on AWS — staged assets

**Staged:** 2026-09-24 (ADR-011, ADR-015). Diagram sources (`.mmd`) are rendered to `.svg` with `npm run diagrams`; both are committed.

| File | Label | What it shows | Used on | Caveats |
|---|---|---|---|---|
| `assets/aws-architecture.mmd` → `.svg` | CURRENT | AWS architecture derived from the Terraform | "The system"; plan-and-design thumbnail | The environment is not known to be running; SNS topic and certificate were created by hand |
| `assets/cicd.mmd` → `.svg` | CURRENT | PR checks, AMI build, cross-account promotion, instance refresh | "Immutable releases across accounts" | From the workflow files |
