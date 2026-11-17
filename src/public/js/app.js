/**
 * ASTEN! (ASISTEN TENAGA!) - Portal Web Client
 */

const API_BASE = '/api';

// Current State
let currentTab = 'dashboard';
let cachedOwners = [];
let cachedBots = [];
let cachedCodes = [];

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  loadOwners();
  loadAccessCodes();
  loadBots();
  loadLogsData();
  initRealtimeEvents();

  // Polling fallback every 15 seconds for dashboard metrics
  setInterval(() => {
    if (currentTab === 'dashboard') {
      loadDashboardData();
    }
  }, 15000);
});

// Real-time Server-Sent Events (SSE) Listener (Section 5 & 7)
function initRealtimeEvents() {
  if (!window.EventSource) return;

  try {
    const evtSource = new EventSource('/api/events');

    evtSource.onopen = () => {
      console.log('[SSE] Live stream connected to ASTEN! Real-Time Bus');
    };

    evtSource.addEventListener('bot_registered', (e) => {
      console.log('[SSE] bot_registered:', e.data);
      loadBots();
      loadDashboardData();
      loadLogsData();
    });

    evtSource.addEventListener('bot_status_changed', (e) => {
      console.log('[SSE] bot_status_changed:', e.data);
      loadBots();
      loadDashboardData();
    });

    evtSource.addEventListener('bot_updated', (e) => {
      console.log('[SSE] bot_updated:', e.data);
      loadBots();
      loadDashboardData();
    });

    evtSource.addEventListener('owner_activated', (e) => {
      console.log('[SSE] owner_activated:', e.data);
      loadOwners();
      loadAccessCodes();
      loadDashboardData();
      loadLogsData();
    });

    evtSource.onerror = (err) => {
      console.warn('[SSE] EventSource reconnecting...', err);
    };
  } catch (err) {
    console.warn('[SSE] Could not initialize EventSource:', err);
  }
}

// Tab Switcher
function switchTab(tabId) {
  currentTab = tabId;

  // Hide all tabs
  document.querySelectorAll('main > section').forEach(sec => {
    sec.classList.add('hidden');
  });

  // Reset nav items
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.remove('bg-purple-600', 'text-white');
    btn.classList.add('text-slate-400');
  });

  // Show active tab
  const activeSection = document.getElementById(`tab-${tabId}`);
  if (activeSection) {
    activeSection.classList.remove('hidden');
  }

  // Highlight active nav
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) {
    activeNav.classList.remove('text-slate-400');
    activeNav.classList.add('bg-purple-600', 'text-white');
  }

  // Reload data for this tab
  if (tabId === 'dashboard') loadDashboardData();
  if (tabId === 'owners') loadOwners();
  if (tabId === 'access-codes' || tabId === 'activation-history') loadAccessCodes();
  if (tabId === 'bot-list') loadBots();
  if (tabId === 'activity-logs') loadLogsData();
}

// ================= API CALLS & DATA LOADERS =================

