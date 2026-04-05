const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  submitWizard: (data) => ipcRenderer.invoke('wizard-submit', data),
});
