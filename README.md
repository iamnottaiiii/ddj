# workspace

A private, local-first productivity suite. It runs entirely in the browser using static files and IndexedDB: no account, backend, telemetry, or network service is required.

## Run locally

```bash
npm install
npm run dev
```

## Build / test

```bash
npm run build
npm test
```

The production files are written to `dist/`. They can be hosted as static files or installed as a PWA. Existing workspace data is never included in a build.

## Data and recovery

All data is held in the browser's IndexedDB database `workspace-local`. Settings → Storage & backup exports a documented JSON archive. Restore supports merge and transactional replacement. The Trash retains recoverable files until it is explicitly emptied.

## Current implementation

Working local tools: Writer (rich text, find/replace, print, HTML/Markdown/text export), Sheets (editable grid, formulas, CSV import/export), Slides (drag canvas, speaker notes, presentation, portable HTML export), Notes, local Calendar and Tasks, Forms with local responses/packages, and Board with SVG export. Use the command palette (`Ctrl K`) for navigation and creation.

All runtime assets are bundled locally; `public/sw.js` caches static app files after first load.