// 1. Dashboard Metrics
async function loadDashboardData() {
  try {
    const res = await fetch(`${API_BASE}/logs/metrics`);
    const json = await res.json();
    if (!json.success) return;

    const stats = json.stats;
    if (document.getElementById('metric-total-owners')) document.getElementById('metric-total-owners').textContent = stats.totalOwners;
    if (document.getElementById('metric-total-bots')) document.getElementById('metric-total-bots').textContent = stats.totalBots;
    if (document.getElementById('metric-active-bots')) document.getElementById('metric-active-bots').textContent = stats.onlineBots ?? stats.activeBots;
    if (document.getElementById('metric-offline-bots')) document.getElementById('metric-offline-bots').textContent = stats.offlineBots ?? 0;
    if (document.getElementById('metric-error-bots')) document.getElementById('metric-error-bots').textContent = stats.errorBots ?? 0;
    if (document.getElementById('metric-valid-api')) document.getElementById('metric-valid-api').textContent = stats.validApiBots ?? stats.totalBots;
    
    if (document.getElementById('metric-inactive-bots')) document.getElementById('metric-inactive-bots').textContent = stats.inactiveBots;
    if (document.getElementById('metric-active-licenses')) document.getElementById('metric-active-licenses').textContent = stats.activeLicenses;
    if (document.getElementById('metric-expired-licenses')) document.getElementById('metric-expired-licenses').textContent = stats.expiredLicenses;
    if (document.getElementById('metric-permanent-licenses')) document.getElementById('metric-permanent-licenses').textContent = stats.permanentLicenses;
    if (document.getElementById('metric-total-codes')) document.getElementById('metric-total-codes').textContent = stats.totalAccessCodes;
    if (document.getElementById('metric-unused-codes')) document.getElementById('metric-unused-codes').textContent = stats.unusedAccessCodes;
    if (document.getElementById('metric-used-codes')) document.getElementById('metric-used-codes').textContent = stats.usedAccessCodes;

    const engineStatus = document.getElementById('live-engine-status');
    if (engineStatus) {
      engineStatus.textContent = `Multi-Bot Engine: ${stats.onlineBots ?? stats.activeBots} Bot Online (+ @Astenobot Official)`;
    }

    // System Monitor updates (Uptime & Memory)
    if (json.system) {
      const totalSec = json.system.uptimeSeconds || 0;
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const uptimeStr = hours > 0 ? `${hours}j ${mins}m` : `${mins}m`;
      
      const uptimeEl = document.getElementById('monitor-server-uptime');
      if (uptimeEl) uptimeEl.textContent = `Uptime: ${uptimeStr}`;

      const memEl = document.getElementById('monitor-server-memory');
      if (memEl) memEl.textContent = `Mem: ${json.system.memoryRssMb} MB`;
    }

    // Render Recent Logs in Dashboard
    const logsContainer = document.getElementById('dashboard-recent-logs');
    if (logsContainer) {
      if (json.recentActivity && json.recentActivity.length > 0) {
        logsContainer.innerHTML = json.recentActivity.slice(0, 5).map(log => `
          <div class="flex items-start space-x-3 text-xs p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${getActionBadgeColor(log.action)}">${log.action}</span>
            <div class="flex-1">
              <p class="text-slate-200">${log.details || log.action}</p>
              <span class="text-[10px] text-slate-500">${formatDate(log.created_at)}</span>
            </div>
          </div>
        `).join('');
      } else {
        logsContainer.innerHTML = `<div class="text-xs text-slate-500 italic py-3 text-center">Belum ada log aktivitas.</div>`;
      }
    }

    // Load Live Running Bots
    loadLiveBots();
  } catch (err) {
    console.error('Error loading metrics:', err);
  }
}

