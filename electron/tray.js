const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function setupTray(app, mainWindow) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  tray = new Tray(nativeImage.createFromPath(iconPath));

  tray.setToolTip('Moneto');
  tray.setContextMenu(buildMenu(app, mainWindow));

  // Single click: show/restore window
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });
}

function buildMenu(app, mainWindow) {
  return Menu.buildFromTemplate([
    {
      label: 'Apri Moneto',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Controlla aggiornamenti',
      click: () => {
        const { checkForUpdates } = require('./updater');
        checkForUpdates(true);
      },
    },
    { type: 'separator' },
    {
      label: 'Esci',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

module.exports = { setupTray };
