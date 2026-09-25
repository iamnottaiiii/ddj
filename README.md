# Luma

Luma is a clean, standalone Windows AI browser. It has a messaging-first local AI interface alongside a Chromium browser panel. It does **not** need Ollama, LM Studio, an AI account, an API key, or a hosted backend.

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

This emits both an NSIS installer and a portable Windows executable under `release/`. Building Windows artifacts is best done on Windows (or a CI runner with Windows packaging support). This checkout's Linux environment can build the renderer but could not download Electron/native package binaries because its upstream binary TLS connection was rejected.

## Behavior and privacy

- Chats are held in the app's local storage and can be deleted from the conversation list.
- The browser panel is Chromium `webview` content partitioned separately from the app UI.
- Browser permission prompts are denied by default.
- Luma does not send chat text to an AI API.
- The initial open-model download requires internet access; once cached, local chat no longer does.

This is an offline assistant, not an unrestricted automation tool. It does not bypass sign-ins, paywalls, CAPTCHAs, site security, or user consent.
