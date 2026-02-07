const { contextBridge, ipcRenderer } = require('electron');

// セキュアなAPIをレンダラープロセスに公開
contextBridge.exposeInMainWorld('electronAPI', {
  saveAssemblyFile: (content) => ipcRenderer.invoke('save-assembly-file', content),
  saveBlocksFile: (content, filePath) => ipcRenderer.invoke('save-blocks-file', content, filePath),
  showLabelDialog: (defaultValue) => ipcRenderer.invoke('show-label-dialog', defaultValue),
  exportAssembledBinary: (assemblyCode, architecture) => ipcRenderer.invoke('export-assembled-binary', assemblyCode, architecture),
  uploadToDevice: (assemblyCode, architecture) => ipcRenderer.invoke('upload-to-device', assemblyCode, architecture),
  fetchRegisters: () => ipcRenderer.invoke('fetch-registers'),
  startTrace: () => ipcRenderer.invoke('start-trace'),
  stopTrace: () => ipcRenderer.invoke('stop-trace'),
  setWorkspaceDirty: (isDirty) => ipcRenderer.send('workspace-dirty', isDirty),
  
  // メニューアクションリスナー
  onMenuAction: (callback) => ipcRenderer.on('menu-action', callback),
  // COMポート通知
  onComPorts: (callback) => ipcRenderer.on('com-ports', (e, ports) => callback(ports)),
  onComPortSelected: (callback) => ipcRenderer.on('com-port-selected', (e, port) => callback(port)),
  // トレース通知
  onTraceUpdate: (callback) => ipcRenderer.on('trace-update', (e, data) => callback(data)),
  onTraceStopped: (callback) => ipcRenderer.on('trace-stopped', (e, info) => callback(info)),
  onTraceError: (callback) => ipcRenderer.on('trace-error', (e, msg) => callback(msg))
});
