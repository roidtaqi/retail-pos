import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './db';
import { startSyncWorker, sendSyncStatus } from './ipc/sync';
import { startPrintQueueWorker } from './ipc/printer';
import { startMonitoringServer } from './monitoringServer';

// Import IPC modules to register handlers
import './ipc/auth';
import './ipc/products';
import './ipc/sales';
import './ipc/shifts';
import './ipc/reports';
import './ipc/sync';
import './ipc/categories';
import './ipc/customers';
import './ipc/debts';
import './ipc/settings';
import './ipc/printer';

let mainWindow: BrowserWindow | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database on Startup
try {
  initDatabase();
} catch (error) {
  console.error('Failed to initialize database:', error);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Offline-First Retail POS (Sembako)',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Start window maximized so the bottom layout is not cut off by default
  mainWindow.maximize();

  // Register window control IPCs
  ipcMain.handle('window:toggleFullScreen', () => {
    if (mainWindow) {
      const isFS = mainWindow.isFullScreen();
      mainWindow.setFullScreen(!isFS);
      return !isFS;
    }
    return false;
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        return false;
      } else {
        mainWindow.maximize();
        return true;
      }
    }
    return false;
  });

  ipcMain.handle('window:isFullScreen', () => {
    return mainWindow ? mainWindow.isFullScreen() : false;
  });

  // Check if loaded by Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('DEBUG MAIN: did-fail-load:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('dom-ready', () => {
    console.log('DEBUG MAIN: dom-ready');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Send initial sync status once loaded
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow) {
      sendSyncStatus(mainWindow);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // Start background sync queue worker checking every 8 seconds
  startSyncWorker(() => mainWindow);

  // Start background print queue worker checking every 5 seconds
  startPrintQueueWorker();

  // Start read-only browser dashboard for sales monitoring
  startMonitoringServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
