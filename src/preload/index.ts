import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('anti_recall', {
  clearDb: () => ipcRenderer.invoke('LiteLoader.anti_recall.clearDb'),
  getNowConfig: () => ipcRenderer.invoke('LiteLoader.anti_recall.getNowConfig'),
  getStorageStatus: () => ipcRenderer.invoke('LiteLoader.anti_recall.getStorageStatus'),
  saveConfig: (newConfig: unknown) => ipcRenderer.invoke('LiteLoader.anti_recall.saveConfig', newConfig),

  repatchCss: (callback: () => void) => ipcRenderer.on('LiteLoader.anti_recall.mainWindow.repatchCss', callback),
  recallTip: (callback: (_event: unknown, msgId: string) => void) =>
    ipcRenderer.on('LiteLoader.anti_recall.mainWindow.recallTip', callback),
  recallTipList: (callback: (_event: unknown, msgIds: string[]) => void) =>
    ipcRenderer.on('LiteLoader.anti_recall.mainWindow.recallTipList', callback),
});