// 2. Live Bots for Dashboard
async function loadLiveBots() {
  try {
    const res = await fetch(`${API_BASE}/bots`);
    const json = await res.json();
    if (!json.success) return;

    const container = document.getElementById('live-bots-container');
    const bots = json.data || [];
    const live = json.live || [];

    if (bots.length === 0) {
      container.innerHTML = `<div class="text-xs text-slate-500 italic py-4 text-center">Belum ada bot terdaftar. Klik "Daftar Bot Baru" untuk memulai.</div>`;
      return;
    }

    container.innerHTML = bots.map(b => {
      const isRunning = live.some(l => String(l.bot_id) === String(b.bot_id));
      const isOfficial = b.is_official === 1;
      return `
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/70 border ${isOfficial ? 'border-amber-500/40 bg-gradient-to-r from-amber-950/20 to-slate-900/80' : 'border-slate-800'}">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg ${isOfficial ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/10 text-sky-400'} flex items-center justify-center">
              <i class="fa-${isOfficial ? 'solid fa-crown' : 'brands fa-telegram'}"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>@${b.bot_username}</span>
                ${isOfficial ? '<span class="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[9px] px-1.5 py-0.2 rounded font-extrabold">OFFICIAL</span>' : ''}
              </div>
              <div class="text-[11px] text-slate-400">${isOfficial ? 'Official System Gateway' : 'Owner: ' + (b.owner_name || 'Owner #' + b.owner_id)}</div>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${isRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}">
              ${isRunning ? '● RUNNING' : '○ STOPPED'}
            </span>
            <button onclick="toggleBotRun('${b.bot_id}', ${isRunning})" class="text-xs p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <i class="fa-solid ${isRunning ? 'fa-pause text-amber-400' : 'fa-play text-emerald-400'}"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading live bots:', err);
  }
}

// 3. Load Owners Table
async function loadOwners() {
  try {
    const res = await fetch(`${API_BASE}/owners`);
    const json = await res.json();
    if (!json.success) return;

    cachedOwners = json.data || [];
    const tbody = document.getElementById('owners-table-body');
    const select = document.getElementById('reg-owner-id');

    // Populate select in Bot Register Modal
    if (select) {
      select.innerHTML = '<option value="">-- Pilih Owner --</option>' +
        cachedOwners.map(o => `<option value="${o.id}">${o.name} (@${o.telegram_username || 'no_user'}) - ${o.license_type}</option>`).join('');
    }

    if (cachedOwners.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-500 italic">Belum ada Owner terdaftar. Buat Owner baru sekarang.</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedOwners.map(o => {
      const isExpired = o.license_type !== 'PERMANENT' && o.license_expires_at && o.license_expires_at < Date.now();
      const statusBadge = o.status === 'ACTIVE' && !isExpired
        ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">AKTIF</span>`
        : `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">EXPIRED</span>`;

      let expiryText = 'Permanen';
      if (o.license_type !== 'PERMANENT') {
        expiryText = o.license_expires_at ? formatDate(o.license_expires_at) : 'Belum Aktif';
      }

      return `
        <tr class="hover:bg-slate-900/40 transition">
          <td class="px-5 py-4 font-semibold text-white">
            ${o.name}
            ${o.telegram_username ? `<span class="text-xs text-slate-400 block">@${o.telegram_username}</span>` : ''}
          </td>
          <td class="px-5 py-4 font-mono text-xs text-slate-300">${o.telegram_user_id || '<span class="text-slate-500">Menunggu aktivasi</span>'}</td>
          <td class="px-5 py-4 text-xs font-semibold text-purple-300">${o.bot_count || 0} / ${o.max_bots} Bot</td>
          <td class="px-5 py-4 text-xs font-semibold text-indigo-300">${o.license_type}</td>
          <td class="px-5 py-4 text-xs text-slate-300">${expiryText}</td>
          <td class="px-5 py-4">${statusBadge}</td>
          <td class="px-5 py-4 text-right space-x-1">
            <button onclick="openExtendLicenseModal(${o.id})" title="Perpanjang Lisensi" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-400 transition">
              <i class="fa-solid fa-calendar-plus"></i>
            </button>
            <button onclick="toggleOwnerStatus(${o.id}, '${o.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}')" title="Ubah Status" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition">
              <i class="fa-solid fa-power-off"></i>
            </button>
            <button onclick="deleteOwner(${o.id})" title="Hapus" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 transition">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading owners:', err);
  }
}

// 4. Load Access Codes Table
async function loadAccessCodes() {
  try {
    const res = await fetch(`${API_BASE}/licenses/codes`);
    const json = await res.json();
    if (!json.success) return;

    cachedCodes = json.data || [];
    const tbody = document.getElementById('access-codes-table-body');
    const historyContainer = document.getElementById('activation-history-container');

    if (cachedCodes.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-500 italic">Belum ada kode akses yang digenerate.</td></tr>`;
      if (historyContainer) historyContainer.innerHTML = `<div class="text-xs text-slate-500 italic py-6 text-center">Belum ada riwayat aktivasi.</div>`;
      return;
    }

    if (tbody) {
      tbody.innerHTML = cachedCodes.map(c => {
        const isUsed = c.status === 'USED';
        const badge = isUsed
          ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">USED</span>`
          : `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">UNUSED</span>`;

        return `
          <tr class="hover:bg-slate-900/40 transition">
            <td class="px-5 py-4 font-mono font-bold text-purple-300">
              <div class="flex items-center space-x-2">
                <span>${c.code}</span>
                <button onclick="navigator.clipboard.writeText('${c.code}'); alert('Kode ${c.code} berhasil disalin!');" class="text-slate-400 hover:text-white text-xs">
                  <i class="fa-regular fa-copy"></i>
                </button>
              </div>
            </td>
            <td class="px-5 py-4 text-xs font-semibold text-white">${c.owner_name}</td>
            <td class="px-5 py-4 text-xs text-slate-300">${c.license_type} (${c.duration_days} hr)</td>
            <td class="px-5 py-4 text-xs font-mono text-purple-300">${c.max_bots} Bot</td>
            <td class="px-5 py-4">${badge}</td>
            <td class="px-5 py-4 text-xs text-slate-400">${formatDate(c.created_at)}</td>
            <td class="px-5 py-4 text-xs text-slate-400">${c.used_at ? formatDate(c.used_at) : '-'}</td>
          </tr>
        `;
      }).join('');
    }

    // Render activation history tab
    if (historyContainer) {
      const usedCodes = cachedCodes.filter(c => c.status === 'USED');
      if (usedCodes.length === 0) {
        historyContainer.innerHTML = `<div class="text-xs text-slate-500 italic py-6 text-center">Belum ada kode yang diaktifkan oleh Owner.</div>`;
      } else {
        historyContainer.innerHTML = usedCodes.map(c => `
          <div class="flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-xl bg-purple-600/10 text-purple-400 flex items-center justify-center font-bold">
                <i class="fa-solid fa-check"></i>
              </div>
              <div>
                <div class="text-sm font-bold text-white font-mono">${c.code}</div>
                <div class="text-xs text-slate-400">Diaktifkan oleh: <b class="text-slate-200">${c.owner_name}</b> (${c.license_type})</div>
              </div>
            </div>
            <div class="text-right text-xs text-slate-500">
              <div>Aktivasi: <span class="text-slate-300">${formatDate(c.used_at)}</span></div>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading access codes:', err);
  }
}

// 5. Load Bots Table & Management (Section 6)
async function loadBots() {
  try {
    const res = await fetch(`${API_BASE}/bots`);
    const json = await res.json();
    if (!json.success) return;

    cachedBots = json.data || [];
    filterBotsTable();
  } catch (err) {
    console.error('Error loading bots:', err);
  }
}

// Filter and Search Bots (Section 6)
function filterBotsTable() {
  const tbody = document.getElementById('bot-table-body');
  if (!tbody) return;

  const searchQuery = (document.getElementById('bot-search-input')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('bot-status-filter')?.value || 'ALL';

  const filtered = cachedBots.filter(b => {
    // Search query matching
    if (searchQuery) {
      const matchName = (b.bot_name || '').toLowerCase().includes(searchQuery);
      const matchUser = (b.bot_username || '').toLowerCase().includes(searchQuery);
      const matchId = String(b.bot_id || '').includes(searchQuery);
      const matchOwner = (b.owner_name || '').toLowerCase().includes(searchQuery);
      if (!matchName && !matchUser && !matchId && !matchOwner) return false;
    }
    // Status filter matching
    if (statusFilter !== 'ALL') {
      const opStatus = b.operational_status || (b.status === 'ACTIVE' ? 'ONLINE' : 'OFFLINE');
      if (opStatus !== statusFilter) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-500 italic">Tidak ada bot yang sesuai dengan pencarian atau filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const isOfficial = b.is_official === 1;
    const opStatus = b.operational_status || (b.status === 'ACTIVE' ? 'ONLINE' : 'OFFLINE');
    const isRunning = opStatus === 'ONLINE' || opStatus === 'CONNECTING';
    const apiStatus = b.api_status || 'VALID';
    const connStatus = b.connection_status || (isRunning ? 'CONNECTED' : 'DISCONNECTED');

    return `
      <tr class="hover:bg-slate-900/40 transition ${isOfficial ? 'bg-amber-950/10' : ''}">
        <!-- 1. Bot Info -->
        <td class="px-5 py-4">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg ${isOfficial ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/10 text-sky-400'} flex items-center justify-center shrink-0">
              <i class="fa-${isOfficial ? 'solid fa-crown' : 'brands fa-telegram'}"></i>
            </div>
            <div>
              <div class="font-bold text-white text-xs flex items-center space-x-1.5">
                <span>@${b.bot_username}</span>
                ${isOfficial ? '<span class="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] px-2 py-0.5 rounded-full font-extrabold">⭐ OFFICIAL</span>' : ''}
              </div>
              <div class="text-[11px] text-slate-400">${b.bot_name}</div>
            </div>
          </div>
        </td>

        <!-- 2. ID Telegram Bot -->
        <td class="px-5 py-4 font-mono text-xs text-slate-300">${b.bot_id}</td>

        <!-- 3. Pemilik Bot -->
        <td class="px-5 py-4 text-xs font-semibold ${isOfficial ? 'text-amber-300' : 'text-slate-200'}">
          ${isOfficial ? 'ASTEN! Official System' : (b.owner_name || 'Owner #' + b.owner_id)}
        </td>

        <!-- 4. Ditambahkan (Tanggal & Waktu) -->
        <td class="px-5 py-4 text-xs text-slate-400">${formatDate(b.created_at)}</td>

        <!-- 5. Status API -->
        <td class="px-5 py-4">${getApiStatusBadge(apiStatus)}</td>

        <!-- 6. Status Koneksi -->
        <td class="px-5 py-4">${getConnectionStatusBadge(connStatus)}</td>

        <!-- 7. Status Operasional -->
        <td class="px-5 py-4">${getOperationalStatusBadge(opStatus)}</td>

        <!-- 8. Aksi -->
        <td class="px-5 py-4 text-right space-x-1.5 whitespace-nowrap">
          <button onclick="openBotDetailModal('${b.bot_id}')" title="Lihat Detail Bot" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 transition">
            <i class="fa-solid fa-circle-info"></i>
          </button>
          <button onclick="toggleBotRun('${b.bot_id}', ${isRunning})" class="px-2.5 py-1 rounded-lg text-xs font-semibold ${isRunning ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}">
            ${isRunning ? 'Stop' : 'Start'}
          </button>
          <button onclick="restartBot('${b.bot_id}')" title="Restart Bot" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 transition">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
          ${isOfficial ? `
            <span class="text-[10px] font-semibold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg inline-block">
              🔒 RESMI
            </span>
          ` : `
            <button onclick="deleteBot('${b.bot_id}')" title="Hapus Bot" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 transition">
              <i class="fa-solid fa-trash"></i>
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

// Bot Detail Modal Handler (Section 6)
function openBotDetailModal(botId) {
  const bot = cachedBots.find(b => String(b.bot_id) === String(botId));
  if (!bot) return;

  const isOfficial = bot.is_official === 1;
  const opStatus = bot.operational_status || (bot.status === 'ACTIVE' ? 'ONLINE' : 'OFFLINE');
  const isRunning = opStatus === 'ONLINE' || opStatus === 'CONNECTING';

  document.getElementById('detail-bot-name').textContent = bot.bot_name;
  document.getElementById('detail-bot-username').textContent = `@${bot.bot_username}`;

  const officialBadge = document.getElementById('detail-bot-official-badge');
  if (isOfficial) {
    officialBadge.classList.remove('hidden');
  } else {
    officialBadge.classList.add('hidden');
  }

  document.getElementById('detail-operational-status').innerHTML = getOperationalStatusBadge(opStatus);
  document.getElementById('detail-api-status').innerHTML = getApiStatusBadge(bot.api_status || 'VALID');
  document.getElementById('detail-connection-status').innerHTML = getConnectionStatusBadge(bot.connection_status || (isRunning ? 'CONNECTED' : 'DISCONNECTED'));
  document.getElementById('detail-activation-status').innerHTML = bot.status === 'ACTIVE'
    ? '<span class="text-emerald-400 font-bold">AKTIF</span>'
    : '<span class="text-rose-400 font-bold">NONAKTIF</span>';

  document.getElementById('detail-bot-id').textContent = bot.bot_id;
  document.getElementById('detail-owner-name').textContent = isOfficial ? 'ASTEN! Official System' : (bot.owner_name || `Owner #${bot.owner_id}`);
  document.getElementById('detail-created-at').textContent = formatDate(bot.created_at);
  document.getElementById('detail-last-health').textContent = bot.last_health_check ? formatDate(bot.last_health_check) : 'Baru saja diinisialisasi';
  document.getElementById('detail-restart-count').textContent = bot.restart_count || 0;

  const errorBox = document.getElementById('detail-error-box');
  const errorMsg = document.getElementById('detail-error-message');
  if (bot.error_message) {
    errorMsg.textContent = bot.error_message;
    errorBox.classList.remove('hidden');
  } else {
    errorBox.classList.add('hidden');
  }

  // Populate dynamic action controls in modal
  const controls = document.getElementById('detail-action-controls');
  controls.innerHTML = `
    <button onclick="toggleBotRun('${bot.bot_id}', ${isRunning}); closeModal('modal-bot-detail');" class="px-3 py-1.5 rounded-xl text-xs font-semibold ${isRunning ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}">
      ${isRunning ? 'Hentikan Bot (Stop)' : 'Jalankan Bot (Start)'}
    </button>
    <button onclick="restartBot('${bot.bot_id}'); closeModal('modal-bot-detail');" class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">
      <i class="fa-solid fa-rotate-right mr-1"></i> Restart Bot
    </button>
    ${!isOfficial ? `
      <button onclick="deleteBot('${bot.bot_id}'); closeModal('modal-bot-detail');" class="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-xs font-semibold">
        <i class="fa-solid fa-trash mr-1"></i> Hapus Bot
      </button>
    ` : ''}
  `;

  document.getElementById('modal-bot-detail').classList.remove('hidden');
}

// Operational Status Badge (6 Statuses as required)
function getOperationalStatusBadge(status) {
  switch (status) {
    case 'ONLINE':
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1.5 w-fit">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-green"></span>
        <span>ONLINE</span>
      </span>`;
    case 'OFFLINE':
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center space-x-1.5 w-fit">
        <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
        <span>OFFLINE</span>
      </span>`;
    case 'CONNECTING':
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center space-x-1.5 w-fit">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
        <span>CONNECTING</span>
      </span>`;
    case 'RESTARTING':
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center space-x-1.5 w-fit">
        <i class="fa-solid fa-rotate text-[10px] animate-spin"></i>
        <span>RESTARTING</span>
      </span>`;
    case 'ERROR':
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30 flex items-center space-x-1.5 w-fit">
        <i class="fa-solid fa-triangle-exclamation text-[10px]"></i>
        <span>ERROR</span>
      </span>`;
    case 'DISABLED':
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700 flex items-center space-x-1.5 w-fit">
        <span>DISABLED</span>
      </span>`;
    default:
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400">${status || 'OFFLINE'}</span>`;
  }
}

function getApiStatusBadge(apiStatus) {
  if (apiStatus === 'VALID') {
    return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">VALID</span>`;
  }
  return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">INVALID</span>`;
}

function getConnectionStatusBadge(connStatus) {
  if (connStatus === 'CONNECTED') {
    return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">CONNECTED</span>`;
  }
  return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">DISCONNECTED</span>`;
}

// 6. Load Activity Logs Table
async function loadLogsData() {
  try {
    const res = await fetch(`${API_BASE}/logs?limit=50`);
    const json = await res.json();
    if (!json.success) return;

    const tbody = document.getElementById('logs-table-body');
    const logs = json.data || [];

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500 italic">Belum ada riwayat aktivitas tercatat.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr class="hover:bg-slate-900/40 transition">
        <td class="px-5 py-3 text-slate-400">${formatDate(l.created_at)}</td>
        <td class="px-5 py-3 text-indigo-300 font-semibold">${l.actor_type} (${l.actor_id})</td>
        <td class="px-5 py-3">
          <span class="px-2 py-0.5 rounded ${getActionBadgeColor(l.action)}">${l.action}</span>
        </td>
        <td class="px-5 py-3 text-slate-200">${l.details || '-'}</td>
        <td class="px-5 py-3 text-slate-400">${l.bot_id || '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading logs:', err);
  }
}

// ================= FORM HANDLERS =================

// Create Owner
async function handleCreateOwner(e) {
  e.preventDefault();
  const name = document.getElementById('owner-name').value;
  const username = document.getElementById('owner-username').value;
  const userId = document.getElementById('owner-user-id').value;
  const password = document.getElementById('owner-password').value;
  const licenseType = document.getElementById('owner-license-type').value;
  const maxBots = document.getElementById('owner-max-bots').value;

  let durationDays = 30;
  if (licenseType === '3_MONTHS') durationDays = 90;
  if (licenseType === '6_MONTHS') durationDays = 180;
  if (licenseType === '1_YEAR') durationDays = 365;
  if (licenseType === '2_YEARS') durationDays = 730;
  if (licenseType === 'PERMANENT') durationDays = 0;
  if (licenseType === 'CUSTOM') {
    durationDays = parseInt(document.getElementById('owner-custom-days').value, 10);
  }

  try {
    const res = await fetch(`${API_BASE}/owners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        telegramUsername: username,
        telegramUserId: userId,
        password,
        licenseType,
        durationDays,
        maxBots
      })
    });

    const json = await res.json();
    if (json.success) {
      alert('Owner baru berhasil ditambahkan!');
      document.getElementById('form-add-owner').reset();
      switchTab('owners');
    } else {
      alert('Gagal: ' + json.message);
    }
  } catch (err) {
    alert('Terjadi kesalahan jaringan.');
  }
}

// Generate Access Code (Section 19.D)
async function handleGenerateAccessCode(e) {
  e.preventDefault();
  const ownerName = document.getElementById('code-owner-name').value;
  const username = document.getElementById('code-telegram-username').value;
  const userId = document.getElementById('code-telegram-user-id').value;
  const licenseType = document.getElementById('code-license-type').value;
  const maxBots = document.getElementById('code-max-bots').value;
  const notes = document.getElementById('code-notes').value;

  let durationDays = 30;
  if (licenseType === '3_MONTHS') durationDays = 90;
  if (licenseType === '6_MONTHS') durationDays = 180;
  if (licenseType === '1_YEAR') durationDays = 365;
  if (licenseType === '2_YEARS') durationDays = 730;
  if (licenseType === 'PERMANENT') durationDays = 0;
  if (licenseType === 'CUSTOM') {
    durationDays = parseInt(document.getElementById('code-custom-days').value, 10);
  }

  try {
    const res = await fetch(`${API_BASE}/licenses/codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerName,
        telegramUsername: username,
        telegramUserId: userId,
        licenseType,
        durationDays,
        maxBots,
        notes
      })
    });

    const json = await res.json();
    if (json.success) {
      const codeData = json.data;
      document.getElementById('display-generated-code').textContent = codeData.code;
      document.getElementById('display-code-owner').textContent = codeData.owner_name;
      document.getElementById('display-code-license').textContent = `${codeData.license_type} (${codeData.duration_days} Hari)`;
      document.getElementById('display-code-bots').textContent = `${codeData.max_bots} Bot`;

      document.getElementById('form-create-code').reset();
      document.getElementById('modal-code-success').classList.remove('hidden');
      loadAccessCodes();
    } else {
      alert('Gagal: ' + json.message);
    }
  } catch (err) {
    alert('Terjadi kesalahan jaringan.');
  }
}

// Copy Code
function copyGeneratedCode() {
  const code = document.getElementById('display-generated-code').textContent;
  navigator.clipboard.writeText(code);
  const btnText = document.getElementById('copy-btn-text');
  btnText.textContent = 'Tersalin!';
  setTimeout(() => { btnText.textContent = 'Salin'; }, 2000);
}

// Test Bot Token getMe
async function testBotToken() {
  const token = document.getElementById('reg-bot-token').value.trim();
  const feedback = document.getElementById('token-test-feedback');

  if (!token) {
    feedback.className = 'p-3 rounded-xl text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20';
    feedback.textContent = 'Silakan masukkan token terlebih dahulu.';
    feedback.classList.remove('hidden');
    return;
  }

  feedback.className = 'p-3 rounded-xl text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20';
  feedback.textContent = 'Menghubungi Telegram Bot API...';
  feedback.classList.remove('hidden');

  try {
    const res = await fetch(`${API_BASE}/bots/validate-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const json = await res.json();
    if (json.valid) {
      const bot = json.bot;
      feedback.className = 'p-3 rounded-xl text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      feedback.innerHTML = `✅ <b>Token Valid!</b> Bot: <b>${bot.first_name}</b> (@${bot.username}) [ID: ${bot.id}]`;
    } else {
      feedback.className = 'p-3 rounded-xl text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20';
      feedback.innerHTML = `❌ <b>Token Tidak Valid:</b> ${json.error || 'Periksa kembali token Anda.'}`;
    }
  } catch (err) {
    feedback.className = 'p-3 rounded-xl text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20';
    feedback.textContent = 'Gagal menghubungi server.';
  }
}

// Submit Register Bot
async function handleRegisterBotSubmit(e) {
  e.preventDefault();
  const ownerId = document.getElementById('reg-owner-id').value;
  const botToken = document.getElementById('reg-bot-token').value.trim();
  const btn = document.getElementById('btn-submit-register-bot');

  if (!ownerId || !botToken) {
    alert('Owner dan Token wajib diisi!');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Mendaftarkan...';

  try {
    const res = await fetch(`${API_BASE}/bots/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, ownerId })
    });

    const json = await res.json();
    btn.disabled = false;
    btn.textContent = 'Daftarkan & Jalankan';

    if (json.success) {
      alert(json.message);
      closeModal('modal-register-bot');
      loadBots();
      loadDashboardData();
    } else {
      alert('Gagal: ' + json.message);
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Daftarkan & Jalankan';
    alert('Terjadi kesalahan jaringan.');
  }
}

// Toggle Bot Run
async function toggleBotRun(botId, isCurrentlyRunning) {
  const endpoint = isCurrentlyRunning ? 'stop' : 'start';
  try {
    const res = await fetch(`${API_BASE}/bots/${botId}/${endpoint}`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      loadBots();
      loadDashboardData();
    } else {
      alert(json.message);
    }
  } catch (err) {
    alert('Gagal mengubah status bot.');
  }
}

// Restart Bot
async function restartBot(botId) {
  try {
    const res = await fetch(`${API_BASE}/bots/${botId}/restart`, { method: 'POST' });
    const json = await res.json();
    alert(json.message);
    loadBots();
    loadDashboardData();
  } catch (err) {
    alert('Gagal me-restart bot.');
  }
}

// Delete Bot
async function deleteBot(botId) {
  if (!confirm('Apakah Anda yakin ingin menghapus bot ini?')) return;
  try {
    const res = await fetch(`${API_BASE}/bots/${botId}`, { method: 'DELETE' });
    const json = await res.json();
    alert(json.message);
    loadBots();
    loadDashboardData();
  } catch (err) {
    alert('Gagal menghapus bot.');
  }
}

// Toggle Owner Status
async function toggleOwnerStatus(ownerId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/owners/${ownerId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const json = await res.json();
    if (json.success) loadOwners();
  } catch (err) {
    alert('Gagal mengubah status owner.');
  }
}

// Delete Owner
async function deleteOwner(ownerId) {
  if (!confirm('Apakah Anda yakin ingin menghapus Owner ini?')) return;
  try {
    const res = await fetch(`${API_BASE}/owners/${ownerId}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) loadOwners();
  } catch (err) {
    alert('Gagal menghapus owner.');
  }
}

// Extend License Modal
function openExtendLicenseModal(ownerId) {
  document.getElementById('extend-owner-id').value = ownerId;
  document.getElementById('modal-extend-license').classList.remove('hidden');
}

async function submitExtendLicense() {
  const ownerId = document.getElementById('extend-owner-id').value;
  const days = document.getElementById('extend-days').value;

  try {
    const res = await fetch(`${API_BASE}/owners/${ownerId}/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days })
    });
    const json = await res.json();
    if (json.success) {
      alert(json.message);
      closeModal('modal-extend-license');
      loadOwners();
    } else {
      alert(json.message);
    }
  } catch (err) {
    alert('Gagal memperpanjang lisensi.');
  }
}

// Modal Helpers
function openGenerateCodeModal() {
  switchTab('create-code');
}

function openRegisterBotModal() {
  document.getElementById('modal-register-bot').classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function handleOwnerLicenseDurationChange(val) {
  const container = document.getElementById('owner-custom-days-container');
  if (val === 'CUSTOM') container.classList.remove('hidden');
  else container.classList.add('hidden');
}

function handleCodeLicenseDurationChange(val) {
  const container = document.getElementById('code-custom-days-container');
  if (val === 'CUSTOM') container.classList.remove('hidden');
  else container.classList.add('hidden');
}

// Formatters
function formatDate(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getActionBadgeColor(action) {
  if (action.includes('CREATED') || action.includes('ACTIVATED') || action.includes('REGISTERED')) {
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  }
  if (action.includes('EXPIRED') || action.includes('CANCELLED') || action.includes('DEACTIVATED')) {
    return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
  }
  return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
}
