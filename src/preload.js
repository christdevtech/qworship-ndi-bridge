'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Exposes a minimal, typed API to the renderer.
 * Never expose the full ipcRenderer — this is the security boundary.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Streaming
  startStream:     (sources) => ipcRenderer.invoke('start-stream', sources),
  stopStream:      ()        => ipcRenderer.invoke('stop-stream'),
  refreshSources:  (sources) => ipcRenderer.invoke('refresh-sources', sources),
  getSavedSources: ()        => ipcRenderer.invoke('get-saved-sources'),
  openExternal:    (url)     => ipcRenderer.invoke('open-external', url),

  // Stats push from main → renderer
  onStatsUpdate: (callback) => {
    ipcRenderer.on('stats-update', (_event, data) => callback(data));
  },

  // Window chrome
  minimize:  () => ipcRenderer.send('window-minimize'),
  maximize:  () => ipcRenderer.send('window-maximize'),
  close:     () => ipcRenderer.send('window-close'),
});
