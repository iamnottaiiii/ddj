# Luma

Luma is a clean, standalone Windows AI browser. It has a messaging-first local AI interface alongside a Chromium browser panel. It does **not** need Ollama, LM Studio, an AI account, an API key, or a hosted backend.

## Browser agent

Turn on **Browser agent** in the sidebar and give Luma a task such as “search for a recipe for lentil soup,” “open `https://example.com`,” or “click Continue.” The local model reads a limited description of the currently visible browser page, creates an allowlisted plan, and shows every navigation, click, keystroke, and typing action for review. Nothing runs until **Review & run** is pressed.

Approved clicks and text entry are delivered to the embedded Chromium browser using Electron input events, not a cloud automation service. Luma will not enter password fields. Potentially sensitive plans such as sending, purchasing, deleting, transferring, or signing in request an additional confirmation. It does not bypass CAPTCHAs, paywalls, sign-ins, or site security.

## How the AI works

The app uses Transformers.js in its own renderer process. On the first **Install offline model** action it downloads the compact open `Xenova/LaMini-Flan-T5-77M` model into the app's local browser cache. After the one-time model download, inference and chat run on-device. The default model is intentionally small so it can run on ordinary hardware; it is a real local model, not a simulated reply service.

The model download is not bundled in this source repository because model weights are hundreds of megabytes. The packaged installer has no dependency on Ollama or LM Studio. To make a fully air-gapped installer, download approved model assets ahead of time and bundle them under the app's resources before packaging.

## Development

```bash
npm install
npm run dev
```

## Windows build

```bash
npm run package:win
```

This emits `Luma-Setup-<version>-x64.exe` (the NSIS installer) and `Luma-Portable-<version>-x64.exe` (the portable app) under `release/`. Building Windows artifacts is best done on Windows (or a CI runner with Windows packaging support). This checkout's Linux environment can build the renderer but could not download Electron/native package binaries because its upstream binary TLS connection was rejected.

## If `npm run dev` says Electron failed to install

This happens when `node_modules` was copied from an environment where Electron's post-install binary download was skipped. Stop Vite, then run this in PowerShell from the project folder. Do this only for the dev command, not to build the packaged EXE:

```powershell
Remove-Item -Recurse -Force .\node_modules
Remove-Item -Force .\package-lock.json
Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue
npm install --foreground-scripts
npm run dev
```

A normal fresh clone plus `npm install` does not need this repair.

## Behavior and privacy

- Chats are held in the app's local storage and can be deleted from the conversation list.
- The browser panel is Chromium `webview` content partitioned separately from the app UI.
- Browser permission prompts are denied by default.
- Agent action plans are local, constrained to navigation/click/type/key/wait operations, and require an explicit review before execution.
- Luma does not send chat text to an AI API.
- The initial open-model download requires internet access; once cached, local chat no longer does.

This is an offline assistant, not an unrestricted automation tool. It does not bypass sign-ins, paywalls, CAPTCHAs, site security, or user consent.
