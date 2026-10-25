## The platform {#platform}

The platform runs an IoT course for teachers and students:

- **Equipment loans.** Students request lab equipment, teachers approve, and returns update the stock.
- **Classes and groups.** Teachers manage classes, groups and students, with Excel import and export.
- **Group homework.** Assignments are handed out, a group edits its submission together in a rich-text editor, and teachers grade it.
- **Exports and showcase.** Homework exports to PDF, and the best work is collected in a public showcase.
- **Media.** Images, project videos and archives are stored in object storage, and videos can be scrubbed while they play.
- **Access.** Separate teacher and student roles, with a captcha on login.

## Architecture {#architecture}

- **Backend.** Spring Boot 2.7 on Java 17 with {{fact:endpoints}} REST endpoints across eleven controllers. MyBatis-Plus maps the MySQL schema. Login, student and teacher interceptors guard the routes.
- **Documents.** Apache POI handles Excel import and export; iText html2pdf renders homework to PDF from HTML.
- **Media.** MinIO stores files, and a dedicated controller serves them.
- **Frontend.** Vue 3 with TypeScript and Element Plus, built on the open-source vue-element-plus-admin template, with a rich-text editor and a video player.

## Media: multipart upload and seekable video {#media}

Course videos are large. Uploads go to MinIO through the SDK with the file size known in advance, so large files are sent as multipart uploads. Playback goes through an endpoint that implements HTTP Range requests — `Range`, `If-Range` and `206 Partial Content` — so the player can jump to any point without downloading the whole file first.

## Group homework editing {#editing}

I connected group membership to homework access: reads and saves check the student's group before accessing its submission. A read/write lock serializes saves in the application, coordinating updates to the shared homework document.

## Homework locks and catalog caching {#maintenance}

I implemented a per-homework Redis lock using `SET NX PX`, with expiry and a Lua compare-and-delete operation for release. Lock ownership is scoped to the homework rather than shared across the whole application.

I also implemented Redis caching for the equipment catalog and showcase. Write paths evict affected entries, and reads fall back to MySQL when Redis is unavailable.

## Documents and teaching materials {#next}

Teachers manage classes and groups through the application. Apache POI handles spreadsheet import and export, and iText html2pdf converts homework content into PDF. MinIO stores images, videos and archives, connecting course administration with the materials used in teaching.
