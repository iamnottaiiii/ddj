const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');

let mainWindow;
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 650,
    title: 'Luma',
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  const devUrl = process.env.LUMA_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
};

app.whenReady().then(() => {
  // Keep browser pages isolated from the local app and deny notification prompts by default.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
