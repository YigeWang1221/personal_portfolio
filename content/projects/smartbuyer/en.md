## The store {#system}

SmartBuyer is an online store built as a course project. Shoppers browse by category, search, keep a cart, place orders with simulated payment and request refunds. Administrators manage products and categories and review refund requests.

## The backend I led {#backend}

- **Structure.** I set up the Express server and later restructured the project into separate server and frontend folders, then moved inline routes into controller and route layers.
- **Data model.** {{fact:schemas}} Mongoose schemas covering users, the catalog, carts, orders and payments.
- **APIs.** User registration with bcrypt-hashed passwords and session login; administration of categories and products with up to five images each; product search over several fields with sorting, both paginated; saved payment methods; and the admin refund review, page and endpoint.
- **Uploads and seed data.** Multer handles image uploads and accepts only JPEG, PNG and GIF files; a seed script resets the collections and fills them with demo data.

## What I owned {#ownership}

We were a team of five. I was the main author of the backend: the scaffold, the data models, the user, admin, product and payment routes and controllers, the upload handling and the two restructurings. The cart and order logic and the React frontend were shared team work that I co-implemented and helped debug.

## Scope {#scope}

This was coursework that ran locally and was never deployed, and the repository stays private. A production version would need proper configuration management, automated tests and a deployment pipeline.
