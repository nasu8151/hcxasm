const { contextBridge, ipcRenderer } = require('electron');

// セキュアなAPIをレンダラープロセスに公開
contextBridge.exposeInMainWorld('electronAPI', {
  saveAssemblyFile: (content) => ipcRenderer.invoke('save-assembly-file', content),
  showLabelDialog: (defaultValue) => ipcRenderer.invoke('show-label-dialog', defaultValue)
});
