## Coordinating food donation and delivery {#scenario}

FoodShelter connects donors, inspectors, shelters and drivers through role-specific work queues. In our team, I designed the domain model and persistence, implemented the application shell and role-based login, and co-developed the workflow screens.

I represented organizations, user roles and work requests as separate objects. Each role opens its own workspace, while shared queues pass donation and delivery requests between participants.

## From requirements to objects {#domain-model}

The model gives every responsibility in that description a single home: who owns which work, and who hands it on to whom.

- **Network** is the unit a user logs in to. It holds the enterprises, the user accounts, and the two queues shared across enterprises: inspection and warehouse.
- **Enterprise** groups organizations of one kind (food, inspection, shelter network, volunteers). It extends the organization class, so an enterprise can hold its own accounts and its own queue.
- **Organization** owns a work queue and a directory of user accounts, and declares which roles it supports.
- **User account** holds exactly one role and a personal queue.
- **Role** has one job: `createWorkArea()` builds the screen for that role. The login screen authenticates against the chosen network and then calls this method, so it never needs a switch over the role types.
- **Work request** carries a sender, a receiver and a status. Food-item, delivery and needs requests extend it; a delivery request adds a task status and the assigned driver.

Two abstractions carry the design. Polymorphism on the role replaces a dispatch table: a new kind of user is a new role class, and login does not change. Queues are the only seam between screens: a screen reads a queue, changes the request it was given and puts it in the next queue, so no screen calls another.


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

## Shared requests and object persistence {#tradeoffs}

The queues hold references to the same request object. When a participant updates a request, another role reads that updated object from its own queue. This connects the screens through the domain model.

I used embedded db4o persistence to save the system's object graph when the user logs out or closes the window, and load it at startup. Organizations, accounts and their queues retain their relationships across sessions.

## Role-based interface dispatch {#limits}

The login screen authenticates the user in the selected network, then calls the role's `createWorkArea()` method. Each role supplies its own screen through polymorphism. The shared login flow therefore delegates workspace construction to the role class.
