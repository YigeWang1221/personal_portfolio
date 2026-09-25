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

## Collaborative editing {#editing}

Group members can edit the same homework. Saves and reads check that the user belongs to the group, and a lock serializes concurrent saves. In the original capstone that lock was a single read/write lock for the whole application: correct on one server, but it made every group wait for every other group, and it could not work across several instances.

## What I owned {#ownership}

Everything: it was my undergraduate capstone, built alone. The frontend starts from an open-source admin template; the application pages, the backend, the data model and the media handling are my work.

## 2026 maintenance branch (in progress) {#maintenance}

In 2026 I recovered the backend source from an archive and started a maintenance branch:

- **A per-homework Redis lock** replaces the application-wide lock: `SET NX PX` with a time-to-live, released by a Lua compare-and-delete script. Groups no longer block each other, the lock works across instances, and a crashed holder's lock expires on its own.
- **A Redis cache** for the read-heavy equipment catalog and showcase, with eviction on every write path — including handlers that write through the mapper directly — and a fallback to MySQL when Redis is unavailable.
- **Two bug fixes**, configuration moved to environment variables, and unit tests for the lock.

The branch has not been built or merged yet, so this page describes the capstone as built and lists the upgrade as work in progress.

## Known limits and next steps {#next}

- **Stock updates can race.** Borrowing reads the stock, then writes it back, so two concurrent requests could both succeed. An atomic conditional update would fix it.
- **Live update notifications** need a message-broker configuration before editors see each other's changes in real time.
- **Next:** finish and merge the maintenance branch, then add integration tests around borrowing and grading.
