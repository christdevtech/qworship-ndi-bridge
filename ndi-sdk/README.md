This folder is where the NDI SDK runtime DLL must be placed before building.

## Steps

1. Go to: https://ndi.video/tool/ndi-sdk/
2. Sign in (free account) and download the **NDI SDK for Windows**
3. Run the installer. Default path: `C:\Program Files\NDI\NDI 6 SDK\`
4. Copy **ONE file** from the NDI SDK into this folder:
   ```
   C:\Program Files\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll
   ```
   So this folder should contain:
   ```
   ndi-sdk/
   └── Processing.NDI.Lib.x64.dll
   ```

5. The DLL is automatically bundled into the installer by electron-builder.

## For development (pnpm dev)

The DLL must also be discoverable at runtime. The easiest way is to install
the free **NDI Tools** package from https://ndi.video/tools/ndi-tools/ which
places the runtime DLL on your system PATH automatically.

Alternatively, copy the DLL alongside the `electron.exe` in your node_modules
after running `pnpm install`.
