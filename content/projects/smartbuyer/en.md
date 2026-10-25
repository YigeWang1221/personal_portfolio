## The store {#system}

SmartBuyer is an online store. Shoppers browse by category, search, keep a cart, place orders with simulated payment and request refunds. Administrators manage products and categories and review refund requests.

## The backend I led {#backend}

- **Structure.** I set up the Express server and later restructured the project into separate server and frontend folders, then moved inline routes into controller and route layers.
- **Data model.** {{fact:schemas}} Mongoose schemas covering users, the catalog, carts, orders and payments.
- **APIs.** User registration with bcrypt-hashed passwords and session login; administration of categories and products with up to five images each; product search over several fields with sorting, both paginated; saved payment methods; and the admin refund review, page and endpoint.
- **Uploads and seed data.** Multer handles image uploads and accepts only JPEG, PNG and GIF files; a seed script resets the collections and fills them with demo data.

After login, the server stores user identity in the session and the browser continues with its session cookie; logout destroys the session. Separating route binding from request handling keeps user, product and order endpoints maintainable in their own files.

## Cart, orders and refund review {#scope}

Our team connected product browsing and search to the cart and simulated checkout. Administrators manage the catalog and review refund requests. I implemented the backend models and APIs that connect these customer and administrator workflows.
