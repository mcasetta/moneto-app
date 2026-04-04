const { autoUpdater } = require('electron-updater');
const { dialog, app } = require('electron');

function setupUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Aggiornamento disponibile',
      message: `Versione ${info.version} disponibile.\nVuoi aggiornare ora?`,
      detail: 'L\'app verrà aggiornata e riavviata.',
      buttons: ['Aggiorna', 'Più tardi'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', (info, explicit) => {
    if (explicit) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Nessun aggiornamento',
        message: 'Stai usando l\'ultima versione di Moneto.',
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Aggiornamento pronto',
      message: 'L\'aggiornamento è stato scaricato.\nMoneto si riavvierà per completare l\'installazione.',
      buttons: ['Riavvia ora'],
    }).then(() => {
      autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err.message);
  });

  // Check silently on startup
  autoUpdater.checkForUpdates();
}

// Called explicitly (e.g. from tray menu "Controlla aggiornamenti")
function checkForUpdates(explicit = false) {
  if (explicit) {
    autoUpdater.once('update-not-available', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Nessun aggiornamento',
        message: 'Stai usando l\'ultima versione di Moneto.',
      });
    });
  }
  autoUpdater.checkForUpdates();
}

module.exports = { setupUpdater, checkForUpdates };
