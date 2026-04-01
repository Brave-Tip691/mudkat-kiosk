/* ========================================================================
   MUDKAT COMMAND — Sub-Mind Terminal Renderer
   ======================================================================== */

var $ = function(id) { return document.getElementById(id); };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
var THREAT_SEGS = ['tseg-1','tseg-2','tseg-3','tseg-4','tseg-5'];
var THREAT_COLORS = ['g','yg','y','o','r'];
var CORE_COLORS = {
  nominal:  { dot: '#5a9a4a', glow: '#5a9a4a', label: 'NOMINAL' },
  guarded:  { dot: '#8ab53a', glow: '#8ab53a', label: 'GUARDED' },
  elevated: { dot: '#e8a33c', glow: '#e8a33c', label: 'ELEVATED' },
  high:     { dot: '#ff6b2b', glow: '#ff6b2b', label: 'HIGH' },
  critical: { dot: '#c03020', glow: '#c03020', label: 'CRITICAL' }
};

var PARTICLE_COUNT = 35;

// ---------------------------------------------------------------------------
// Particle system
// ---------------------------------------------------------------------------
(function initParticles() {
  var canvas = $('particles');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 800, H = 480;
  var particles = [];

  function spawn() {
    return {
      x: Math.random() * W,
      y: H + Math.random() * 20,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(0.3 + Math.random() * 0.7),
      r: 0.5 + Math.random() * 1.5,
      a: 0.2 + Math.random() * 0.5,
      spark: Math.random() < 0.08
    };
  }

  for (var i = 0; i < PARTICLE_COUNT; i++) {
    var p = spawn();
    p.y = Math.random() * H;
    particles.push(p);
  }

  setInterval(function() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.a -= 0.002;

      if (p.y < -10 || p.a <= 0) {
        particles[i] = spawn();
        continue;
      }

      if (p.spark) {
        ctx.fillStyle = 'rgba(232,163,60,' + (p.a * 1.5) + ')';
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(196,122,42,' + p.a + ')';
        ctx.fill();
      }
    }
  }, 50);
})();

// ---------------------------------------------------------------------------
// Anti-burn-in
// ---------------------------------------------------------------------------
(function initAntiBurnIn() {
  var shift = $('shift');
  if (!shift) return;

  // Pixel shift every 2 minutes
  setInterval(function() {
    var dx = Math.round((Math.random() - 0.5) * 4);
    var dy = Math.round((Math.random() - 0.5) * 4);
    shift.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }, 120000);

  // Invisible background color toggle every 5 minutes
  var toggle = false;
  setInterval(function() {
    toggle = !toggle;
    document.body.style.backgroundColor = toggle ? '#0d0a0f' : '#0d0a0e';
  }, 300000);
})();

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------
function animateValue(el, newVal) {
  if (!el) return;
  var current = parseInt(el.textContent, 10);
  if (isNaN(current)) current = 0;
  var target = parseInt(newVal, 10);
  if (isNaN(target)) { el.textContent = newVal; return; }
  if (current === target) return;

  var diff = target - current;
  var steps = Math.min(Math.abs(diff), 20);
  var stepTime = Math.round(500 / steps);
  var increment = diff > 0 ? Math.ceil(diff / steps) : Math.floor(diff / steps);
  var count = 0;

  var iv = setInterval(function() {
    count++;
    current += increment;
    if ((diff > 0 && current >= target) || (diff < 0 && current <= target) || count >= steps) {
      current = target;
      clearInterval(iv);
    }
    el.textContent = current;
  }, stepTime);
}

// ---------------------------------------------------------------------------
// Time ago helper
// ---------------------------------------------------------------------------
function timeAgo(isoString) {
  if (!isoString) return '--';
  try {
    var diff = (Date.now() - new Date(isoString).getTime()) / 1000;
    if (diff < 0) diff = 0;
    if (diff < 60) return Math.round(diff) + 's';
    if (diff < 3600) return Math.round(diff / 60) + 'm';
    if (diff < 86400) return Math.round(diff / 3600) + 'h';
    return Math.round(diff / 86400) + 'd';
  } catch(e) { return '--'; }
}

// ---------------------------------------------------------------------------
// Threat level computation
// ---------------------------------------------------------------------------
function computeThreatLevel(overview) {
  if (!overview) return { level: 0, label: 'NOMINAL', key: 'nominal' };

  var crit = 0, high = 0, med = 0;
  if (overview.severity_counts) {
    crit = overview.severity_counts.critical || 0;
    high = overview.severity_counts.high || 0;
    med  = overview.severity_counts.medium || 0;
  }

  if (crit > 0) return { level: 5, label: 'CRITICAL', key: 'critical' };
  if (high > 5) return { level: 4, label: 'HIGH', key: 'high' };
  if (high > 0) return { level: 3, label: 'ELEVATED', key: 'elevated' };
  if (med > 5)  return { level: 2, label: 'GUARDED', key: 'guarded' };
  return { level: 1, label: 'NOMINAL', key: 'nominal' };
}

