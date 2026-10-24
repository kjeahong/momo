const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { fork } = require('node:child_process');

let mainWindow = null;
let serverProcess = null;

function startBackendServer() {
  const serverScript = path.resolve(__dirname, '../server/index.js');
  serverProcess = fork(serverScript, [], {
    env: { ...process.env, PORT: '3001' },
    stdio: 'inherit'
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Momo - 기억을 찾아주는 스마트 노트',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Wait a moment for server to listen, then load
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3001');
  }, 800);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackendServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
