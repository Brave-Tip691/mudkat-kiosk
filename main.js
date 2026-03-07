const { app, BrowserWindow, BrowserView, ipcMain, net } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Configuration (secrets loaded from config.json)
// ---------------------------------------------------------------------------
let config = {};
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch {
  // config.json missing or invalid -- Pi-hole auto-login will be skipped
}

// ---------------------------------------------------------------------------
// Service definitions (URLs can be overridden in config.json)
// ---------------------------------------------------------------------------
const SERVICES = {
  grafana: {
    name: 'GRAFANA',
    url: config.grafana_url || 'http://localhost:3000',
    pingUrl: 'http://localhost:3000',
    zoom: 0.50
  },
  uptime: {
    name: 'UPTIME KUMA',
    url: config.uptime_url || 'http://localhost:3001/status/default',
    pingUrl: 'http://localhost:3001',
    zoom: 0.50
  },
  pihole: {
    name: 'PI-HOLE',
    url: config.pihole_url || 'http://localhost:80/admin',
    pingUrl: 'http://localhost:80',
    zoom: 0.80
  }
};

const SERVICE_ORDER = ['grafana', 'uptime', 'pihole'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mainWindow = null;
let activeView = null;
let activeServiceId = null;
let state = 'home'; // 'home' | 'service' | 'carousel'

let lastActivity = Date.now();
let idleCheckInterval = null;
let carouselTimer = null;
let carouselIndex = 0;
let clockInterval = null;
let pingInterval = null;

const IDLE_HOME_THRESHOLD = 60000;    // 60s on home -> start carousel
const IDLE_SERVICE_THRESHOLD = 120000; // 120s on service -> go home
const CAROUSEL_ROTATE_MS = 30000;     // 30s per service in carousel

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 480,
    fullscreen: true,
    frame: false,
    kiosk: true,
    backgroundColor: '#1a0a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'dashboard.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// BrowserView lifecycle
// ---------------------------------------------------------------------------
function loadServiceView(serviceId) {
  const service = SERVICES[serviceId];
  if (!service) return;

  destroyActiveView();

  activeServiceId = serviceId;

  activeView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.addBrowserView(activeView);
  activeView.setBounds({ x: 0, y: 48, width: 800, height: 432 });
  activeView.setAutoResize({ width: true, height: true });
  activeView.webContents.loadURL(service.url);

  // After page loads: set zoom and inject pointer-event scroll handler.
  // The Pi DSI touchscreen + --disable-gpu means Chromium delivers input
  // as pointer/mouse events, NOT touch events. Native compositor scrolling
  // is also disabled. We must manually convert pointer drag into scrollTop
  // changes on the nearest scrollable ancestor.
  activeView.webContents.on('did-finish-load', () => {
    activeView.webContents.setZoomFactor(service.zoom);

    activeView.webContents.executeJavaScript(`
      (function() {
        if (window.__mudkatScrollInjected) return;
        window.__mudkatScrollInjected = true;

        // --- CSS: kill text selection and let touch fall through canvases ---
        var s = document.createElement('style');
        s.textContent = [
          '*, *::before, *::after {',
          '  -webkit-user-select: none !important;',
          '  user-select: none !important;',
          '  -webkit-user-drag: none !important;',
          '}',
          // Grafana canvas panels eat pointer events -- punch through
          '.react-grid-item canvas,',
          '.panel-container canvas,',
          '[class*="panel"] canvas {',
          '  pointer-events: none !important;',
          '}'
        ].join('\\n');
        document.head.appendChild(s);

        // --- Pointer-event scroll handler ---
        var activeId = null;   // pointerId we are tracking
        var startY = 0;
        var startX = 0;
        var scrollEl = null;   // resolved on each pointerdown
        var isScrolling = false;
        var THRESHOLD = 8;     // px dead-zone before scroll engages

        // Walk up from target to find first vertically-scrollable ancestor
        function findScrollable(el) {
          while (el && el !== document.body && el !== document.documentElement) {
            if (el.scrollHeight > el.clientHeight + 1) {
              var ov = getComputedStyle(el).overflowY;
              if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') return el;
            }
            el = el.parentElement;
          }
          var root = document.scrollingElement || document.documentElement;
          return (root.scrollHeight > root.clientHeight + 1) ? root : document.body;
        }

        document.addEventListener('pointerdown', function(e) {
          if (e.button && e.button !== 0) return;
          activeId = e.pointerId;
          startY = e.clientY;
          startX = e.clientX;
          scrollEl = findScrollable(e.target);
          isScrolling = false;
        }, { capture: true, passive: true });

        document.addEventListener('pointermove', function(e) {
          if (e.pointerId !== activeId || !scrollEl) return;
          var dy = startY - e.clientY;
          var dx = startX - e.clientX;

          if (!isScrolling) {
            // Only engage if vertical movement exceeds threshold and dominates
            if (Math.abs(dy) < THRESHOLD) return;
            if (Math.abs(dy) < Math.abs(dx)) return;
            isScrolling = true;
          }

          scrollEl.scrollTop += dy;
          startY = e.clientY;
          startX = e.clientX;
          e.preventDefault();   // suppress text selection / default drag
          e.stopPropagation();
        }, { capture: true, passive: false });

        document.addEventListener('pointerup', function(e) {
          if (e.pointerId !== activeId) return;
          var wasScrolling = isScrolling;
          activeId = null;
          scrollEl = null;
          isScrolling = false;
          if (wasScrolling) {
            // Eat the click that follows a scroll gesture
            window.addEventListener('click', function trap(ev) {
              ev.stopPropagation();
              ev.preventDefault();
              window.removeEventListener('click', trap, true);
            }, { capture: true });
          }
        }, { capture: true });

        // Also handle touchstart/touchmove/touchend as a fallback in case
        // the kernel driver ever delivers real touch events
        var tStartY = 0;
        var tScrollEl = null;
        var tScrolling = false;

        document.addEventListener('touchstart', function(e) {
          if (e.touches.length !== 1) return;
          tStartY = e.touches[0].clientY;
          tScrollEl = findScrollable(e.target);
          tScrolling = false;
        }, { capture: true, passive: true });

        document.addEventListener('touchmove', function(e) {
          if (!tScrollEl || e.touches.length !== 1) return;
          var dy = tStartY - e.touches[0].clientY;
          if (!tScrolling && Math.abs(dy) < THRESHOLD) return;
          tScrolling = true;
          tScrollEl.scrollTop += dy;
          tStartY = e.touches[0].clientY;
          e.preventDefault();
        }, { capture: true, passive: false });

        document.addEventListener('touchend', function() {
          tScrollEl = null;
          tScrolling = false;
        }, { capture: true, passive: true });
      })();
    `).catch(function() {});

    // --- On-screen keyboard injection ---
    activeView.webContents.executeJavaScript(`
      (function() {
        if (window.__mudkatKBInjected) return;
        window.__mudkatKBInjected = true;

        var ALPHA = 'q|w|e|r|t|y|u|i|o|p;a|s|d|f|g|h|j|k|l;SHIFT|z|x|c|v|b|n|m|BKSP;NUM|,|SPACE|.|ENTER|DONE';
        var NUMS = '1|2|3|4|5|6|7|8|9|0;@|#|$|_|&|-|+|(|);!|?|/|*|:|;|=|%|BKSP;ABC|,|SPACE|.|ENTER|DONE';
        var SPEC = {
          SHIFT: ['\\u21e7','special w15'], BKSP: ['\\u232b','special w15'],
          SPACE: ['','space'], ENTER: ['\\u21b5','special w12'],
          DONE: ['DONE','special w12'], NUM: ['123','special w12'], ABC: ['ABC','special w12']
        };
        var shifted = false, numMode = false;

        var css = document.createElement('style');
        css.textContent = [
          'input,textarea,[contenteditable="true"]{-webkit-user-select:text!important;user-select:text!important}',
          '.__mkb{position:fixed;bottom:0;left:0;width:100%;z-index:999999;background:#1a0a2e;border-top:1px solid rgba(0,212,255,0.4);padding:6px;display:none;box-sizing:border-box}',
          '.__mkb.visible{display:block}',
          '.__mkb-r{display:flex;gap:4px;margin-bottom:4px}.__mkb-r:last-child{margin-bottom:0}',
          '.__mkb-k{flex:1;height:44px;display:flex;align-items:center;justify-content:center;background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.25);border-radius:4px;color:#00d4ff;font-family:monospace;font-size:16px;cursor:pointer;-webkit-user-select:none;user-select:none;touch-action:manipulation}',
          '.__mkb-k.active{background:rgba(0,212,255,0.3);border-color:rgba(0,212,255,0.6)}',
          '.__mkb-k.special{background:rgba(0,212,255,0.15);font-size:13px}',
          '.__mkb-k.space{flex:4}.__mkb-k.w15{flex:1.5}.__mkb-k.w12{flex:1.2}',
          '.__mkb-k.on{color:#1a0a2e;background:#00d4ff}'
        ].join('\\n');
        document.head.appendChild(css);

        var kb = document.createElement('div');
        kb.className = '__mkb';

        function build() {
          kb.innerHTML = '';
          (numMode ? NUMS : ALPHA).split(';').forEach(function(row) {
            var r = document.createElement('div');
            r.className = '__mkb-r';
            row.split('|').forEach(function(k) {
              var b = document.createElement('div');
              b.className = '__mkb-k';
              var sp = SPEC[k];
              if (sp) {
                b.textContent = sp[0];
                b.dataset.a = k;
                b.className += ' ' + sp[1];
                if (k === 'SHIFT' && shifted) b.className += ' on';
              } else {
                var ch = shifted ? k.toUpperCase() : k;
                b.textContent = ch;
                b.dataset.a = 'c';
                b.dataset.c = ch;
              }
              r.appendChild(b);
            });
            kb.appendChild(r);
          });
        }
        build();
        document.body.appendChild(kb);

        function isTI(el) {
          if (!el) return false;
          if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
          if (el.tagName === 'INPUT') {
            var t = (el.type || 'text').toLowerCase();
            return 'hidden checkbox radio file submit button reset range color image'.split(' ').indexOf(t) < 0;
          }
          return false;
        }
        function tgt() { var el = document.activeElement; return isTI(el) ? el : null; }

        function setVal(el, v, cur) {
          try {
            var p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v);
          } catch(x) { el.value = v; }
          el.selectionStart = el.selectionEnd = cur;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function typeC(ch) {
          var el = tgt(); if (!el) return;
          el.focus();
          if (el.isContentEditable) { document.execCommand('insertText', false, ch); return; }
          var s = el.selectionStart || 0, e = el.selectionEnd || 0;
          setVal(el, el.value.slice(0, s) + ch + el.value.slice(e), s + ch.length);
        }

        function bksp() {
          var el = tgt(); if (!el) return;
          el.focus();
          if (el.isContentEditable) { document.execCommand('delete', false); return; }
          var s = el.selectionStart || 0, e = el.selectionEnd || 0, v = el.value;
          if (s !== e) setVal(el, v.slice(0, s) + v.slice(e), s);
          else if (s > 0) setVal(el, v.slice(0, s - 1) + v.slice(e), s - 1);
        }

        function enterK() {
          var el = tgt(); if (!el) return;
          if (el.tagName === 'TEXTAREA') { typeC('\\n'); return; }
          var f = el.closest('form');
          if (f) { var sb = f.querySelector('[type="submit"]'); sb ? sb.click() : (f.requestSubmit ? f.requestSubmit() : f.submit()); return; }
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }

        kb.addEventListener('pointerdown', function(e) {
          e.preventDefault();
          var k = e.target.closest('.__mkb-k');
          if (!k) return;
          k.classList.add('active');
          var a = k.dataset.a;
          if (a === 'c') { typeC(k.dataset.c); if (shifted) { shifted = false; build(); } }
          else if (a === 'BKSP') bksp();
          else if (a === 'SPACE') typeC(' ');
          else if (a === 'ENTER') enterK();
          else if (a === 'SHIFT') { shifted = !shifted; build(); }
          else if (a === 'NUM') { numMode = true; build(); }
          else if (a === 'ABC') { numMode = false; build(); }
          else if (a === 'DONE') { kb.classList.remove('visible'); if (document.activeElement) document.activeElement.blur(); }
        });
        kb.addEventListener('pointerup', function(e) {
          e.preventDefault();
          var k = e.target.closest('.__mkb-k');
          if (k) k.classList.remove('active');
        });

        document.addEventListener('focusin', function(e) {
          if (isTI(e.target)) {
            kb.classList.add('visible');
            try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch(x) {}
          }
        }, true);
        document.addEventListener('focusout', function() {
          setTimeout(function() { if (!isTI(document.activeElement)) kb.classList.remove('visible'); }, 200);
        }, true);
      })();
    `).catch(function() {});

    // Pi-hole auto-login: runs on every did-finish-load because Pi-hole
    // redirects to /admin/login after the initial navigation
    if (activeServiceId === 'pihole' && config.pihole_password) {
      const url = activeView.webContents.getURL();
      if (url === 'http://localhost/admin/login') {
        const escapedPw = config.pihole_password.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        activeView.webContents.executeJavaScript(`
  (function() {
    var pw = document.getElementById('loginword')
           || document.getElementById('inputpassword')
           || document.querySelector('input[type="password"]');
    if (pw) {
      pw.value = '${escapedPw}';
      pw.dispatchEvent(new Event('input', { bubbles: true }));
      pw.dispatchEvent(new Event('change', { bubbles: true }));
      var form = pw.closest('form');
      if (form) form.submit();
    }
  })();
`).catch(function() {});
      }
    }
  });

  // Notify dashboard of active service
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('service-active', service.name);
  }
}

