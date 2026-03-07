// ---------------------------------------------------------------------------
// Dashboard renderer
// ---------------------------------------------------------------------------

const clockEl = document.getElementById('clock');
const svcClockEl = document.getElementById('svc-clock');
const uptimeEl = document.getElementById('uptime-display');
const tiles = document.querySelectorAll('.tile');
const serviceBar = document.getElementById('service-bar');
const serviceNameEl = document.getElementById('service-name');
const homeBtn = document.getElementById('home-btn');
const homeContent = document.getElementById('home-content');

const STATUS_LABELS = {
  online: 'ONLINE',
  slow: 'SLOW',
  offline: 'OFFLINE'
};

// ---- Display config (IPs from config.json) ----
window.api.getDisplayConfig().then((cfg) => {
  document.getElementById('display-ip').textContent = `PI: ${cfg.ip}`;
  document.getElementById('display-gw').textContent = `GW: ${cfg.gateway}`;
});

// ---- Clock ----
window.api.onClockTick((data) => {
  clockEl.textContent = data.time;
  svcClockEl.textContent = data.time;
});

// ---- Uptime ----
window.api.onUptimeUpdate((uptime) => {
  uptimeEl.textContent = `UPTIME: ${uptime}`;
});

// ---- Status updates ----
window.api.onStatusUpdate((status) => {
  updateDot('grafana', status.grafana);
  updateDot('uptime', status.uptime);
  updateDot('pihole', status.pihole);
});

function updateDot(service, state) {
  const dot = document.getElementById(`dot-${service}`);
  const label = document.getElementById(`label-${service}`);
  if (!dot || !label) return;

  dot.className = 'status-dot';
  if (state) {
    dot.classList.add(state);
    label.textContent = STATUS_LABELS[state] || state.toUpperCase();
  }
}

// ---- Tile tap handling ----
tiles.forEach((tile) => {
  tile.addEventListener('pointerdown', () => {
    const serviceId = tile.dataset.service;
    if (!serviceId) return;

    // Flash effect
    tile.classList.add('flash');
    setTimeout(() => tile.classList.remove('flash'), 200);

    window.api.navigateTo(serviceId);
  });
});

// ---- Service active state (show/hide overlay top bar) ----
window.api.onServiceActive((name) => {
  if (name) {
    serviceNameEl.textContent = name;
    serviceBar.classList.add('visible');
    homeContent.classList.add('hidden');
  } else {
    serviceNameEl.textContent = '';
    serviceBar.classList.remove('visible');
    homeContent.classList.remove('hidden');
  }
});

// ---- HOME button ----
homeBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  window.api.goHome();
});

// ---- Carousel state ----
window.api.onCarouselState((isCarousel) => {
  // No visual indicator needed
});
