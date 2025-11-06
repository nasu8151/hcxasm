const { contextBridge, ipcRenderer } = require('electron');

// セキュアなAPIをレンダラープロセスに公開
contextBridge.exposeInMainWorld('electronAPI', {
  saveAssemblyFile: (content) => ipcRenderer.invoke('save-assembly-file', content),
  saveBlocksFile: (content, filePath) => ipcRenderer.invoke('save-blocks-file', content, filePath),
  showLabelDialog: (defaultValue) => ipcRenderer.invoke('show-label-dialog', defaultValue),
  exportAssembledBinary: (assemblyCode) => ipcRenderer.invoke('export-assembled-binary', assemblyCode),
  
  // メニューアクションリスナー
  onMenuAction: (callback) => ipcRenderer.on('menu-action', callback)
});
