import { defineConfig } from 'vite';

// A relative production base keeps the same build usable at a domain root and
// under a GitHub Pages project path such as /ddj/.
export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
});
