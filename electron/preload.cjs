const { contextBridge, shell } = require('electron');
contextBridge.exposeInMainWorld('lumaDesktop', {
  desktop: true,
  openExternal: (url) => shell.openExternal(url),
});
