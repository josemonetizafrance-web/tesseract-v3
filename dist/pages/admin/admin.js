// admin.js - TESSERACT v3 Panel Admin (usuarios, estadisticas, chat)
var TESSERACT_API = 'https://tesseract-v3-production.up.railway.app';
var ONLINE_WINDOW_MS = 5 * 60 * 1000;

let currentToken = '';
let cachedUsers = [];
let activeTab = 'users';
let statsRange = 'day';
let chatWith = null;
let chatLastTs = {};
let timers = [];

function apiFetch(endpoint, options = {}) {
  const headers = { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' };
  return fetch(`${TESSERACT_API}${endpoint}`, { method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined })
    .then(async res => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
      return body;
    });
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function timeAgo(ts) {
  if (!ts) return '—';
  const d = Date.now() - ts;
  if (d < 60000) return 'hace instantes';
  if (d < 3600000) return `hace ${Math.floor(d / 60000)} min`;
  if (d < 86400000) return `hace ${Math.floor(d / 3600000)} h`;
  return `hace ${Math.floor(d / 86400000)} días`;
}

// ============ INICIO ============
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  currentToken = params.get('token') ? decodeURIComponent(params.get('token')) : '';
  if (!currentToken) { renderDenied('Sesión no encontrada. Entra desde el Dashboard.'); return; }
  try {
    const me = await apiFetch('/api/tess/auth/verify');
    if (!(me.isAdmin || me.isDeveloper)) { renderDenied('No tienes permisos de administrador.'); return; }
    document.getElementById('admin-email').textContent = me.email;
    const isRoot = (me.email || '').toLowerCase() === 'chevyadmin@tesseract.com';
    if (isRoot) {
      document.getElementById('btn-tab-staff').style.display = '';
      initStaffUI();
      loadStaff();
      timers.push(setInterval(() => { if (activeTab === 'staff') loadStaff(true); }, 30000));
    }
    initTabs();
    initChatUI();
    await loadUsers();
    timers.push(setInterval(() => { if (activeTab === 'users') loadUsers(true); }, 20000));
    timers.push(setInterval(() => { if (activeTab === 'chat') refreshThreads(); }, 5000));
  } catch (e) {
    renderDenied('Error verificando sesión: ' + e.message);
  }
});

function renderDenied(msg) {
  document.querySelector('main').innerHTML = `<div class="placeholder" style="padding-top:120px;">
    <div style="font-size:34px;margin-bottom:14px;">⛔</div>
    <div style="color:#ef4444;font-weight:700;letter-spacing:1px;">SIN ACCESO</div>
    <div style="margin-top:10px;color:#666;">${esc(msg)}</div></div>`;
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  timers.forEach(clearInterval);
  try { await chrome.storage.local.clear(); } catch (e) {}
  window.close();
});

// ============ TABS ============
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    document.getElementById('tab-' + activeTab).classList.add('active');
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'chat') refreshThreads();
  }));
}

// ============ USUARIOS ============
async function loadUsers(silent) {
  try {
    const data = await apiFetch('/api/tess/admin/users');
    cachedUsers = data.users || [];
    renderUsers();
    fillStatsSelect();
  } catch (e) {
    if (!silent) document.getElementById('user-table-body').innerHTML =
      `<tr><td colspan="4" class="placeholder">Error cargando usuarios: ${esc(e.message)}</td></tr>`;
  }
}

function userStatus(u) {
  if (u.is_banned) return ['BANEADO', 'banned'];
  if (!u.is_approved) return ['PENDIENTE', 'demo'];
  if (u.is_developer || u.is_admin) return ['MASTER', 'dev'];
  if (u.is_premium || (u.premium_expiry && Number(u.premium_expiry) > Date.now())) return ['PREMIUM', 'premium'];
  return ['DEMO', 'demo'];
}

