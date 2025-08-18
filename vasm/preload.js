const { contextBridge, ipcRenderer } = require('electron');

// セキュアなAPIをレンダラープロセスに公開
contextBridge.exposeInMainWorld('electronAPI', {
  saveAssemblyFile: (content) => ipcRenderer.invoke('save-assembly-file', content)
});
