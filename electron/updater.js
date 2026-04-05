const { autoUpdater } = require('electron-updater');
const { dialog, app } = require('electron');

function setupUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null; // electron-updater logs via its own logger; suppress to avoid noise

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Aggiornamento disponibile',
      message: `Versione ${info.version} disponibile.\nVuoi aggiornare ora?`,
      detail: 'L\'app verrà aggiornata e riavviata.',
      buttons: ['Aggiorna', 'Più tardi'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`Update download: ${pct}%`);
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
    // Silently log errors on startup check — network may be unavailable
    console.error('Auto-update error:', err.message);
  });

  // Check silently on startup (errors are suppressed above)
  autoUpdater.checkForUpdates().catch(() => {});
}

// Called explicitly from tray menu "Controlla aggiornamenti"
function checkForUpdates() {
  autoUpdater.once('update-not-available', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Nessun aggiornamento',
      message: `Stai usando l\'ultima versione di Moneto (${app.getVersion()}).`,
    });
  });

  autoUpdater.once('error', (err) => {
    dialog.showErrorBox(
      'Errore verifica aggiornamenti',
      `Impossibile controllare gli aggiornamenti.\n\n${err.message}`
    );
  });

  autoUpdater.checkForUpdates().catch(() => {});
}

module.exports = { setupUpdater, checkForUpdates };
