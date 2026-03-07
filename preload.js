const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  navigateTo: (serviceId) => ipcRenderer.send('navigate-to', serviceId),
  goHome: () => ipcRenderer.send('go-home'),
  getDisplayConfig: () => ipcRenderer.invoke('get-display-config'),
  onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_event, data) => cb(data)),
  onServiceActive: (cb) => ipcRenderer.on('service-active', (_event, data) => cb(data)),
  onClockTick: (cb) => ipcRenderer.on('clock-tick', (_event, data) => cb(data)),
  onCarouselState: (cb) => ipcRenderer.on('carousel-state', (_event, data) => cb(data)),
  onUptimeUpdate: (cb) => ipcRenderer.on('uptime-update', (_event, data) => cb(data))
});

// Report any pointer activity to main process for idle tracking
window.addEventListener('pointerdown', () => {
  ipcRenderer.send('activity');
});
window.addEventListener('keydown', () => {
  ipcRenderer.send('activity');
});
