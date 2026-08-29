(function () {
  var TESSERACT_API = (typeof TESSERACT_API_OVERRIDE !== 'undefined') ? TESSERACT_API_OVERRIDE : 'https://tesseract-v3-production.up.railway.app';
  var currentJwt = null;

  function formatTime(ms) {
    if (ms <= 0 || ms === Infinity) return ms === Infinity ? 'Ilimitado' : 'Expirado';
    var d = Math.floor(ms / 86400000);
    var h = Math.floor((ms % 86400000) / 3600000);
    return d > 0 ? d + ' d\u00edas ' + h + ' horas' : h + ' horas';
  }

  function showNotification(msg, type) {
    var el = document.getElementById('notification');
    el.textContent = msg;
    el.className = 'notification notification-' + type + ' show';
    setTimeout(function () { el.classList.remove('show'); }, 3000);
  }

  function notesApi(path, options) {
    return fetch(TESSERACT_API + path, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentJwt },
      ...options
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function switchView(viewName) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
    var targetView = document.getElementById('view-' + viewName);
    if (targetView) targetView.classList.add('active');
    var navItem = document.querySelector('.nav-item[data-view="' + viewName + '"]');
    if (navItem) navItem.classList.add('active');
    if (viewName === 'notes') renderMyNotes();
  }

  function renderMyNotes() {
    var list = document.getElementById('my-notes-list');
    list.innerHTML = '<p class="note-empty">Cargando notas...</p>';
    notesApi('/api/tess/notes').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.notes || !data.notes.length) {
        list.innerHTML = '<p class="note-empty">No tienes notas todavia. Crea una arriba.</p>';
        return;
      }
      list.innerHTML = data.notes.map(function (n) {
        var sharedCount = (n.shared_with || []).length;
        var sharedBadge = sharedCount > 0 ? '<span class="note-shared-badge">Compartida (' + sharedCount + ')</span>' : '';
        return '<div class="note-card" data-id="' + n._id + '">' +
          '<div class="note-card-header">' +
            '<div>' +
              '<div class="note-card-title">' + escapeHtml(n.client_name || 'Sin nombre') + ' <span style="color:#666;font-weight:400;">#' + escapeHtml(n.client_id || '') + '</span></div>' +
              '<div class="note-card-sub">' + escapeHtml(n.profile_name || 'Sin perfil') + '</div>' +
            '</div>' +
            '<div>' + sharedBadge + '</div>' +
          '</div>' +
          '<div class="note-card-text">' + escapeHtml(n.note_text) + '</div>' +
          '<div class="note-card-actions">' +
            '<button class="btn-notes btn-notes-outline btn-notes-sm btn-edit-note" data-id="' + n._id + '">EDITAR</button>' +
            '<button class="btn-notes btn-notes-success btn-notes-sm btn-share-note" data-id="' + n._id + '">COMPARTIR</button>' +
            '<button class="btn-notes btn-notes-danger btn-notes-sm btn-delete-note" data-id="' + n._id + '">ELIMINAR</button>' +
          '</div>' +
          '<div class="note-card-meta">' + new Date(n.created_at).toLocaleString() + '</div>' +
        '</div>';
      });
      attachNoteActions();
    }).catch(function () {
      list.innerHTML = '<p class="note-empty" style="color:#ef4444;">Error al cargar notas</p>';
    });
  }

  function renderSharedNotes() {
    var list = document.getElementById('shared-notes-list');
    list.innerHTML = '<p class="note-empty">Cargando notas compartidas...</p>';
    notesApi('/api/tess/notes/shared').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.notes || !data.notes.length) {
        list.innerHTML = '<p class="note-empty">No hay notas compartidas contigo</p>';
        return;
      }
      list.innerHTML = data.notes.map(function (n) {
        return '<div class="note-card">' +
          '<div class="note-card-header">' +
            '<div>' +
              '<div class="note-card-title">' + escapeHtml(n.client_name || 'Sin nombre') + ' <span style="color:#666;font-weight:400;">#' + escapeHtml(n.client_id || '') + '</span></div>' +
              '<div class="note-card-sub">' + escapeHtml(n.profile_name || 'Sin perfil') + '</div>' +
            '</div>' +
            '<div><span class="note-shared-badge">COMPARTIDA</span></div>' +
          '</div>' +
          '<div class="note-card-text">' + escapeHtml(n.note_text) + '</div>' +
          '<div class="note-card-meta">' + new Date(n.created_at).toLocaleString() + '</div>' +
        '</div>';
      });
    }).catch(function () {
      list.innerHTML = '<p class="note-empty" style="color:#ef4444;">Error al cargar notas compartidas</p>';
    });
  }

  function attachNoteActions() {
    document.querySelectorAll('.btn-edit-note').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditModal(this.dataset.id); });
    });
    document.querySelectorAll('.btn-share-note').forEach(function (btn) {
      btn.addEventListener('click', function () { openShareModal(this.dataset.id); });
    });
    document.querySelectorAll('.btn-delete-note').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('Eliminar esta nota?')) {
          notesApi('/api/tess/notes/' + this.dataset.id, { method: 'DELETE' }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.success) { showNotification('Nota eliminada', 'success'); renderMyNotes(); }
            else { showNotification('Error al eliminar', 'error'); }
          }).catch(function () { showNotification('Error de conexion', 'error'); });
        }
      });
    });
  }

  var editingNoteId = null;
  function openEditModal(noteId) {
    editingNoteId = noteId;
    notesApi('/api/tess/notes').then(function (r) { return r.json(); }).then(function (data) {
      var note = data.notes.find(function (n) { return n._id === noteId; });
      if (!note) return;
      document.getElementById('edit-profile-name').value = note.profile_name || '';
      document.getElementById('edit-client-name').value = note.client_name || '';
      document.getElementById('edit-client-id').value = note.client_id || '';
      document.getElementById('edit-note-text').value = note.note_text || '';
      document.getElementById('edit-modal').style.display = 'flex';
    });
  }

  var sharingNoteId = null;
  function openShareModal(noteId) {
    sharingNoteId = noteId;
    var select = document.getElementById('share-user-select');
    select.innerHTML = '<option value="">Cargando usuarios...</option>';
    document.getElementById('share-modal').style.display = 'flex';
    notesApi('/api/tess/notes/users').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.users || !data.users.length) {
        select.innerHTML = '<option value="">No hay otros usuarios disponibles</option>';
        return;
      }
      select.innerHTML = '<option value="">Selecciona un usuario...</option>' +
        data.users.map(function (u) { return '<option value="' + escapeHtml(u.email) + '">' + escapeHtml(u.email) + (u.office ? ' (' + escapeHtml(u.office) + ')' : '') + '</option>'; }).join('');
    }).catch(function () {
      select.innerHTML = '<option value="">Error al cargar usuarios</option>';
    });
  }

  function initNotes() {
    document.querySelectorAll('.nav-item[data-view]').forEach(function (item) {
      item.addEventListener('click', function () { switchView(this.dataset.view); });
    });

    document.getElementById('btn-back-dash').addEventListener('click', function () {
      switchView('dashboard');
    });

    document.querySelectorAll('.notes-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.notes-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.notes-tab-content').forEach(function (c) { c.classList.remove('active'); });
        this.classList.add('active');
        var target = document.getElementById('tab-' + this.dataset.tab);
        if (target) {
          target.classList.add('active');
          if (this.dataset.tab === 'shared-notes') renderSharedNotes();
        }
      });
    });

    document.getElementById('btn-save-note').addEventListener('click', function () {
      var profileName = document.getElementById('note-profile-name').value.trim();
      var clientName = document.getElementById('note-client-name').value.trim();
      var clientId = document.getElementById('note-client-id').value.trim();
      var noteText = document.getElementById('note-text').value.trim();
      if (!noteText) { showNotification('Escribe el texto de la nota', 'error'); return; }
      notesApi('/api/tess/notes', {
        method: 'POST',
        body: JSON.stringify({ profile_name: profileName, client_name: clientName, client_id: clientId, note_text: noteText })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.success) {
          showNotification('Nota guardada', 'success');
          document.getElementById('note-profile-name').value = '';
          document.getElementById('note-client-name').value = '';
          document.getElementById('note-client-id').value = '';
          document.getElementById('note-text').value = '';
          switchView('dashboard');
        } else { showNotification('Error al guardar', 'error'); }
      }).catch(function () { showNotification('Error de conexion', 'error'); });
    });

    document.getElementById('btn-cancel-share').addEventListener('click', function () {
      document.getElementById('share-modal').style.display = 'none';
    });
    document.getElementById('btn-confirm-share').addEventListener('click', function () {
      var email = document.getElementById('share-user-select').value;
      if (!email) { showNotification('Selecciona un usuario', 'error'); return; }
      notesApi('/api/tess/notes/' + sharingNoteId + '/share', {
        method: 'POST',
        body: JSON.stringify({ target_email: email })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.success) {
          showNotification('Nota compartida con ' + email, 'success');
          document.getElementById('share-modal').style.display = 'none';
          renderMyNotes();
        } else { showNotification(d.error || 'Error al compartir', 'error'); }
      }).catch(function () { showNotification('Error de conexion', 'error'); });
    });

    document.getElementById('btn-cancel-edit').addEventListener('click', function () {
      document.getElementById('edit-modal').style.display = 'none';
      editingNoteId = null;
    });
    document.getElementById('btn-confirm-edit').addEventListener('click', function () {
      if (!editingNoteId) return;
      var profileName = document.getElementById('edit-profile-name').value.trim();
      var clientName = document.getElementById('edit-client-name').value.trim();
      var clientId = document.getElementById('edit-client-id').value.trim();
      var noteText = document.getElementById('edit-note-text').value.trim();
      if (!noteText) { showNotification('Escribe el texto de la nota', 'error'); return; }
      notesApi('/api/tess/notes/' + editingNoteId, {
        method: 'PUT',
        body: JSON.stringify({ profile_name: profileName, client_name: clientName, client_id: clientId, note_text: noteText })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.success) {
          showNotification('Nota actualizada', 'success');
          document.getElementById('edit-modal').style.display = 'none';
          editingNoteId = null;
          renderMyNotes();
        } else { showNotification('Error al actualizar', 'error'); }
      }).catch(function () { showNotification('Error de conexion', 'error'); });
    });

    document.getElementById('share-modal').addEventListener('click', function (e) {
      if (e.target === this) this.style.display = 'none';
    });
    document.getElementById('edit-modal').addEventListener('click', function (e) {
      if (e.target === this) this.style.display = 'none';
    });
  }

  chrome.storage.local.get(['tess_jwt', 'tess_refresh', 'user_email'], async function (data) {
    if (!data.tess_jwt || !data.user_email) {
      window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
      return;
    }
    currentJwt = data.tess_jwt;
    document.getElementById('user-info').textContent = data.user_email;

    var badge = document.getElementById('status-badge');
    badge.textContent = 'ACTIVE';
    badge.className = 'status-badge status-premium';

    var timeEl = document.getElementById('time-remaining');
    timeEl.textContent = 'Acceso ilimitado';

    var adminBtn = document.getElementById('btn-admin');
    // Panel admin visible SOLO para admins/desarrolladores verificados por el servidor
    try {
      const vres = await fetch(TESSERACT_API + '/api/tess/auth/verify', { headers: { 'Authorization': 'Bearer ' + currentJwt } });
      const vjson = await vres.json();
      if (adminBtn && vres.ok && (vjson.isAdmin || vjson.isDeveloper)) {
        adminBtn.style.display = '';
      } else if (adminBtn && !vres.ok) {
        // Respaldo: flag guardado en el login si /verify no responde
        const flags = await chrome.storage.local.get(['isAdmin', 'isDeveloper']);
        if (flags.isAdmin || flags.isDeveloper) adminBtn.style.display = '';
      }
    } catch (e) { /* sin permisos: queda oculto */ }

    document.getElementById('btn-open-bot').addEventListener('click', function () {
      chrome.tabs.create({ url: 'https://talkytimes.com/', active: true });
    });
    document.getElementById('btn-admin').addEventListener('click', function () {
      var token = data.tess_jwt;
      (async function () {
        try { if (token) await chrome.storage.session.set({ adminToken: token }); } catch (e) {}
        window.open(chrome.runtime.getURL('dist/pages/admin/admin.html'), '_blank');
      })();
    });
    document.getElementById('btn-logout').addEventListener('click', function () {
      chrome.storage.local.clear();
      window.location.href = chrome.runtime.getURL('dist/pages/login/login.html');
    });

    initNotes();
  });
})();