function renderUsers() {
  const tbody = document.getElementById('user-table-body');
  const masterEmail = 'chevyadmin@tesseract.com';
  if (!cachedUsers.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="placeholder">Sin usuarios registrados</td></tr>';
    return;
  }
  tbody.innerHTML = cachedUsers.map(u => {
    const online = !!(u.last_activity && (Date.now() - u.last_activity) < ONLINE_WINDOW_MS);
    const st = userStatus(u);
    const isMaster = u.email.toLowerCase() === masterEmail;
    const name = u.display_name || '(sin nombre)';
    let actions = '<span style="color:#555;font-size:10px;">cuenta maestra</span>';
    if (!isMaster) actions =
      `<button class="act-btn ok" data-act="premium" data-email="${esc(u.email)}">PREMIUM</button>` +
      `<button class="act-btn" data-act="ban" data-email="${esc(u.email)}">${u.is_banned ? 'UNBAN' : 'BAN'}</button>` +
      `<button class="act-btn" data-act="email" data-email="${esc(u.email)}">CORREO</button>` +
      `<button class="act-btn" data-act="pass" data-email="${esc(u.email)}">CLAVE</button>` +
      `<button class="act-btn danger" data-act="delete" data-email="${esc(u.email)}">DEL</button>`;
    return `<tr>
      <td><span class="dot${online ? ' online' : ''}"></span><span class="uname">${esc(name)}</span><br><span class="uemail">${esc(u.email)}</span></td>
      <td><span class="badge ${st[1]}">${st[0]}</span>${online ? '<br><small style="color:#22c55e;font-size:9px;letter-spacing:1px;">ONLINE</small>' : ''}</td>
      <td style="color:#888;font-size:11px;">${timeAgo(u.last_activity)}<br><small style="color:#555;">${u.login_count || 0} inicios</small></td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}
document.getElementById('user-table-body').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const act = btn.dataset.act, email = btn.dataset.email;
  try {
    if (act === 'premium') { await apiFetch('/api/tess/admin/premium', { method: 'POST', body: { email } }); loadUsers(); }
    if (act === 'ban') {
      const u = cachedUsers.find(x => x.email === email);
      await apiFetch('/api/tess/admin/' + (u && u.is_banned ? 'unban' : 'ban'), { method: 'POST', body: { email } });
      loadUsers();
    }
    if (act === 'email') {
      const ne = prompt('Nuevo correo para ' + email + ':', email);
      if (!ne || ne === email) return;
      await apiFetch('/api/tess/admin/set-email', { method: 'POST', body: { email, newEmail: ne.trim().toLowerCase() } });
      alert('Correo actualizado.');
      loadUsers();
    }
    if (act === 'pass') {
      const np = prompt('Nueva contraseña para ' + email + ' (debe terminar en *+):');
      if (!np) return;
      if (!np.endsWith('*+') || np.length < 6) return alert('Debe terminar en *+ y tener al menos 6 caracteres.');
      await apiFetch('/api/tess/admin/set-password', { method: 'POST', body: { email, password: np } });
      alert('Contraseña actualizada.');
    }
    if (act === 'delete') {
      if (!confirm('¿ELIMINAR definitivamente a ' + email + '?')) return;
      try {
        await apiFetch('/api/tess/admin/users/' + encodeURIComponent(email), { method: 'DELETE' });
        loadUsers();
      } catch (err) { alert('Error: ' + err.message); }
    }
  } catch (err) { alert('Error: ' + err.message); }
});

// ============ ESTADISTICAS ============
function fillStatsSelect() {
  const sel = document.getElementById('stats-user');
  const prev = sel.value;
  const ops = cachedUsers.filter(u => !(u.is_developer || u.is_admin || u.is_office_admin || u.staff_role));
  sel.innerHTML = '<option value="">Selecciona operador…</option>' +
    ops.map(u => `<option value="${esc(u.email)}">${esc(u.display_name || u.email)} — ${esc(u.email)}</option>`).join('');
  if (prev && ops.some(u => u.email === prev)) sel.value = prev;

  const ncSel = document.getElementById('new-chat-user');
  const me = (document.getElementById('admin-email').textContent || '').toLowerCase();
  const prevChat = ncSel.value;
  const people = cachedUsers.filter(u => (u.email || '').toLowerCase() !== me);
  ncSel.innerHTML = '<option value="">Selecciona usuario…</option>' +
    people.map(u => `<option value="${esc(u.email)}">${esc(u.display_name || u.email)} — ${esc(u.email)}</option>`).join('');
  if (prevChat && people.some(u => u.email === prevChat)) ncSel.value = prevChat;
}

document.querySelectorAll('.range-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.range-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  statsRange = b.dataset.range;
  loadOperatorStats();
}));

document.getElementById('stats-user').addEventListener('change', loadOperatorStats);

async function loadOperatorStats() {
  const email = document.getElementById('stats-user').value;
  const box = document.getElementById('stats-result');
  if (!email) { box.innerHTML = '<div class="placeholder">Elige un operador y un rango para ver sus métricas.</div>'; return; }
  box.innerHTML = '<div class="placeholder">Cargando métricas…</div>';
  try {
    const d = await apiFetch(`/api/tess/admin/operator-stats?email=${encodeURIComponent(email)}&range=${statsRange}`);
    const s = d.stats;
    const pct = s.onTimePct == null ? '—' : s.onTimePct + '%';
    const subPct = s.respTotal > 0 ? `${s.respOnTime} a tiempo · ${s.respLate} tardías` : 'sin respuestas medidas aún';
    const onlineTag = d.online
      ? '<span style="color:#22c55e;font-size:11px;font-weight:700;">● ONLINE AHORA</span>'
      : `<span style="color:#666;font-size:11px;">visto ${timeAgo(d.lastActivity)}</span>`;
    box.innerHTML =
      `<div style="margin-bottom:16px;">${onlineTag} · <span style="color:#555;font-size:11px;">rango: ${d.start} → hoy · ${d.loginCount} inicios totales</span></div>` +
      `<div class="cards">` +
      `<div class="card"><div class="lbl">BARRIDOS DE CARTAS</div><div class="val">${s.barridosCartas}</div><div class="sub">${s.cartasEnviadas} cartas enviadas</div></div>` +
      `<div class="card"><div class="lbl">LFP (LIKES + FOLLOWS)</div><div class="val">${s.lfp}</div><div class="sub">${s.likes} likes · ${s.follows} follows</div></div>` +
      `<div class="card"><div class="lbl">SALUDOS (SAY HI!)</div><div class="val">${s.saludos}</div><div class="sub">${s.icebreakers} icebreakers generados</div></div>` +
      `<div class="card hl"><div class="lbl">RESPUESTA EN &lt; 2 MIN</div><div class="val">${pct}</div><div class="sub">${subPct}</div></div>` +
      `<div class="card"><div class="lbl">MENSAJES ENVIADOS</div><div class="val">${s.mensajes}</div><div class="sub">Eater + mailing</div></div>` +
      `</div>`;
  } catch (e) {
    box.innerHTML = `<div class="placeholder">Error: ${esc(e.message)}</div>`;
  }
}
// ============ CHAT ============
const ADMIN_EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😜','😎','🤩','😏','🙂','🙃','😉','😇','🥰','😭','😅','🥺','😢','😡','🤔','🤗','🤫','🙌','👏','👍','👎','💪','🙏','💯','🔥','✨','⭐','❤️','💔','🌹','🌸','🍀','🎉','☕','🍕','⚽','🚀','💤','🤑','👀'];
let chatErrCount = 0;
const chatMediaCache = {};

function chatTicks(m, mine) {
  if (!mine) return '';
  return m.read ? '<span style="color:#53bdeb;">✓✓</span>' : '<span style="color:#8696a0;">✓</span>';
}

function appendChatImg(div, m) {
  const img = document.createElement('img');
  img.className = 'wa-img';
  div.appendChild(img);
  const mid = String(m.mediaId);
  const wire = () => { img.onclick = () => { const w = window.open(); if (w && img.src) w.document.write('<img src="' + img.src + '" style="max-width:100%">'); }; };
  if (chatMediaCache[mid]) { img.src = chatMediaCache[mid]; wire(); return; }
  apiFetch('/api/tess/chat/media/' + mid).then(d => {
    const url = 'data:' + d.mime + ';base64,' + d.data;
    chatMediaCache[mid] = url;
    img.src = url;
    wire();
  }).catch(() => { img.alt = 'imagen no disponible'; });
}

function renderChatMsg(m) {
  const boxEl = document.getElementById('chat-msgs');
  if (!boxEl) return;
  const ph = boxEl.querySelector('.empty-chat');
  if (ph) ph.remove();
  const mine = m.from === 'ADMIN';
  const div = document.createElement('div');
  div.className = 'bubble ' + (mine ? 'mine' : 'theirs');
  if (m.kind === 'image' && m.mediaId) {
    appendChatImg(div, m);
    if (m.text) { const c = document.createElement('div'); c.textContent = m.text; div.appendChild(c); }
  } else {
    div.textContent = m.text || '';
  }
  const meta = document.createElement('span');
  meta.className = 'wa-t';
  meta.innerHTML = new Date(m.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) + ' ' + chatTicks(m, mine);
  div.appendChild(meta);
  boxEl.appendChild(div);
  boxEl.scrollTop = boxEl.scrollHeight;
}

function compressChatImage(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/gif' && file.size <= 1500000) {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const max = 1280;
        let w = im.width, h = im.height;
        if (w > max || h > max) { const k = Math.min(max / w, max / h); w = Math.round(w * k); h = Math.round(h * k); }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(im, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = reject;
      im.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function sendChatImage(file) {
  if (!file || !chatWith) return;
  showTmpStatus('Enviando imagen…');
  try {
    const dataUrl = await compressChatImage(file);
    await apiFetch('/api/tess/chat/send-image', { method: 'POST', body: { to: chatWith, dataUrl } });
    await pollThread(false);
  } catch (e) { alert('Error al enviar imagen: ' + e.message); }
}

function showTmpStatus(txt) {
  document.getElementById('chat-head').innerHTML = `<span style="color:#8696a0;">${esc(txt)}</span>`;
}

function buildAdminEmojiBar() {
  const bar = document.getElementById('emoji-bar-admin');
  if (!bar || bar.dataset.built) return;
  ADMIN_EMOJIS.forEach(em => {
    const b = document.createElement('button');
    b.className = 'wa-emoji';
    b.type = 'button';
    b.textContent = em;
    b.addEventListener('click', () => { const i = document.getElementById('chat-text'); i.value += em; i.focus(); });
    bar.appendChild(b);
  });
  bar.dataset.built = '1';
}

function initChatUI() {
  document.getElementById('btn-chat-send').addEventListener('click', sendChatMsg);
  document.getElementById('chat-text').addEventListener('keypress', e => { if (e.key === 'Enter') sendChatMsg(); });
  document.getElementById('chat-threads').addEventListener('click', e => {
    const t = e.target.closest('.thread');
    if (t) openThread(t.dataset.email);
  });
  document.getElementById('btn-new-chat').addEventListener('click', () => {
    const sel = document.getElementById('new-chat-user');
    if (sel.value) openThread(sel.value);
  });
  const btnRefresh = document.getElementById('btn-chat-refresh');
  btnRefresh.addEventListener('click', async () => {
    btnRefresh.textContent = '⋯';
    try {
      await loadUsers(true);
      await refreshThreads();
      if (chatWith) await openThread(chatWith);
      else document.getElementById('chat-msgs').innerHTML = '<div class="empty-chat">Selecciona una conversación.</div>';
    } finally { btnRefresh.textContent = '⟳'; }
  });
  document.getElementById('btn-chat-clear').addEventListener('click', async () => {
    if (!chatWith) { alert('Abre primero una conversación.'); return; }
    if (!confirm('¿Eliminar TODO el historial de esta conversación (en ambos lados)? No se puede deshacer.')) return;
    try {
      await apiFetch('/api/tess/chat/clear', { method: 'POST', body: { with: chatWith } });
      delete chatLastTs[chatWith];
      await openThread(chatWith);
      refreshThreads();
    } catch (e) { alert('No se pudo eliminar: ' + e.message); }
  });
  document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('chat-file').click());
  document.getElementById('chat-file').addEventListener('change', e => {
    if (e.target.files[0]) sendChatImage(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btn-emoji').addEventListener('click', () => {
    buildAdminEmojiBar();
    const bar = document.getElementById('emoji-bar-admin');
    bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
  });
}

async function refreshThreads() {
  try {
    const d = await apiFetch('/api/tess/chat/threads');
    const threads = d.threads || [];
    const side = document.getElementById('chat-threads');
    if (!threads.length) {
      side.innerHTML = '<div class="placeholder">Sin conversaciones todavía.<br><br>Los operadores te escriben desde su panel en Talkytimes.</div>';
      return;
    }
    const names = {};
    cachedUsers.forEach(u => { names[u.email] = u.display_name; });
    side.innerHTML = threads.map(t =>
      `<div class="thread${t.email === chatWith ? ' active' : ''}" data-email="${esc(t.email)}">` +
      `<div class="t-name"><span>${esc(names[t.email] || t.email)}</span>${t.unread ? `<span class="unread">${t.unread}</span>` : ''}</div>` +
      `<div class="t-last">${esc(String(t.lastText).slice(0, 60))}</div></div>`).join('');
  } catch (e) { /* silencioso */ }
}

async function openThread(email) {
  chatWith = email;
  delete chatLastTs[email];
  const head = document.getElementById('chat-head');
  const box = document.getElementById('chat-msgs');
  const u = cachedUsers.find(x => x.email === email);
  head.innerHTML = `<span class="dot${u && u.last_activity && (Date.now() - u.last_activity) < ONLINE_WINDOW_MS ? ' online' : ''}"></span> ${esc((u && u.display_name) || email)} <span style="color:#555;">· ${esc(email)}</span>`;
  box.innerHTML = '<div class="empty-chat">Cargando mensajes…</div>';
  try {
    await pollThread(true);
    refreshThreads();
  } catch (e) {
    box.innerHTML = `<div class="empty-chat">Error: ${esc(e.message)}</div>`;
  }
}

async function pollThread(full) {
  if (!chatWith) return;
  const after = full ? 0 : (chatLastTs[chatWith] || 0);
  const d = await apiFetch(`/api/tess/chat/messages?with=${encodeURIComponent(chatWith)}&after=${after}`);
  const msgs = d.messages || [];
  if (!msgs.length && full) {
    document.getElementById('chat-msgs').innerHTML = '<div class="empty-chat">Aún no hay mensajes en esta conversación.</div>';
    return;
  }
  if (!msgs.length) return;
  const boxEl = document.getElementById('chat-msgs');
  if (full) boxEl.innerHTML = '';
  for (const m of msgs) {
    try { renderChatMsg(m); } catch (e) {
      const err = document.createElement('div');
      err.style.cssText = 'color:#f87171;font-size:11px;text-align:center;';
      err.textContent = '⚠ Error al pintar mensaje: ' + e.message;
      boxEl.appendChild(err);
    }
    chatLastTs[chatWith] = Math.max(chatLastTs[chatWith] || 0, m.ts);
  }
  boxEl.scrollTop = boxEl.scrollHeight;
}

async function sendChatMsg() {
  const input = document.getElementById('chat-text');
  const text = input.value.trim();
  if (!text || !chatWith) return;
  input.value = '';
  try {
    await apiFetch('/api/tess/chat/send', { method: 'POST', body: { to: chatWith, text } });
    await pollThread(false);
  } catch (e) { alert('Error al enviar: ' + e.message); }
}

// Refresco continuo de hilos: un operador nuevo aparece sin importar la pestana activa
timers.push(setInterval(() => { refreshThreads(); }, 5000));
// Poll del hilo abierto con auto-reparacion: si falla 3 veces seguidas, recarga completa
let chatPollErrs = 0;
timers.push(setInterval(() => {
  if (activeTab !== 'chat' || !chatWith) return;
  pollThread(false)
    .then(() => { chatPollErrs = 0; })
    .catch(() => { if (++chatPollErrs >= 3) { chatPollErrs = 0; openThread(chatWith); } });
}, 4000));

// ============ STAFF (solo admin raiz) ============
const STAFF_ROLE_LABEL = { admin: ['ADMIN GLOBAL', 'dev'], office: ['ADMIN OFICINA', 'premium'], master: ['MASTER', 'dev'] };

function initStaffUI() {
  document.getElementById('staff-role').addEventListener('change', e => {
    document.getElementById('staff-office-wrap').style.display = e.target.value === 'master' ? 'none' : '';
  });
  document.getElementById('btn-staff-create').addEventListener('click', createStaff);
  document.getElementById('staff-table-body').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-staff]');
    if (!btn) return;
    const email = btn.dataset.staff;
    if (!confirm('¿ELIMINAR al staff ' + email + '? Perderá el acceso de inmediato.')) return;
    try {
      await apiFetch('/api/tess/admin/staff/remove', { method: 'POST', body: { email } });
      loadStaff();
      loadUsers();
    } catch (err) { alert('Error: ' + err.message); }
  });
}

async function createStaff() {
  const name = document.getElementById('staff-name').value.trim();
  const email = document.getElementById('staff-email').value.trim().toLowerCase();
  const pass = document.getElementById('staff-pass').value;
  const role = document.getElementById('staff-role').value;
  const office = document.getElementById('staff-office').value.trim();
  if (!name || !email || !pass) return alert('Completa nombre, correo y clave.');
  if (!pass.endsWith('*+') || pass.length < 8) return alert('La clave debe tener mínimo 8 caracteres y terminar en *+');
  if (role === 'office' && !office) return alert('Indica la oficina para un admin de oficina.');
  try {
    const d = await apiFetch('/api/tess/admin/staff', { method: 'POST', body: { email, password: pass, name, role, office: office || null } });
    alert(d.message || 'Staff creado.');
    document.getElementById('staff-name').value = '';
    document.getElementById('staff-email').value = '';
    document.getElementById('staff-pass').value = '';
    loadStaff();
    loadUsers();
  } catch (err) { alert('Error: ' + err.message); }
}

async function loadStaff(silent) {
  const tbody = document.getElementById('staff-table-body');
  try {
    const d = await apiFetch('/api/tess/admin/staff');
    const users = d.users || [];
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder">Sin staff creado todavía.</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => {
      const rl = STAFF_ROLE_LABEL[u.staff_role] || [u.staff_role, 'demo'];
      return `<tr>
        <td><span class="uname">${esc(u.display_name || '(sin nombre)')}</span><br><span class="uemail">${esc(u.email)}</span></td>
        <td><span class="badge ${rl[1]}">${rl[0]}</span>${u.office ? `<br><small style="color:#888;">oficina: ${esc(u.office)}</small>` : ''}</td>
        <td style="color:#888;font-size:11px;">${new Date(u.created_at).toLocaleDateString('es')}</td>
        <td style="color:#888;font-size:11px;">${timeAgo(u.last_login)}<br><small style="color:#555;">${u.login_count || 0} inicios</small></td>
        <td><button class="act-btn danger" data-staff="${esc(u.email)}">QUITAR</button></td>
      </tr>`;
    }).join('');
  } catch (e) {
    if (!silent) tbody.innerHTML = `<tr><td colspan="5" class="placeholder">Error cargando staff: ${esc(e.message)}</td></tr>`;
  }
}
