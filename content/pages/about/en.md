## About me {#me}

I am a software engineer finishing a Master of Science in Software Engineering Systems at Northeastern University in Boston, graduating in December 2026. Before that I earned a Bachelor of Engineering in Computer Science and Technology at Zhejiang Gongshang University, and interned as a backend developer at Vendream and as a software tester at the Industrial and Commercial Bank of China's Software Development Center.

I like building systems end to end and then measuring them: a mobile app with its backend, cloud infrastructure with its release pipeline, a training job with its scaling curve. I am looking for roles in backend and full-stack engineering, AI infrastructure, cloud and platform engineering, and quantitative engineering, in the United States or in China.

## How this site is written {#principles}

- **Evidence first.** Every number comes from a repository, a log or a design document, and it carries its conditions: the device, the dataset, the number of runs. Numbers without a baseline are reported as they are, not as percentages.
- **Honest status labels.** "Self-hosted pilot", "Implemented, not deployed", "Course project", "Research prototype" — each label says what has and has not run.
- **Team credit.** Team projects state the team size. "We" is for team results and "I" for my own roles; teammates are not named here.
- **CURRENT, PROPOSED, HISTORICAL.** Diagrams are drawn from the implementation and labeled as current, proposed or historical. A planned component is never drawn as deployed.
- **Privacy.** Screenshots use demo data, and any private value that has to appear is masked as `*****`.

## AI-assisted development {#ai}

I build with AI coding agents — mostly Codex and Claude Code — and treat them like fast collaborators that need clear direction: I write the specifications, the decision records and the milestone plans, and I review what they produce. Projects where most of the code was generated this way say so on their pages.

## How the site is built {#site}

The site is a static Astro build with no client-side JavaScript, no trackers and no requests to third-party servers. English and Chinese pages come from the same data, and the build fails if a page, a string or a number exists in one language but not the other. It is hosted on Cloudflare.
