import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// Reconstruct __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Hide the default menu bar for a cleaner look
  mainWindow.setMenuBarVisibility(false);
  mainWindow.autoHideMenuBar = true;

  // Load the app based on environment
  if (app.isPackaged) {
    // Production: Load the built HTML file
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    // Development: Load the Vite server
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

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
