const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const logFile = 'C:/Users/Administrator/Desktop/momo/electron_boot.log';
function log(msg) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

log('main.cjs executed');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow = null;
let serverInstance = null;

async function start() {
  log('start() entered');
  try {
    log('Calling import(../server/app.js)...');
    const { createApp } = await import('../server/app.js');
    log('createApp imported successfully');

    const expressApp = await createApp();
    log('expressApp created');

    const server = http.createServer(expressApp);
    await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        resolve();
      });
      server.on('error', reject);
    });

    serverInstance = server;
    const port = server.address().port;
    log(`Internal server running on port: ${port}`);

    log('Creating BrowserWindow...');
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 960,
      minHeight: 640,
      title: 'Momo',
      backgroundColor: '#ffffff',
      autoHideMenuBar: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    log(`Loading URL: http://127.0.0.1:${port}...`);
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
    log('URL loaded successfully into BrowserWindow!');

    mainWindow.on('closed', () => {
      log('mainWindow closed');
      mainWindow = null;
    });
  } catch (err) {
    log('ERROR in start(): ' + (err.stack || err));
  }
}

app.whenReady().then(() => {
  log('app.whenReady() fired');
  start();
}).catch(err => {
  log('whenReady error: ' + (err.stack || err));
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    start();
  }
});

app.on('window-all-closed', () => {
  log('window-all-closed fired');
  if (serverInstance) {
    serverInstance.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
