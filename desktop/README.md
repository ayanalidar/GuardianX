# GuardianX Desktop App

Turn GuardianX into a native Windows application that can be installed on any PC.

## Quick Start

### Prerequisites
- **Node.js** 18+ (https://nodejs.org)
- **Windows 10/11** (for building the .exe)

### Option 1: Run in Development
```bash
cd desktop
npm install
npm start
```
This opens GuardianX in a desktop window immediately.

### Option 2: Build Windows Installer (.exe)
```bash
cd desktop
npm install
npm run build
```
This creates:
- `desktop/dist/GuardianX-Setup-1.0.0.exe` — NSIS installer (recommended)
- `desktop/dist/GuardianX-Portable-1.0.0.exe` — Portable version (no install needed)

### Option 3: Build on Mac/Linux (cross-compile for Windows)
```bash
cd desktop
npm install
npx electron-builder --win
```

## Distribution

### NSIS Installer (recommended)
- `GuardianX-Setup-1.0.0.exe`
- Users double-click to install
- Creates Desktop shortcut + Start Menu entry
- Can choose installation directory
- ~85MB download

### Portable Version
- `GuardianX-Portable-1.0.0.exe`
- No installation needed — just run
- Can be carried on a USB drive
- ~85MB

## Custom URL

By default, the desktop app loads the Vercel deployment:
```
https://guardian-x-git-main-guardianx.vercel.app
```

### Change the URL:

**Option A: Environment variable**
```bash
set GUARDIANX_URL=https://your-custom-url.com
npm start
```

**Option B: Config file**
Create a file at `%APPDATA%/guardianx-desktop/config.json`:
```json
{
  "url": "https://your-custom-url.com"
}
```

## Features

- ✅ Native Windows window (1440×900, resizable)
- ✅ Desktop shortcut + Start Menu entry
- ✅ System tray icon
- ✅ Download manager (VAPT PDFs save to Downloads folder)
- ✅ Zoom controls (Ctrl + / Ctrl - / Ctrl 0)
- ✅ Fullscreen mode (F11)
- ✅ Developer tools (F12)
- ✅ External links open in default browser
- ✅ Auto-updates ready (can be enabled with electron-updater)
- ✅ Security: contextIsolation, sandbox, no Node.js in renderer

## PWA Alternative (no build needed)

GuardianX is also a **Progressive Web App (PWA)**. Users can install it directly from their browser:

### Chrome / Edge:
1. Open https://guardian-x-git-main-guardianx.vercel.app
2. Click the **Install** icon in the address bar (or menu → Install GuardianX)
3. GuardianX appears in Start Menu + Desktop
4. Opens in its own window (no browser chrome)

### Advantages of PWA:
- No download needed
- Auto-updates
- Works offline (service worker)
- Smaller footprint (no Electron runtime)

### Advantages of Electron:
- True .exe installer
- Can be distributed via download/USB
- Doesn't require a browser
- More control over window behavior

## Building from source

```bash
# 1. Clone the repo
git clone https://github.com/ayanalidar/GuardianX.git
cd GuardianX/desktop

# 2. Install dependencies
npm install

# 3. Build the installer
npm run build

# 4. Find the installer in dist/
#    - GuardianX-Setup-1.0.0.exe (installer)
#    - GuardianX-Portable-1.0.0.exe (portable)
```

## License

© 2026 GuardianX. All rights reserved.