function destroyActiveView() {
  if (activeView) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeBrowserView(activeView);
    }
    activeView.webContents.destroy();
    activeView = null;
  }
  activeServiceId = null;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function goHome() {
  stopCarousel();
  destroyActiveView();
  state = 'home';

  // Notify dashboard: no active service, carousel off
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('service-active', null);
    mainWindow.webContents.send('carousel-state', false);
  }
}

function navigateToService(serviceId) {
  stopCarousel();
  state = 'service';
  loadServiceView(serviceId);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('carousel-state', false);
  }
}

// ---------------------------------------------------------------------------
// Carousel
// ---------------------------------------------------------------------------
function startCarousel() {
  if (state === 'carousel') return;
  state = 'carousel';
  carouselIndex = 0;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('carousel-state', true);
  }

  loadServiceView(SERVICE_ORDER[carouselIndex]);

  carouselTimer = setInterval(() => {
    carouselIndex = (carouselIndex + 1) % SERVICE_ORDER.length;
    loadServiceView(SERVICE_ORDER[carouselIndex]);
  }, CAROUSEL_ROTATE_MS);
}

function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer);
    carouselTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Activity / idle tracking
// ---------------------------------------------------------------------------
function recordActivity() {
  lastActivity = Date.now();
}

function checkIdle() {
  const idle = Date.now() - lastActivity;

  if (state === 'home' && idle >= IDLE_HOME_THRESHOLD) {
    startCarousel();
  } else if (state === 'service' && idle >= IDLE_SERVICE_THRESHOLD) {
    goHome();
  } else if (state === 'carousel' && idle < IDLE_HOME_THRESHOLD) {
    // Activity happened during carousel -- return home
    goHome();
  }
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
function startClock() {
  const tick = () => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    const date = now.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const payload = { time, date };

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('clock-tick', payload);
    }
  };

  tick();
  clockInterval = setInterval(tick, 1000);
}

