const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pingo', {
  onEvent: (fn) => ipcRenderer.on('pingo:event', (_e, event) => fn(event)),
  ready: () => ipcRenderer.send('pingo:ready'),
  setInteractive: (on) => ipcRenderer.send('pingo:interactive', !!on),
  waterDone: () => ipcRenderer.send('pingo:water-done'),
  waterSnooze: () => ipcRenderer.send('pingo:water-snooze'),
  faceCheck: (frames) => ipcRenderer.invoke('face:check', frames),
});