// ---------------------------------------------------------------------------
// Threat display update
// ---------------------------------------------------------------------------
function updateThreatDisplay(threat) {
  // Update segments
  for (var i = 0; i < THREAT_SEGS.length; i++) {
    var seg = $(THREAT_SEGS[i]);
    if (!seg) continue;
    seg.className = 'seg';
    if (i < threat.level) {
      seg.classList.add(THREAT_COLORS[i]);
    }
  }

  // Update label
  var label = $('threat-label');
  if (label) {
    label.textContent = threat.label;
    var colors = CORE_COLORS[threat.key] || CORE_COLORS.nominal;
    label.style.color = colors.dot;
  }

  // Update core dot
  var dot = $('core-dot');
  if (dot) {
    dot.setAttribute('fill', (CORE_COLORS[threat.key] || CORE_COLORS.nominal).dot);
  }

  // Update glow gradient
  var glow = document.getElementById('glow');
  if (glow) {
    var stops = glow.querySelectorAll('stop');
    var c = (CORE_COLORS[threat.key] || CORE_COLORS.nominal).glow;
    if (stops[0]) stops[0].setAttribute('stop-color', c);
    if (stops[1]) stops[1].setAttribute('stop-color', c);
  }
}

// ---------------------------------------------------------------------------
// IPC: Clock
// ---------------------------------------------------------------------------
window.api.onClockTick(function(data) {
  var ct = $('clock-time');
  var cd = $('clock-date');
  var sc = $('svc-clock');
  if (ct) ct.textContent = data.time;
  if (cd) cd.textContent = data.date;
  if (sc) sc.textContent = data.time;
});

// ---------------------------------------------------------------------------
// IPC: Uptime
// ---------------------------------------------------------------------------
window.api.onUptimeUpdate(function(data) {
  var el = $('uptime-display');
  if (el) el.textContent = data;
});

// ---------------------------------------------------------------------------
// IPC: Display config
// ---------------------------------------------------------------------------
window.api.getDisplayConfig().then(function(cfg) {
  var el = $('display-ip');
  if (el && cfg && cfg.ip) el.textContent = cfg.ip;
});

// ---------------------------------------------------------------------------
// IPC: Service status
// ---------------------------------------------------------------------------
window.api.onStatusUpdate(function(data) {
  var services = ['grafana','soc','uptime','pihole','mudkat'];
  for (var i = 0; i < services.length; i++) {
    var key = services[i];
    var el = $('sdot-' + key);
    if (!el || !data[key]) continue;
    el.className = 'svc ' + data[key];
  }
});

// ---------------------------------------------------------------------------
// IPC: MUDKAT Overview
// ---------------------------------------------------------------------------
window.api.onMudkatOverview(function(data) {
  if (!data) return;

  // Device counts
  if (data.device_count !== undefined) animateValue($('stat-devices'), data.device_count);
  if (data.online_count !== undefined) animateValue($('stat-online'), data.online_count);
  if (data.finding_count !== undefined) animateValue($('stat-findings'), data.finding_count);

  // Severity counts
  if (data.severity_counts) {
    animateValue($('sev-crit'), data.severity_counts.critical || 0);
    animateValue($('sev-high'), data.severity_counts.high || 0);
    animateValue($('sev-med'), data.severity_counts.medium || 0);
    animateValue($('sev-low'), data.severity_counts.low || 0);
  }

  // Scan info
  if (data.last_scan) {
    var si = $('scan-info');
    if (si) si.textContent = timeAgo(data.last_scan);
  }

  // Threat level
  var threat = computeThreatLevel(data);
  updateThreatDisplay(threat);
});

