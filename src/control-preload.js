const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pingoControl', {
  get: () => ipcRenderer.invoke('control:get'),
  set: (patch) => ipcRenderer.send('control:set', patch),
  action: (name) => ipcRenderer.send('control:action', name),
  onState: (fn) => ipcRenderer.on('control:state', (_e, s) => fn(s)),
  faceEnrollBegin: () => ipcRenderer.invoke('face:enroll-begin'),
  faceEnrollFrame: (frame, capture) => ipcRenderer.invoke('face:enroll-frame', frame, capture),
  faceEnrollSave: () => ipcRenderer.invoke('face:enroll-save'),
  faceEnrollCancel: () => ipcRenderer.send('face:enroll-cancel'),
  faceCheck: (frames) => ipcRenderer.invoke('face:check', frames),
  faceDelete: () => ipcRenderer.invoke('face:delete'),
});
