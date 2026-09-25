# Packaging and architecture

- `electron/main.cjs` creates a hardened Electron window with context isolation, sandboxing, no Node integration, and a separate persistent Chromium browser partition.
- `electron/preload.cjs` exposes only the minimum safe desktop API needed to open a URL externally.
- `src/main.ts` owns the message UI, local conversation storage, model lifecycle, browser controls, constrained page inspection, reviewed action planning, and Electron input-event execution.
- `@xenova/transformers` runs the open local model in the renderer. It uses the browser cache for model files rather than a paid service or companion application.
- `electron-builder` is configured to create NSIS and portable Windows output from `npm run package:win`.

The first local model fetch shows truthful download status and a recoverable error. No fabricated message is shown if model initialization fails.

## Browser-agent action model

Agent mode reads a bounded snapshot of visible interactive elements from the current embedded browser page. The open local model can propose only `navigate`, `click`, `type`, `key`, and bounded `wait` actions. The application validates every proposed action, renders it for review, resolves the target again against the live page, and then sends native Electron mouse/keyboard events to the guest webview. Password fields are blocked; sensitive task wording requires a second confirmation.