// ---------------------------------------------------------------------------
// IPC: MUDKAT Agents
// ---------------------------------------------------------------------------
window.api.onMudkatAgents(function(data) {
  if (!data) return;

  var agents = Array.isArray(data) ? data : (data.agents || []);
  var list = $('agent-list');
  var badge = $('agent-badge');
  var summary = $('fleet-summary');

  if (list && agents.length > 0) {
    var html = '';
    var shown = agents.slice(0, 4);
    for (var i = 0; i < shown.length; i++) {
      var a = shown[i];
      var st = (a.status || 'unknown').toLowerCase();
      var cls = 'agent-row';
      if (st === 'running' || st === 'active') cls += ' active';
      else if (st === 'idle' || st === 'waiting') cls += ' idle';
      else if (st === 'error' || st === 'failed') cls += ' error';

      var name = a.name || a.agent_type || ('Agent ' + (i + 1));
      var statusText = a.status || '--';

      html += '<div class="' + cls + '">';
      html += '<div class="agent-dot"></div>';
      html += '<div class="agent-name">' + name + '</div>';
      html += '<div class="agent-status">' + statusText + '</div>';
      html += '</div>';
    }
    list.innerHTML = html;
  }

  if (badge) animateValue(badge, agents.length);

  if (summary) {
    var active = 0, idle = 0, err = 0;
    for (var j = 0; j < agents.length; j++) {
      var s = (agents[j].status || '').toLowerCase();
      if (s === 'running' || s === 'active') active++;
      else if (s === 'error' || s === 'failed') err++;
      else idle++;
    }
    summary.textContent = active + ' RUN / ' + idle + ' IDLE / ' + err + ' ERR';
  }
});

// ---------------------------------------------------------------------------
// IPC: MUDKAT IOC
// ---------------------------------------------------------------------------
window.api.onMudkatIoc(function(data) {
  if (!data) return;
  if (data.count !== undefined) animateValue($('ioc-count'), data.count);
  if (data.hits !== undefined) {
    var h = $('ioc-hits');
    if (h) h.textContent = data.hits;
  }
  if (data.last_hunt) {
    var l = $('ioc-last');
    if (l) l.textContent = timeAgo(data.last_hunt);
  }
});

// ---------------------------------------------------------------------------
// Drill-down navigation
// ---------------------------------------------------------------------------
document.querySelectorAll('[data-drill]').forEach(function(el) {
  el.addEventListener('pointerdown', function(e) {
    var target = el.getAttribute('data-drill');
    if (target) window.api.navigateTo(target);
  });
});

// ---------------------------------------------------------------------------
// Service dot navigation
// ---------------------------------------------------------------------------
document.querySelectorAll('.svc[data-service]').forEach(function(el) {
  el.addEventListener('pointerdown', function(e) {
    var service = el.getAttribute('data-service');
    if (service) window.api.navigateTo(service);
  });
});

// ---------------------------------------------------------------------------
// Service overlay
// ---------------------------------------------------------------------------
window.api.onServiceActive(function(name) {
  var bar = $('service-bar');
  var sn = $('service-name');
  var home = $('home-content');

  if (name) {
    if (bar) bar.classList.add('active');
    if (sn) sn.textContent = name;
    if (home) home.style.display = 'none';
  } else {
    if (bar) bar.classList.remove('active');
    if (home) home.style.display = '';
  }
});

// ---------------------------------------------------------------------------
// Home button
// ---------------------------------------------------------------------------
(function() {
  var btn = $('home-btn');
  if (btn) {
    btn.addEventListener('pointerdown', function() {
      window.api.goHome();
    });
  }
})();

// ---------------------------------------------------------------------------
// Error overlay
// ---------------------------------------------------------------------------
var _errorServiceId = null;
var _errorCountdown = null;

window.api.onServiceError(function(data) {
  if (!data) return;
  _errorServiceId = data.serviceId;

  var overlay = $('error-overlay');
  var title = $('error-title');
  var msg = $('error-msg');
  var cd = $('error-countdown');
  var retry = $('error-retry');

  if (title) title.textContent = (data.name || 'SERVICE') + ' ERROR';
  if (msg) msg.textContent = data.error || 'Unable to reach service';
  if (overlay) overlay.classList.add('active');

  // Countdown
  var remaining = 15;
  if (_errorCountdown) clearInterval(_errorCountdown);
  _errorCountdown = setInterval(function() {
    remaining--;
    if (cd) cd.textContent = 'Auto-retry in ' + remaining + 's';
    if (remaining <= 0) {
      clearInterval(_errorCountdown);
      _errorCountdown = null;
      hideError();
    }
  }, 1000);

  if (retry) {
    retry.onclick = function() {
      if (_errorCountdown) clearInterval(_errorCountdown);
      _errorCountdown = null;
      hideError();
      if (_errorServiceId) window.api.retryService(_errorServiceId);
    };
  }
});

function hideError() {
  var overlay = $('error-overlay');
  if (overlay) overlay.classList.remove('active');
  if (_errorCountdown) {
    clearInterval(_errorCountdown);
    _errorCountdown = null;
  }
}

// ---------------------------------------------------------------------------
// No-op listeners (keep IPC channel open)
// ---------------------------------------------------------------------------
window.api.onCarouselState(function() {});
window.api.onDimState(function() {});
window.api.onHealthHistory(function() {});
