import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/schema';
const api: DesktopAPI = {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  save: resume => ipcRenderer.invoke('resume:save', resume),
  remove: id => ipcRenderer.invoke('resume:remove', id),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  exportBackup: resume => ipcRenderer.invoke('backup:export', resume),
  choosePhoto: () => ipcRenderer.invoke('photo:choose'),
  pdf: resume => ipcRenderer.invoke('pdf:preview', resume),
  savePdf: resume => ipcRenderer.invoke('pdf:save', resume),
  saveConfig: config => ipcRenderer.invoke('model:save', config),
  clearKey: () => ipcRenderer.invoke('model:clear'),
  testConnection: () => ipcRenderer.invoke('model:test'),
  ai: request => ipcRenderer.invoke('ai:start', request),
  cancel: requestId => ipcRenderer.invoke('ai:cancel', requestId),
  onClose: callback => { const handler = () => callback(); ipcRenderer.on('app:closing', handler); return () => ipcRenderer.removeListener('app:closing', handler); },
  closeReady: success => ipcRenderer.send('app:close-ready', success)
};
contextBridge.exposeInMainWorld('desktop', api);
