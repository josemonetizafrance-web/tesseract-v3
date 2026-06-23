var TESSERACT_API = 'https://tesseract-api.onrender.com';

let currentToken = '';
let currentAdminEmail = '';
let userOffice = '';
let isOfficeAdmin = false;
let isMasterAdmin = false;

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tabName = this.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
      this.classList.add('active');
      var tabEl = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
      if (tabEl) tabEl.classList.add('active');
      if (tabName === 'users') loadUserList();
      if (tabName === 'offices') { loadOffices(); loadOfficesList(); }
    });
  });
}

function initCursorTesseract() {
  var el = document.getElementById('cursor-tesseract');
  if (!el) return;
  var mx = window.innerWidth / 2, my = window.innerHeight / 2;
  var cx = mx, cy = my;
  document.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
  });
  function tick() {
    cx += (mx - cx) * 0.08;
    cy += (my - cy) * 0.08;
    el.style.left = (cx - 32) + 'px';
    el.style.top = (cy - 32) + 'px';
    requestAnimationFrame(tick);
  }
  tick();
}

function apiFetch(endpoint, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    'Authorization': `Bearer ${currentToken}`,
    'Content-Type': 'application/json'
  };
  const fetchOptions = { method, headers, signal: AbortSignal.timeout(15000) };
  if (options.body) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  return fetch(`${TESSERACT_API}${endpoint}`, fetchOptions).then(async res => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Error ${res.status}`);
    }
    return res.json();
  }).catch(e => {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error('Timeout: el servidor no responde');
    }
    throw e;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedToken = urlParams.get('token');
  currentToken = encodedToken ? decodeURIComponent(encodedToken) : '';
  if (!currentToken) {
    window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
    return;
  }
  try {
    await initAdminPanel();
  } catch(e) {
    document.body.innerHTML = `<div style="padding:40px;color:#ef4444;font-family:monospace;background:#0a0a0f;min-height:100vh;">Error: ${e.message}</div>`;
  }
});

async function initAdminPanel() {
  try {
    const data = await apiFetch('/api/tess/auth/verify');
    if (!data || (!data.isAdmin && !data.isDeveloper && !data.isOfficeAdmin)) {
      document.body.innerHTML = `
        <div style="padding:40px;text-align:center;color:#ef4444;font-family:monospace;background:#0a0a0f;min-height:100vh;">
          <h1>⛔ SIN ACCESO</h1>
          <p style="color:#888;margin:20px 0;">No tienes permisos de administrador.</p>
        </div>`;
      return;
    }

    currentAdminEmail = data.email;
    userOffice = data.office;
    isOfficeAdmin = data.isOfficeAdmin;
    isMasterAdmin = data.isDeveloper === true || data.isAdmin === true;

    document.getElementById('admin-email').textContent = data.email + (userOffice ? ` — ${userOffice}` : '');

    if (isOfficeAdmin && !isMasterAdmin) {
      const adminTab = document.querySelector('.tab-btn[data-tab="admin"]');
      if (adminTab) adminTab.style.display = 'none';

      const officeInput = document.getElementById('new-user-office');
      if (officeInput) {
        officeInput.value = userOffice;
        officeInput.disabled = true;
        officeInput.placeholder = userOffice;
        officeInput.style.display = 'none';
      }
      const typeSelect = document.getElementById('new-user-type');
      if (typeSelect) {
        typeSelect.innerHTML = '<option value="operador">Operador</option>';
        typeSelect.value = 'operador';
        typeSelect.style.display = 'none';
      }
      const userTitle = document.querySelector('#user-management-section .panel-title');
      if (userTitle) userTitle.textContent = `GESTIÓN DE OPERADORES — ${userOffice}`;
      const actionsPanel = document.getElementById('admin-actions-panel');
      if (actionsPanel) actionsPanel.style.display = 'none';
    }

    await loadOffices();
    await loadOfficesList();

    document.getElementById('btn-refresh').addEventListener('click', async () => {
      await loadUserList(); await loadDeveloperList();
    });
    document.getElementById('btn-logout').addEventListener('click', async () => {
      await chrome.storage.local.clear();
      window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
    });
    document.getElementById('btn-activate-premium').addEventListener('click', activatePremium);
    document.getElementById('btn-ban-user').addEventListener('click', banUser);
    document.getElementById('btn-unban-user').addEventListener('click', unbanUser);
    document.getElementById('btn-change-password').addEventListener('click', changePassword);
    document.getElementById('btn-add-dev').addEventListener('click', addDeveloper);
    document.getElementById('btn-create-user').addEventListener('click', createUser);
    document.getElementById('btn-create-office').addEventListener('click', createOffice);

    initTabs();
    initCursorTesseract();

    await loadUserList();
    await loadDeveloperList();

  } catch (e) {
    document.body.innerHTML = `
      <div id="error-container" style="padding:40px;color:#ef4444;font-family:monospace;background:#0a0a0f;min-height:100vh;">
        <h2 style="color:#ef4444;">ERROR EN ADMIN PANEL</h2>
        <p style="color:#fca5a5;margin:16px 0;">${e.message}</p>
        <button id="btn-error-login" style="margin-top:20px;padding:10px 20px;background:#8b5cf6;border:none;border-radius:4px;color:#fff;cursor:pointer;">IR AL LOGIN</button>
      </div>`;
    document.getElementById('btn-error-login').addEventListener('click', () => {
      window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
    });
  }
}

async function loadOffices() {
  if (isOfficeAdmin && !isMasterAdmin) return;
  try {
    const data = await apiFetch('/api/tess/admin/offices');
  } catch (e) {
    console.error('[ADMIN] Error al cargar oficinas:', e.message);
  }
}

async function loadOfficesList() {
  if (isOfficeAdmin && !isMasterAdmin) return;
  try {
    const data = await apiFetch('/api/tess/admin/offices');
    const container = document.getElementById('offices-list');
    if (!container) return;
    if (!data.offices || !data.offices.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#555;">Sin oficinas registradas</div>';
      return;
    }
    container.innerHTML = data.offices.map(o => {
      const name = o.name || o;
      return '<div style="display:flex;flex-direction:column;gap:6px;background:rgba(245,158,11,0.08);border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;text-align:center;font-family:inherit;color:#f59e0b;font-size:14px;font-weight:700;">' +
        '<span>' + name + '</span>' +
        '<button class="btn-del-office" data-office="' + name + '" style="padding:4px 8px;background:transparent;border:1px solid #ef4444;color:#ef4444;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600;">✕ ELIMINAR</button>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.btn-del-office').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const name = btn.dataset.office;
        if (!confirm('¿Eliminar la oficina "' + name + '"?')) return;
        try {
          await apiFetch('/api/tess/admin/offices/' + encodeURIComponent(name), { method: 'DELETE' });
          await loadOfficesList();
        } catch (e) { alert('Error: ' + e.message); }
      });
    });
  } catch (e) { console.warn('[ADMIN] loadOfficesList:', e); }
}

async function loadUserList() {
  try {
    const data = await apiFetch('/api/tess/admin/users');
    if (!data?.users) return;
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '';

    if (!data.users.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Sin usuarios</td></tr>';
      return;
    }

    data.users.forEach(function (u) {
      var isMaster = u.is_developer === 1 || u.is_developer === true;
      var statusText = u.role, statusClass = 'status-demo';
      if (isMaster || u.is_developer) { statusText = 'DESARROLLADOR'; statusClass = 'status-premium'; }
      else if (u.role === 'premium') { statusText = 'PREMIUM'; statusClass = 'status-premium'; }
      else if (u.is_banned) { statusText = 'BANEADO'; statusClass = 'status-banned'; }
      else if (u.role === 'expired') { statusText = 'EXPIRADO'; statusClass = 'status-expired'; }

      var officeLabel = u.office || '—';
      var activeLabel = (u.is_banned || u.role === 'expired') ? 'INACTIVO' : 'ACTIVO';
      var activeColor = (u.is_banned || u.role === 'expired') ? '#ef4444' : '#22c55e';

      var row = document.createElement('tr');
      row.innerHTML =
        '<td><span style="color:#f59e0b;font-weight:600;">' + officeLabel + '</span><br><small style="color:' + activeColor + ';font-size:9px;">' + activeLabel + '</small></td>' +
        '<td style="font-weight:500;">' + u.email + '</td>' +
        '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>' +
        '<td>' + (u.login_count || 0) + '</td>' +
        '<td>' + (!isMaster ? '<button class="action-btn premium btn-premium" data-email="' + u.email + '">PREMIUM</button>' : '') + '</td>' +
        '<td><input type="text" class="input-field plan-input" data-email="' + u.email + '" placeholder="plan..." style="width:70px;padding:4px 8px;font-size:10px;min-width:0;">' +
            '<button class="action-btn btn-set-plan" data-email="' + u.email + '" style="padding:4px 8px;margin-left:4px;">SET</button></td>' +
        '<td>' + (!isMaster ? '<button class="action-btn btn-danger btn-delete-user" data-email="' + u.email + '" style="padding:4px 8px;">✕</button>' : '') + '</td>';
      tbody.appendChild(row);
    });

    tbody.addEventListener('click', async function (e) {
      var target = e.target.closest('button');
      if (!target) return;
      var email = target.dataset.email;
      if (!email) return;
      if (target.classList.contains('btn-premium')) {
        await apiFetch('/api/tess/admin/premium', { method: 'POST', body: { email } });
        await loadUserList();
      }
      if (target.classList.contains('btn-set-plan')) {
        var plan = target.closest('tr').querySelector('.plan-input').value.trim().toLowerCase();
        if (!plan) return;
        await apiFetch('/api/tess/admin/set-plan', { method: 'POST', body: { email, plan } });
        await loadUserList();
      }
      if (target.classList.contains('btn-delete-user')) {
        if (!confirm('¿Eliminar usuario ' + email + '?')) return;
        try {
          await apiFetch('/api/tess/admin/users/' + encodeURIComponent(email), { method: 'DELETE' });
          await loadUserList();
        } catch (err) { alert('Error: ' + err.message); }
      }
    });
  } catch (e) { console.error('[ADMIN] loadUserList:', e); }
}

async function activatePremium() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    await apiFetch('/api/tess/admin/premium', { method: 'POST', body: { email } });
    document.getElementById('input-email').value = '';
    await loadUserList();
  } catch (e) { alert('Error: ' + e.message); }
}

async function banUser() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    await apiFetch('/api/tess/admin/ban', { method: 'POST', body: { email } });
    document.getElementById('input-email').value = '';
    await loadUserList();
  } catch (e) { alert(e.message); }
}

async function unbanUser() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    await apiFetch('/api/tess/admin/unban', { method: 'POST', body: { email } });
    document.getElementById('input-email').value = '';
    await loadUserList();
  } catch (e) { alert(e.message); }
}

async function changePassword() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();
  const password = document.getElementById('new-password-input').value.trim();
  if (!email) return alert('Ingresa el email');
  if (!password) return alert('Ingresa la nueva contraseña');
  if (!password.endsWith('*+')) return alert('La contraseña debe terminar en *+');
  try {
    await apiFetch('/api/tess/admin/set-password', { method: 'POST', body: { email, password } });
    document.getElementById('input-email').value = '';
    document.getElementById('new-password-input').value = '';
    alert('Contraseña actualizada correctamente');
  } catch (e) { alert(e.message); }
}

async function addDeveloper() {
  const email = document.getElementById('input-dev-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    await apiFetch('/api/tess/admin/developer', { method: 'POST', body: { email, action: 'add' } });
    document.getElementById('input-dev-email').value = '';
    await loadUserList();
    await loadDeveloperList();
  } catch (e) { alert(e.message); }
}

async function removeDeveloper(email) {
  if (!confirm('¿Eliminar desarrollador ' + email + '?')) return;
  try {
    await apiFetch('/api/tess/admin/developer', { method: 'POST', body: { email, action: 'remove' } });
    await loadUserList();
    await loadDeveloperList();
  } catch (e) { alert(e.message); }
}

async function loadDeveloperList() {
  const container = document.getElementById('dev-list-items');
  if (!container) return;
  try {
    const data = await apiFetch('/api/tess/admin/users');
    const devs = (data.users || []).filter(function (u) { return u.is_developer === 1 || u.is_developer === true; });
    if (!devs.length) { container.innerHTML = '<div style="color:#aaa;font-size:11px;">No hay desarrolladores</div>'; return; }
    container.innerHTML = devs.map(function (u) {
      var isMaster = u.email === 'ChevyAdmin@tesseract.com';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8f8fc;border-radius:8px;border:1px solid #f0f0f5;">' +
        '<span style="font-size:12px;font-weight:500;color:#1a1a2e;">' + u.email + '</span>' +
        '<button class="action-btn btn-danger btn-remove-dev" data-email="' + u.email + '" style="padding:4px 12px;font-size:11px;' + (isMaster ? 'opacity:0.4;cursor:not-allowed;' : '') + '" ' + (isMaster ? 'disabled' : '') + '>✕ ELIMINAR</button>' +
        '</div>';
    }).join('');
    container.querySelectorAll('.btn-remove-dev').forEach(function (btn) {
      btn.addEventListener('click', function () { removeDeveloper(btn.dataset.email); });
    });
  } catch (e) { container.innerHTML = '<div style="color:#ef4444;font-size:11px;">Error: ' + e.message + '</div>'; }
}

async function createUser() {
  const email = document.getElementById('new-user-email')?.value?.trim().toLowerCase();
  const password = document.getElementById('new-user-password')?.value?.trim();
  const officeEl = document.getElementById('new-user-office');
  const office = officeEl?.disabled ? userOffice : officeEl?.value?.trim();
  const userType = document.getElementById('new-user-type')?.value || 'operador';

  if (!email) return alert('Ingresa el email');
  if (!password) return alert('Ingresa la contraseña');
  if (!email.endsWith('@tesseract.com')) return alert('Solo correos @tesseract.com');
  if (!password.endsWith('*+')) return alert('La contraseña debe terminar en *+');

  try {
    const result = await apiFetch('/api/tess/admin/create-user', {
      method: 'POST',
      body: { email, password, office, userType }
    });
    alert(`Usuario ${userType === 'admin' ? 'ADMIN' : 'OPERADOR'} creado correctamente`);
    document.getElementById('new-user-email').value = '';
    document.getElementById('new-user-password').value = '';
    if (!officeEl?.disabled) document.getElementById('new-user-office').value = '';
    document.getElementById('new-user-type').value = 'operador';
    await loadUserList();
    await loadOffices();
  } catch (e) {
    alert('Error al crear usuario: ' + e.message);
  }
}

async function createOffice() {
  const name = document.getElementById('new-office-name')?.value?.trim();
  if (!name) return alert('Ingresa el nombre de la oficina');
  try {
    await apiFetch('/api/tess/admin/create-office', { method: 'POST', body: { name } });
    alert('Oficina creada correctamente');
    document.getElementById('new-office-name').value = '';
    await loadOffices();
    await loadOfficesList();
  } catch (e) {
    alert('Error al crear oficina: ' + e.message);
  }
}
