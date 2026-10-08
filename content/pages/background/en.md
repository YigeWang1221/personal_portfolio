## How I work {#work}

- **Contracts and milestones before code.** On the writing-style platform I wrote down the interfaces between the backend, the training worker and the serving layer before implementing any of them, so each could be built and tested alone. See [how that plan was built](/projects/personal-writing-lora/#planning).
- **Real use decides what is finished.** On KK Knock, using the app every day showed that the background queue worked but nobody could see it, and that became the next iteration. See [that iteration](/projects/kk-knock/#iteration).
- **Numbers with their conditions.** A benchmark on one phone or one GPU node is reported as exactly that. See [the HPC experiments](/projects/distributed-llm/#results).

## From design to delivery {#ai}

I take personal projects from product definition and architecture through component integration, testing and deployment. I use API contracts, development guidelines and milestone plans to manage the work, then validate the system in its target environment. On team projects, each project page identifies my responsibilities and the work we shared.

## How the site is built {#site}

A static Astro site with no trackers and no requests to third-party servers. One small script of its own adds the mobile menu and the project filter; every page works without it. English and Chinese pages come from the same data, and the build fails if a page, a string or a number exists in one language only. It is hosted on Cloudflare. Planning artifacts from several projects are collected on [How I plan & design](/plan-and-design/).
