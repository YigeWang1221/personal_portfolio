## How I work {#work}

- **Contracts and milestones before code.** On the writing-style platform I froze the interfaces between the backend, the training worker and the serving layer before implementing any of them, so each could be built and tested alone. See [how that plan was built](/projects/personal-writing-lora/#planning).
- **Failure paths are part of acceptance.** On KK Knock, a capture pipeline only counts as done when every failure ends up visible and retryable — and when real use showed it did not, that became the next iteration. See [that iteration](/projects/kk-knock/#iteration).
- **Say what has not run.** Every project page separates what is designed, implemented, tested and deployed, and states the conditions of every number.

## How this site is written {#principles}

- **Evidence first.** Every number comes from a repository, a log or a design document, and it carries its conditions: the device, the dataset, the number of runs. Numbers without a baseline are reported as they are, not as percentages.
- **Honest status labels.** "Self-hosted pilot", "Implemented, not deployed", "Course project", "Research prototype" — each label says what has and has not run.
- **Team credit.** Team projects state the team size. "We" is for team results and "I" for my own roles; teammates are not named here.
- **CURRENT, PROPOSED, HISTORICAL.** Diagrams are drawn from the implementation and labeled as current, proposed or historical. A planned component is never drawn as deployed.
- **Privacy.** Screenshots use demo data, and any private value that has to appear is masked as `*****`.

## AI-assisted development {#ai}

I build with AI coding agents — mostly Codex and Claude Code — and treat them like fast collaborators that need clear direction: I write the specifications, the decision records and the milestone plans, and I review what they produce. Projects where most of the code was generated this way say so on their pages.

## How the site is built {#site}

The site is a static Astro build with no trackers and no requests to third-party servers. One small script of its own adds the mobile menu and the project filter; every page works without it. English and Chinese pages come from the same data, and the build fails if a page, a string or a number exists in one language but not the other. It is hosted on Cloudflare. Planning artifacts from several projects are collected on [How I plan & design](/plan-and-design/).
