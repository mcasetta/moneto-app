const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function showWizard() {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 420,
      height: 380,
      frame: false,
      resizable: false,
      center: true,
      skipTaskbar: false,
      title: 'Moneto - Configurazione iniziale',
      icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    win.loadFile(path.join(__dirname, 'wizard.html'));

    ipcMain.handleOnce('wizard-submit', (_event, data) => {
      resolve(data);
      win.close();
    });

    // If user closes the window without submitting, use defaults
    win.on('closed', () => {
      resolve(null);
    });
  });
}

module.exports = { showWizard };
