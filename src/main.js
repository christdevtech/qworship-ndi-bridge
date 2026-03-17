'use strict';

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const os = require("os");
const Store = require("./simple-store");
const NdiManager = require("./ndi-manager");

// ---------------------------------------------------------------------------
// Persistent settings
// ---------------------------------------------------------------------------
const store = new Store({
  sources: [
    { url: "", ndiName: "QWORSHIP_SRC1" },
    { url: "", ndiName: "QWORSHIP_SRC2" },
  ],
  windowBounds: { width: 1100, height: 720 },
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mainWindow = null;
let hiddenWindows = [null, null];
let ndiManager = null;
let statsInterval = null;

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
function createMainWindow() {
  const { width, height } = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    frame: false, // custom titlebar
    transparent: false,
    backgroundColor: "#121214",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "assets", "icon.ico"),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("resize", () => {
    const [w, h] = mainWindow.getSize();
    store.set("windowBounds", { width: w, height: h });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopAllStreams();
  });
}

// ---------------------------------------------------------------------------
// Hidden offscreen BrowserWindows
// ---------------------------------------------------------------------------
function createHiddenWindow(index, url) {
  if (hiddenWindows[index]) {
    hiddenWindows[index].destroy();
    hiddenWindows[index] = null;
  }

  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // allow cross-origin browser sources
    },
  });

  win.loadURL(url);
  hiddenWindows[index] = win;
  return win;
}

// ---------------------------------------------------------------------------
// Stream control
// ---------------------------------------------------------------------------
function startAllStreams(sources) {
  if (ndiManager) {
    ndiManager.destroy();
    ndiManager = null;
  }

  ndiManager = new NdiManager();

  sources.forEach((src, i) => {
    if (!src.url || !src.ndiName) return;

    const win = createHiddenWindow(i, src.url);
    const sender = ndiManager.createSender(i, src.ndiName, 1920, 1080);

    win.webContents.setFrameRate(60);
    win.webContents.on("paint", (_event, _dirty, image) => {
      const frameData = image.getBitmap(); // BGRA raw buffer
      sender.sendFrame(frameData, 1920, 1080);
    });
  });

  // Save sources to store
  store.set("sources", sources);

  // Push live stats + preview thumbnails every second
  statsInterval = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const stats = buildStats();

    // Capture a 480x270 thumbnail from each active hidden window
    const previews = await Promise.all(
      hiddenWindows.map(async (win) => {
        if (!win || win.isDestroyed()) return null;
        try {
          const img = await win.webContents.capturePage();
          return img.resize({ width: 480 }).toDataURL();
        } catch {
          return null;
        }
      }),
    );

    mainWindow.webContents.send("stats-update", { ...stats, previews });
  }, 1000);
}

function stopAllStreams() {
  clearInterval(statsInterval);
  statsInterval = null;

  hiddenWindows.forEach((win, i) => {
    if (win && !win.isDestroyed()) win.destroy();
    hiddenWindows[i] = null;
  });

  if (ndiManager) {
    ndiManager.destroy();
    ndiManager = null;
  }
}

function refreshSources(sources) {
  if (!ndiManager) return; // not streaming, nothing to refresh
  sources.forEach((src, i) => {
    const win = hiddenWindows[i];
    if (win && !win.isDestroyed() && src.url) {
      win.loadURL(src.url);
    }
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function buildStats() {
  const mem = process.memoryUsage();
  const totalRam = Math.round(mem.rss / 1024 / 1024);
  const cpuUsage = getCpuPercent();
  const fps = ndiManager ? ndiManager.getFpsStats() : [0, 0];
  const bitrate = ndiManager ? ndiManager.getBitrateStats() : [0, 0];

  return {
    cpu: cpuUsage,
    ram: totalRam,
    sources: [
      { fps: fps[0], bitrateMbps: bitrate[0], active: !!hiddenWindows[0] },
      { fps: fps[1], bitrateMbps: bitrate[1], active: !!hiddenWindows[1] },
    ],
  };
}

let _lastCpu = os.cpus().map((c) => ({ ...c.times }));
function getCpuPercent() {
  const cpus = os.cpus();
  let total = 0,
    idle = 0;
  cpus.forEach((cpu, i) => {
    const prev = _lastCpu[i];
    const curr = cpu.times;
    const dUser = curr.user - prev.user;
    const dNice = curr.nice - prev.nice;
    const dSys = curr.sys - prev.sys;
    const dIrq = curr.irq - prev.irq;
    const dIdle = curr.idle - prev.idle;
    const tTotal = dUser + dNice + dSys + dIrq + dIdle;
    total += tTotal;
    idle += dIdle;
  });
  _lastCpu = cpus.map((c) => ({ ...c.times }));
  return total > 0 ? Math.round(((total - idle) / total) * 100) : 0;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
ipcMain.handle("start-stream", (_e, sources) => {
  startAllStreams(sources);
  return { ok: true };
});

ipcMain.handle("stop-stream", () => {
  stopAllStreams();
  return { ok: true };
});

ipcMain.handle("refresh-sources", (_e, sources) => {
  refreshSources(sources);
  return { ok: true };
});

ipcMain.handle("get-saved-sources", () => {
  return store.get("sources");
});

ipcMain.handle("open-external", (_e, url) => {
  shell.openExternal(url);
});

// Window controls
ipcMain.on("window-minimize", () => mainWindow && mainWindow.minimize());
ipcMain.on("window-maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("window-close", () => {
  stopAllStreams();
  app.quit();
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  stopAllStreams();
  if (process.platform !== "darwin") app.quit();
});
