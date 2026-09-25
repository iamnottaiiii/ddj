# workspace architecture

## Local storage and migrations

`src/main.ts` uses the browser IndexedDB database named `workspace-local`. Its version-one schema contains `files`, `revisions`, `settings`, `events`, `tasks`, `responses`, and `activity` stores. Files share a stable UUID-based model, so an item can be renamed without changing its local identity. The `onupgradeneeded` transaction is the migration boundary; future schema changes should add a versioned migration there rather than clearing existing stores.

Autosave is debounced. Successful editor saves update the file and write a bounded local revision snapshot (the newest 30 per file) in the same local database. A failed write is surfaced as a visible error state. Trash changes a file status rather than deleting it; permanent deletion also removes related revisions.

## Editors and commands

The shell is a single TypeScript application with type-specific editor renderers for Writer, Sheets, Slides, Notes, Forms, and Board. Shared menu actions (rename, duplicate, tag, export, trash, properties) call the same data methods whether they originate in a file row or an editor. Undo/redo keeps per-open-file in-memory command snapshots.

Writer sanitizes persisted/imported HTML-like content before it is rendered. Sheets calculates local references, ranges and basic aggregation expressions. Other editors retain structured JSON content in the shared file record.

## Search, backup, and portability

Universal search derives a local index from title, tags, and supported saved text content. It makes no network request. Full backup is a documented JSON object marked `format: "workspace-backup"`, `version: 1`, containing every store. Restore validates the marker and supports merge or a replacement IndexedDB transaction. Documents export in usable local formats: HTML/Markdown/text, CSV, portable presentation HTML, form package HTML/response JSON, and SVG.

## Security and offline behavior

There is no account, remote API, telemetry, tracker, or cloud sync. The Vite build bundles all app code locally. The manifest and service worker cache static app files after first load; IndexedDB is deliberately not cached by the service worker and is never erased by an update. The app only creates object URLs for downloads and revokes them shortly afterward.
