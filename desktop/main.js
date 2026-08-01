// GuardianX Desktop App — Electron main process
// Wraps the GuardianX web app in a native Windows window.
//
// The app loads the Vercel deployment URL by default.
// Users can also set GUARDIANX_URL env var or create a config file
// to point to a local/custom deployment.

const { app, BrowserWindow, Menu, shell, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

// ── Configuration ────────────────────────────────────────────────────────
// Default: Vercel deployment
const DEFAULT_URL = "https://guardian-x-git-main-guardianx.vercel.app";

// Check for custom URL in config file or env var
function getAppUrl() {
  // 1. Environment variable
  if (process.env.GUARDIANX_URL) return process.env.GUARDIANX_URL;

  // 2. Config file next to the executable
  try {
    const configPath = path.join(app.getPath("userData"), "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.url) return config.url;
    }
  } catch { /* ignore */ }

  // 3. Default: Vercel deployment
  return DEFAULT_URL;
}

let mainWindow = null;

function createWindow() {
  const url = getAppUrl();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "GuardianX",
    backgroundColor: "#09090b",
    show: false, // Show only when ready
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    // Remove default frame for a cleaner look (optional)
    // frame: false,
    // titleBarStyle: "hidden",
    autoHideMenuBar: true,
  });

  // Load the GuardianX web app
  mainWindow.loadURL(url);

  // Show window when ready (prevents white flash)
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    // Focus on the window
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // Handle external links — open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    // Allow same-origin links to open in the app
    try {
      const appUrl = new URL(url);
      const linkUrlParsed = new URL(linkUrl);
      if (linkUrlParsed.hostname === appUrl.hostname) {
        return { action: "allow" };
      }
    } catch { /* ignore parse errors */ }

    // External links open in default browser
    shell.openExternal(linkUrl);
    return { action: "deny" };
  });

  // Handle navigation — prevent navigation away from the app
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      const appUrl = new URL(url);
      const navUrl = new URL(navigationUrl);
      if (navUrl.hostname !== appUrl.hostname) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    } catch { /* ignore */ }
  });

  // Handle download requests (for VAPT PDF reports)
  mainWindow.webContents.session.on("will-download", (event, item) => {
    // Save to Downloads folder
    const downloadsPath = app.getPath("downloads");
    const filename = item.getFilename();
    item.setSavePath(path.join(downloadsPath, filename));
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── App lifecycle ────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  // Re-create window on macOS when dock icon is clicked
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Security: prevent new window creation from renderer
app.on("web-contents-created", (event, contents) => {
  contents.on("will-attach-webview", (event, webPreferences, params) => {
    // Strip away preload scripts if unused or verify their location
    delete params.preload;
    delete params.preloadURL;

    // Disable Node.js integration
    webPreferences.nodeIntegration = false;
  });
});

// ── Menu ─────────────────────────────────────────────────────────────────
const template = [
  {
    label: "File",
    submenu: [
      {
        label: "Reload",
        accelerator: "CmdOrCtrl+R",
        click: () => {
          if (mainWindow) mainWindow.reload();
        },
      },
      {
        label: "Force Reload",
        accelerator: "CmdOrCtrl+Shift+R",
        click: () => {
          if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        accelerator: "CmdOrCtrl+Q",
        click: () => app.quit(),
      },
    ],
  },
  {
    label: "View",
    submenu: [
      {
        label: "Zoom In",
        accelerator: "CmdOrCtrl+=",
        click: () => {
          if (mainWindow) {
            const zoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(zoom + 0.1);
          }
        },
      },
      {
        label: "Zoom Out",
        accelerator: "CmdOrCtrl+-",
        click: () => {
          if (mainWindow) {
            const zoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(Math.max(0.3, zoom - 0.1));
          }
        },
      },
      {
        label: "Reset Zoom",
        accelerator: "CmdOrCtrl+0",
        click: () => {
          if (mainWindow) mainWindow.webContents.setZoomFactor(1.0);
        },
      },
      { type: "separator" },
      {
        label: "Toggle Fullscreen",
        accelerator: "F11",
        click: () => {
          if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
        },
      },
      {
        label: "Toggle Developer Tools",
        accelerator: "F12",
        click: () => {
          if (mainWindow) mainWindow.webContents.toggleDevTools();
        },
      },
    ],
  },
  {
    label: "Help",
    submenu: [
      {
        label: "GuardianX Website",
        click: () => shell.openExternal("https://www.guardianx.in"),
      },
      {
        label: "Contact Support",
        click: () => shell.openExternal("mailto:hello@guardianx.in"),
      },
      { type: "separator" },
      {
        label: "About GuardianX",
        click: () => {
          const { dialog } = require("electron");
          dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "About GuardianX",
            message: "GuardianX — Autonomous Security Operations Platform",
            detail: "Version 1.0.0\n\nAI-driven SAST, DAST, exploit generation,\nadversarial patching, and VAPT reporting.\n\n© 2026 GuardianX\nwww.guardianx.in · hello@guardianx.in",
            icon: path.join(__dirname, "build", "icon.png"),
          });
        },
      },
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
