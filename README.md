# QWorship NDI Bridge

> A desktop application that turns two browser sources into NDI streams on your local network.

## Quick Start

### Prerequisites (dev machine only)

- [Node.js 20+](https://nodejs.org)
- [pnpm](https://pnpm.io) — `npm install -g pnpm`
- [NDI Tools](https://ndi.video/tools/ndi-tools/) installed (provides the NDI runtime DLL)
- Windows SDK / MSVC Build Tools (for compiling the `grandiose` native addon)

### Install & Run

```bash
pnpm install
pnpm run rebuild   # rebuilds grandiose against Electron's Node ABI
pnpm dev           # launches the app
```

### NDI SDK DLL

Read `ndi-sdk/README.md` for instructions on placing the NDI runtime DLL.

---

## Building the Installer

```bash
pnpm run dist
```

Output: `dist/QWorship NDI Bridge Setup x.x.x.exe`

The installer is fully self-contained — end users need **no prerequisites**.

---

## Adding Your Favicon

1. Place your icon file (`.ico` for Windows) at `src/assets/icon.ico`
2. Un-comment the `<link rel="icon">` line in `src/renderer/index.html`
3. The same file is auto-picked up by electron-builder for the `.exe` icon

---

## Architecture

```
src/
├── main.js          ← Electron main process (hidden windows, IPC, stats)
├── ndi-manager.js   ← NDI sender wrapper (grandiose)
├── preload.js       ← Context bridge (renderer ↔ main)
└── renderer/
    └── index.html   ← UI (dark theme, Tailwind CDN)
ndi-sdk/             ← Drop Processing.NDI.Lib.x64.dll here before building
```

## How It Works

1. User enters a URL and NDI name for each of the two sources
2. Clicking **Start All Streams** creates two hidden offscreen `BrowserWindow`s
3. Each window's `paint` event fires ~60×/s, delivering a raw BGRA frame
4. `NdiManager` forwards each frame to a `grandiose` NDI sender
5. Any NDI-capable software on the same network can receive the streams by name
