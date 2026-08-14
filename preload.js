const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a limited, safe API to the renderer process
 * This maintains security isolation while allowing necessary communication
 */

contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  auth: {
    startLogin: () => ipcRenderer.invoke('auth:start-login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getToken: () => ipcRenderer.invoke('auth:get-token'),
    onSuccess: (callback) => ipcRenderer.on('auth:success', (event, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('auth:error', (event, data) => callback(data))
  },

  // Persistent storage (replaces localStorage for sensitive data)
  storage: {
    set: (key, value) => ipcRenderer.invoke('storage:set', key, value),
    get: (key) => ipcRenderer.invoke('storage:get', key),
    delete: (key) => ipcRenderer.invoke('storage:delete', key)
  },

  // App updates
  updates: {
    checkForUpdates: () => ipcRenderer.invoke('app:check-update')
  },

  // Platform detection
  platform: {
    isElectron: true,
    isDevelopment: process.env.NODE_ENV === 'development'
  }
});
