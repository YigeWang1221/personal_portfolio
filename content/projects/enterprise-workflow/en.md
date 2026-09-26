## From business requirements to my implementation {#scenario}

Food rescue requires donors, inspectors, shelters and drivers to coordinate. In our team, I translated those responsibilities into the domain model, work queues and role-based interface dispatch, implemented persistence and the application shell, and co-implemented workflow screens.

The design question was how to turn that description into objects: which ones exist, what each one owns, and how work moves between people who never see each other's screens.

## From requirements to objects {#domain-model}

The model gives every responsibility in that description a single home: who owns which work, and who hands it on to whom.

- **Network** is the unit a user logs in to. It holds the enterprises, the user accounts, and the two queues shared across enterprises: inspection and warehouse.
- **Enterprise** groups organizations of one kind (food, inspection, shelter network, volunteers). It extends the organization class, so an enterprise can hold its own accounts and its own queue.
- **Organization** owns a work queue and a directory of user accounts, and declares which roles it supports.
- **User account** holds exactly one role and a personal queue.
- **Role** has one job: `createWorkArea()` builds the screen for that role. The login screen authenticates against the chosen network and then calls this method, so it never needs a switch over the role types.
- **Work request** carries a sender, a receiver and a status. Food-item, delivery and needs requests extend it; a delivery request adds a task status and the assigned driver.

Two abstractions carry the design. Polymorphism on the role replaces a dispatch table: a new kind of user is a new role class, and login does not change. Queues are the only seam between screens: a screen reads a queue, changes the request it was given and puts it in the next queue, so no screen calls another.

One choice I would keep and one I would change. Keeping a driver's active and finished queues inside the driver role made "is this driver busy?" a one-line check. But the request's own `status` and the delivery's `taskStatus` are two free-text fields, so the same object can say `Pending` in one field and `Delivered` in the other.

## One donation, end to end {#workflow}

The path the code implements, step by step. Status values are the strings the code writes.

| Step | Who | What the code does |
|---|---|---|
| Donate | Food provider | Creates a food item and a request with status `Pending`, and adds the same request object to the organization's queue, the donor's own queue and the network's inspection queue |
| Inspect | Fresh checker | Approve marks the item `accepted` and `stored` and moves the request from the inspection queue to the warehouse queue. Reject removes it from the inspection queue |
| Ask | Homeless client | Creates a needs request with status `Pending` in the shelter network's collecting organization |
| Match | Shelter helper | Pairs one warehouse item with one pending request and creates a delivery task (`UnPick`). The request becomes `Matched`, the item `Assigned` |
| Dispatch | Task manager | Accepts only a task that is still `UnPick`, assigns a driver, sets the task to `Waiting to be picked up` and marks the driver `busy` |
| Deliver | Driver | Marks the task `Picked up`, then `Delivered`; the item becomes `donated`, and the task moves from the driver's active queue to the finished queue |

## Design trade-offs {#tradeoffs}

- **Queues share objects.** A request is not copied between queues; the same object sits in several at once. Every screen stays consistent without any syncing, but a change made on one screen is visible everywhere immediately, and nothing records who changed it.
- **Screens own the business rules.** The rule "only unassigned tasks can be dispatched" lives in the task manager's button handler, not in a model method. There is no service layer, so the rules are hard to test and easy to bypass.
- **Persistence is the whole graph.** An embedded db4o database stores the entire system object when a user logs out or the window closes, and loads it at startup; if the file is empty, seed data is generated. There is no schema to migrate, but committing the database file to git caused merge conflicts.
- **An extension, concretely.** Adding a new kind of request — say, hygiene supplies — needs a new request subclass and a new role whose `createWorkArea()` returns its screen; login stays unchanged. But every screen that lists work filters with `instanceof` checks and compares status strings, so each screen that should show the new request has to be edited, and the compiler cannot help find them.

## Limits and what I'd change {#limits}

- **State rules live outside the model.** A driver can mark a task delivered without marking it picked up, and a rejected donation simply leaves the inspection queue, so the donor's list never shows the outcome.
- **A delivered item comes back.** Nothing removes a delivered item from the warehouse queue, and the matching list hides only items marked `Assigned`, so after delivery the item is listed as available again.
- **No automated tests.**
- **Next:** move the status rules into the model as enums with allowed transitions, put the queue moves behind model methods, and generate the database from seed data on first run instead of committing it.
