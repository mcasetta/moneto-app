const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execSync } = require('child_process');
const http = require('http');

const { setupTray } = require('./tray');
const { setupUpdater } = require('./updater');
const { showWizard } = require('./wizard');

// In dev mode, use a separate data directory to avoid conflicts with the installed app
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Moneto-dev'));
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  const defaults = { port: 8080, setupComplete: false };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch (e) {
    console.error('Failed to read config, using defaults:', e.message);
  }
  return defaults;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save config:', e.message);
  }
}

// ---------------------------------------------------------------------------
// JAR / JRE paths
// ---------------------------------------------------------------------------

function getResourcesPath() {
  // In production: process.resourcesPath (inside the installed app)
  // In dev: sibling resources/ folder
  return app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..', 'resources');
}

function getJarPath() {
  return path.join(getResourcesPath(), 'moneto.jar');
}

function getJavaExecutable() {
  const jrePath = path.join(getResourcesPath(), 'jre');
  const javaExe = process.platform === 'win32'
    ? path.join(jrePath, 'bin', 'java.exe')
    : path.join(jrePath, 'bin', 'java');

  // Fall back to system java in dev mode
  if (!fs.existsSync(javaExe)) {
    console.warn('Bundled JRE not found, falling back to system java');
    return 'java';
  }
  return javaExe;
}

// ---------------------------------------------------------------------------
// Port availability check
// ---------------------------------------------------------------------------

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

// ---------------------------------------------------------------------------
// Backend process
// ---------------------------------------------------------------------------

let backendProcess = null;

function startBackend(port, dataDir, instanceName) {
  const javaExe = getJavaExecutable();
  const jarPath = getJarPath();

  console.log(`Starting backend: ${javaExe} -jar ${jarPath} --server.port=${port}`);

  backendProcess = spawn(javaExe, [
    '-jar', jarPath,
    `--server.port=${port}`,
    `--spring.datasource.url=jdbc:h2:file:${path.join(dataDir, 'moneto')};DB_CLOSE_ON_EXIT=FALSE`,
    `--logging.file.name=${path.join(dataDir, 'logs', 'moneto.log')}`,
    `--app.backup.local-path=${path.join(dataDir, 'backup')}`,
    ...(instanceName ? [`--app.instance-name=${instanceName}`] : []),
  ], {
    detached: false,
    windowsHide: true,
  });

  backendProcess.stdout.on('data', (data) => console.log('[backend]', data.toString().trim()));
  backendProcess.stderr.on('data', (data) => console.error('[backend]', data.toString().trim()));
  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    backendProcess = null;
    // If the backend shuts down on its own (e.g. user clicked "Chiudi applicazione"),
    // quit Electron too — unless we already initiated the quit ourselves.
    if (!app.isQuitting) {
      app.isQuitting = true;
      app.quit();
    }
  });
}

function stopBackend() {
  if (backendProcess) {
    if (process.platform === 'win32') {
      // On Windows, kill() is unreliable for Java processes. Use execSync so we
      // block until taskkill has actually terminated the process tree, ensuring
      // the port is freed before Electron exits.
      try {
        execSync(`taskkill /pid ${backendProcess.pid} /f /t`, { windowsHide: true });
      } catch (e) {
        // Process may have already exited on its own
      }
    } else {
      backendProcess.kill();
    }
    backendProcess = null;
  }
}

// ---------------------------------------------------------------------------
// Health check: poll until Spring Boot is ready
// ---------------------------------------------------------------------------

function waitForBackend(port, timeoutMs = 60000, onStatus) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const start = Date.now();
    const url = `http://localhost:${port}/api/version`;

    const settle = (fn, ...args) => {
      if (!settled) {
        settled = true;
        if (backendProcess) backendProcess.removeListener('exit', onExit);
        fn(...args);
      }
    };

    // Detect if backend crashes while we are waiting
    const onExit = (code) => {
      settle(reject, new Error(`Il backend si è arrestato inaspettatamente (codice: ${code}).\n\nControlla il log in:\n${app.getPath('userData')}\\logs\\moneto.log`));
    };
    if (backendProcess) backendProcess.once('exit', onExit);

    const check = () => {
      if (settled) return;

      const elapsed = Math.floor((Date.now() - start) / 1000);
      if (onStatus) {
        if (elapsed < 5) onStatus('Avvio backend in corso...');
        else onStatus(`Avvio backend in corso... (${elapsed}s)`);
      }

      http.get(url, (res) => {
        if (res.statusCode === 200) {
          settle(resolve);
        } else {
          retry();
        }
      }).on('error', retry);
    };

    const retry = () => {
      if (settled) return;
      if (Date.now() - start > timeoutMs) {
        settle(reject, new Error(`Il backend non ha risposto entro ${timeoutMs / 1000} secondi.\n\nControlla il log in:\n${app.getPath('userData')}\\logs\\moneto.log`));
      } else {
        setTimeout(check, 500);
      }
    };

    check();
  });
}

// ---------------------------------------------------------------------------
// Splash screen
// ---------------------------------------------------------------------------

let splashWindow = null;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 260,
    frame: false,
    resizable: false,
    center: true,
    skipTaskbar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function setSplashStatus(text) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = ${JSON.stringify(text)}`
    ).catch(() => {});
  }
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

let mainWindow = null;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Moneto',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // shown after load to avoid flash
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
  });

  // Open external links in the system browser, not in the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  let config = loadConfig();
  const dataDir = app.getPath('userData');

  // Ensure logs directory exists
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

  // First run: show setup wizard
  if (!config.setupComplete) {
    const result = await showWizard();
    if (result) {
      config.port = result.port;
      config.instanceName = result.instanceName;
    }
    config.setupComplete = true;
    saveConfig(config);
  }

  // Pre-flight: check JAR exists
  const jarPath = getJarPath();
  if (!fs.existsSync(jarPath)) {
    dialog.showErrorBox(
      'File non trovato',
      `Impossibile trovare il file dell'applicazione:\n${jarPath}\n\nRiinstalla Moneto.`
    );
    app.quit();
    return;
  }

  // Pre-flight: check port is available
  const portAvailable = await checkPortAvailable(config.port);
  if (!portAvailable) {
    dialog.showErrorBox(
      'Porta occupata',
      `La porta ${config.port} è già in uso da un'altra applicazione.\n\nChiudi l'applicazione che occupa la porta, oppure modifica la configurazione:\n${CONFIG_PATH}`
    );
    app.quit();
    return;
  }

  createSplashWindow();
  setSplashStatus('Avvio backend in corso...');

  startBackend(config.port, dataDir, config.instanceName);

  try {
    await waitForBackend(config.port, 60000, setSplashStatus);
  } catch (e) {
    closeSplash();
    dialog.showErrorBox('Errore di avvio', `Moneto non è riuscita ad avviarsi.\n\n${e.message}`);
    app.quit();
    return;
  }

  setSplashStatus('Caricamento interfaccia...');
  createWindow(config.port);
  setupTray(app, mainWindow);
  setupUpdater();
});

app.on('window-all-closed', () => {
  // Do not quit when all windows are closed; app lives in the tray
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopBackend();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
