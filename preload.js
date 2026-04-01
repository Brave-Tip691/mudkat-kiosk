const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  navigateTo: (serviceId) => ipcRenderer.send('navigate-to', serviceId),
  goHome: () => ipcRenderer.send('go-home'),
  retryService: (serviceId) => ipcRenderer.send('retry-service', serviceId),
  getDisplayConfig: () => ipcRenderer.invoke('get-display-config'),
  onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_event, data) => cb(data)),
  onServiceActive: (cb) => ipcRenderer.on('service-active', (_event, data) => cb(data)),
  onClockTick: (cb) => ipcRenderer.on('clock-tick', (_event, data) => cb(data)),
  onCarouselState: (cb) => ipcRenderer.on('carousel-state', (_event, data) => cb(data)),
  onUptimeUpdate: (cb) => ipcRenderer.on('uptime-update', (_event, data) => cb(data)),
  onHealthHistory: (cb) => ipcRenderer.on('health-history', (_event, data) => cb(data)),
  onServiceError: (cb) => ipcRenderer.on('service-error', (_event, data) => cb(data)),
  onDimState: (cb) => ipcRenderer.on('dim-state', (_event, data) => cb(data)),
  onMudkatOverview: (cb) => ipcRenderer.on('mudkat-overview', (_event, data) => cb(data)),
  onMudkatAgents: (cb) => ipcRenderer.on('mudkat-agents', (_event, data) => cb(data)),
  onMudkatIoc: (cb) => ipcRenderer.on('mudkat-ioc', (_event, data) => cb(data))
});

window.addEventListener('pointerdown', () => { ipcRenderer.send('activity'); });
window.addEventListener('keydown', () => { ipcRenderer.send('activity'); });
