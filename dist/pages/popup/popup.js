(function () {
  var TESSERACT_API = (typeof TESSERACT_API_OVERRIDE !== 'undefined') ? TESSERACT_API_OVERRIDE : 'https://tesseract-v3-production.up.railway.app';
  var storedToken = '';

  function formatTime(ms) {
    if (ms <= 0 || ms === Infinity) return ms === Infinity ? 'Unlimited' : 'Expired';
    var d = Math.floor(ms / 86400000);
    var h = Math.floor((ms % 86400000) / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  function renderLoggedOut(section) {
    section.innerHTML =
      '<p style="font-size:11px;color:#8888a0;margin-bottom:12px;text-align:center;">No has iniciado sesi\u00f3n</p>' +
      '<button class="btn btn-primary" id="btn-login">INICIAR SESI\u00d3N</button>';
    document.getElementById('btn-login').addEventListener('click', function () {
      window.open(chrome.runtime.getURL('dist/pages/login/login.html'), '_blank');
    });
  }

  chrome.storage.local.get(['tess_jwt', 'user_email'], function (data) {
    var section = document.getElementById('auth-section');
    if (!section) return;
    if (!data.tess_jwt || !data.user_email) return renderLoggedOut(section);
    
    storedToken = data.tess_jwt;
    var html =
      '<div class="status-bar"><span>Estado:</span><span class="status-badge status-premium">ACTIVE</span></div>' +
      '<div class="email-display">' + data.user_email + '</div>' +
      '<div class="time-remaining">Acceso ilimitado</div>' +
      '<button class="btn btn-primary" id="btn-dashboard">ABRIR DASHBOARD</button>' +
      '<button class="btn btn-secondary" id="btn-cribs-book">📋 CRIBS BOOK</button>' +
      '<button class="btn btn-danger" id="btn-logout">CERRAR SESI\u00d3N</button>';
    section.innerHTML = html;

    document.getElementById('btn-dashboard').addEventListener('click', function () {
      window.open(chrome.runtime.getURL('dist/pages/dashboard/dashboard.html'), '_blank');
    });
    var adminBtn = document.getElementById('btn-admin');
    if (adminBtn) adminBtn.addEventListener('click', function () {
      (async function () {
        try { if (storedToken) await chrome.storage.session.set({ adminToken: storedToken }); } catch (e) {}
        window.open(chrome.runtime.getURL('dist/pages/admin/admin.html'), '_blank');
      })();
    });
    document.getElementById('btn-cribs-book').addEventListener('click', function () {
      window.open(chrome.runtime.getURL('dist/pages/cribs-book/cribs-book.html'), '_blank');
    });
    document.getElementById('btn-logout').addEventListener('click', function () {
      chrome.storage.local.clear();
      window.close();
    });
  });
})();

