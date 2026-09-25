## The system {#system}

FoodShelter coordinates food rescue. Providers donate food; inspectors check its freshness; a rescue network manages homeless clients and their requests; task managers assign deliveries; volunteers and drivers deliver; administrators manage the organization structure; analysts look at the metrics. Each role logs in to its own work area, and work moves between organizations as requests in shared queues.

## The domain model {#domain-model}

The model follows a strict hierarchy: the system holds networks, a network holds enterprises (four types), an enterprise holds organizations (seven types), and organizations hold user accounts, each with one of fourteen role classes. Work is modeled as requests — deliveries, food items, needs — that sit in work queues owned by the network, so one organization can hand a request to another without the screens depending on each other.

Persistence uses an embedded db4o object database: the whole object graph is loaded when the app starts and saved when the window closes, and Datafaker seeds realistic demo data. The UI is Java Swing built with the NetBeans GUI builder, organized into model, UI and utility packages.

## What I owned {#ownership}

We were a team of three, and we worked through feature branches and pull requests ({{fact:prs}} in total). I created the repository and the Maven build, designed the domain model — I created {{fact:model_classes}} model classes and all of the utility classes — and wrote the main application shell with the role-aware login. I also co-implemented the task-manager, driver, inspection and rescue-network workflows with my teammates. Our system also included JFreeChart metrics dashboards and iText PDF reports, which a teammate built.

## What I learned {#lessons}

- **A binary database in git is a trap.** Committing the db4o file caused merge conflicts; the database should have been generated from the seed on first run instead.
- **Generated UI code is verbose.** The GUI builder made screens fast to draw, but slow to review.
- **Next steps** would be a README with screenshots and the class diagram, and tests around the request routing.
