const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const { setupTray } = require('./tray');
const { setupUpdater } = require('./updater');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  const defaults = { port: 8080 };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch (e) {
    console.error('Failed to read config, using defaults:', e.message);
  }
  return defaults;
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
// Backend process
// ---------------------------------------------------------------------------

let backendProcess = null;

function startBackend(port, dataDir) {
  const javaExe = getJavaExecutable();
  const jarPath = getJarPath();

  console.log(`Starting backend: ${javaExe} -jar ${jarPath} --server.port=${port}`);

  backendProcess = spawn(javaExe, [
    '-jar', jarPath,
    `--server.port=${port}`,
    `--spring.datasource.url=jdbc:h2:file:${path.join(dataDir, 'moneto')};DB_CLOSE_ON_EXIT=FALSE`,
    `--logging.file.name=${path.join(dataDir, 'logs', 'moneto.log')}`,
  ], {
    detached: false,
    windowsHide: true,
  });

  backendProcess.stdout.on('data', (data) => console.log('[backend]', data.toString().trim()));
  backendProcess.stderr.on('data', (data) => console.error('[backend]', data.toString().trim()));
  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// ---------------------------------------------------------------------------
// Health check: poll until Spring Boot is ready
// ---------------------------------------------------------------------------

function waitForBackend(port, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const url = `http://localhost:${port}/actuator/health`;

    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      }).on('error', () => retry());
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Backend did not start in time'));
      } else {
        setTimeout(check, 500);
      }
    };

    check();
  });
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
  const config = loadConfig();
  const dataDir = app.getPath('userData');

  // Ensure logs directory exists
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

  startBackend(config.port, dataDir);

  // TODO: show splash screen here while waiting

  try {
    await waitForBackend(config.port);
  } catch (e) {
    console.error('Backend failed to start:', e.message);
    app.quit();
    return;
  }

  createWindow(config.port);
  setupTray(app, mainWindow);
  setupUpdater();
});

app.on('window-all-closed', (event) => {
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