// ---------------------------------------------------------------------------
// Service pinging
// ---------------------------------------------------------------------------
function pingService(url) {
  return new Promise((resolve) => {
    const start = Date.now();

    try {
      const request = net.request({ url, method: 'HEAD' });

      const timeout = setTimeout(() => {
        request.abort();
        resolve('offline');
      }, 5000);

      request.on('response', () => {
        clearTimeout(timeout);
        const elapsed = Date.now() - start;
        if (elapsed < 500) resolve('online');
        else if (elapsed < 2000) resolve('slow');
        else resolve('slow');
      });

      request.on('error', () => {
        clearTimeout(timeout);
        resolve('offline');
      });

      request.end();
    } catch {
      resolve('offline');
    }
  });
}

async function pingAllServices() {
  const [grafana, uptime, pihole] = await Promise.all([
    pingService(SERVICES.grafana.pingUrl),
    pingService(SERVICES.uptime.pingUrl),
    pingService(SERVICES.pihole.pingUrl)
  ]);

  const status = { grafana, uptime, pihole };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-update', status);
  }
}

function startPinging() {
  pingAllServices();
  pingInterval = setInterval(pingAllServices, 30000);
}

// ---------------------------------------------------------------------------
// Uptime helper (sent with status)
// ---------------------------------------------------------------------------
function getSystemUptime() {
  const totalSeconds = os.uptime();
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// We send uptime as part of clock-tick for simplicity
function startUptimeBroadcast() {
  const send = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('uptime-update', getSystemUptime());
    }
  };
  send();
  setInterval(send, 60000);
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function setupIPC() {
  ipcMain.on('navigate-to', (_event, serviceId) => {
    recordActivity();
    navigateToService(serviceId);
  });

  ipcMain.on('go-home', () => {
    recordActivity();
    goHome();
  });

  ipcMain.handle('get-display-config', () => ({
    ip: config.display_ip || '192.168.x.x',
    gateway: config.display_gateway || '192.168.x.x'
  }));

  ipcMain.on('activity', () => {
    recordActivity();
    // Immediately exit carousel on any touch
    if (state === 'carousel') {
      goHome();
    }
  });
}

// ---------------------------------------------------------------------------
// Chromium flags for touch support on Pi DSI touchscreen
// ---------------------------------------------------------------------------
app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('enable-pointer-events');

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createMainWindow();
  setupIPC();
  startClock();
  startPinging();
  startUptimeBroadcast();

  // Check idle state every 5 seconds
  idleCheckInterval = setInterval(checkIdle, 5000);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (clockInterval) clearInterval(clockInterval);
  if (pingInterval) clearInterval(pingInterval);
  if (idleCheckInterval) clearInterval(idleCheckInterval);
  stopCarousel();
});
