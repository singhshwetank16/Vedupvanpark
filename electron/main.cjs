const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Ved Upvan Park - Smart Ticketing & Gate Scanner',
    icon: path.join(__dirname, '../public/logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
    },
    autoHideMenuBar: false,
    backgroundColor: '#021812',
  });

  // Ignore self-signed SSL certificate in development (since basicSsl is used)
  mainWindow.webContents.session.setCertificateVerifyProc((request, callback) => {
    if (request.hostname === 'localhost' || request.hostname === '127.0.0.1') {
      callback(0); // 0 = Certificate is trusted
    } else {
      callback(-2); // Use default validation
    }
  });

  if (isDev) {
    mainWindow.loadURL('https://localhost:5173');
    // Open DevTools in dev mode with F12
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Native application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Print Ticket / Receipt',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            mainWindow.webContents.print({ silent: false, printBackground: true });
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit Application' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Refresh' },
        { role: 'forceReload', label: 'Force Reload' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Full Screen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Ved Upvan Park Support (+91-8439522256)',
          click: async () => {
            await shell.openExternal('tel:+918439522256');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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
