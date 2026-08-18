(function () {
  var allCribs = [];
  var filteredCribs = [];

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleDateString(); } catch (e) { return '—'; }
  }

  function countLines(str) {
    if (!str || !str.trim()) return 0;
    return str.split('\n').filter(function (l) { return l.trim(); }).length;
  }

  function showToast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }

  function render() {
    var searchTerm = (document.getElementById('searchInput').value || '').toLowerCase();
    filteredCribs = allCribs.filter(function (c) {
      if (!searchTerm) return true;
      var name = (c.profile_name || '').toLowerCase();
      var pid = String(c.profile_id || '').toLowerCase();
      return name.includes(searchTerm) || pid.includes(searchTerm);
    });

    var statsBar = document.getElementById('statsBar');
    statsBar.innerHTML = '👥 <strong>' + allCribs.length + '</strong> perfiles  |  🔍 <strong>' + filteredCribs.length + '</strong> mostrados  |  🎭 <strong>' + allCribs.filter(function (c) { return c.voice_style && c.voice_style.trim(); }).length + '</strong> con estilo de voz  |  📬 <strong>' + allCribs.filter(function (c) { return c.letter_style && c.letter_style.trim(); }).length + '</strong> con estilo de carta';

    var content = document.getElementById('content');
    if (filteredCribs.length === 0) {
      content.innerHTML = '<div class="empty"><h2>📋</h2><p>' + (allCribs.length === 0 ? 'No hay perfiles en CRIBS aún.<br>Abre talkytimes.com, haz clic en 📋 y luego en ⬇ SCRAPE en un perfil.' : 'Ningún perfil coincide con la búsqueda.') + '</p></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < filteredCribs.length; i++) {
      var c = filteredCribs[i];
      var voiceLines = countLines(c.voice_style);
      var letterLines = countLines(c.letter_style);
      var hasVoice = voiceLines > 0;
      var hasLetter = letterLines > 0;

      html += '<div class="profile-card" data-idx="' + i + '">';
      html += '<div class="profile-card-header" onclick="toggleCard(this)">';
      html += '<div><span class="name">' + escapeHtml(c.profile_name || 'Sin nombre') + '</span> <span class="badge">ID: <span>' + escapeHtml(String(c.profile_id || '—')) + '</span></span></div>';
      html += '<div><span class="badge">' + (c.country || '') + (c.age ? ' · ' + c.age + ' años' : '') + '</span>';
      if (hasVoice || hasLetter) {
        html += '<span style="margin-left:8px;font-size:10px;color:#60a5fa;">';
        if (hasVoice) html += '🎭' + voiceLines;
        if (hasVoice && hasLetter) html += ' ';
        if (hasLetter) html += '📬' + letterLines;
        html += '</span>';
      }
      html += '<span class="arrow" style="margin-left:10px;">▼</span></div>';
      html += '</div>';

      html += '<div class="profile-card-body">';
      html += '<div class="info-grid">';
      var fields = [
        { label: 'País', key: 'country' },
        { label: 'Edad', key: 'age' },
        { label: 'Intereses', key: 'interests' },
        { label: 'Ciudad', key: 'city' },
        { label: 'Trabajo', key: 'work' },
        { label: 'Estado Civil', key: 'marital_status' },
        { label: 'Rasgos', key: 'traits' },
        { label: 'Cine', key: 'movie_genres' },
        { label: 'Música', key: 'music_genres' },
        { label: 'Objetivo', key: 'goal' },
        { label: 'Idiomas', key: 'languages' },
        { label: 'Educación', key: 'education' },
        { label: 'Busca', key: 'looking_for' },
        { label: 'Complexión', key: 'body_type' },
        { label: 'Bio', key: 'bio' }
      ];
      for (var fi = 0; fi < fields.length; fi++) {
        var val = c[fields[fi].key];
        if (val === null || val === undefined || val === '') continue;
        html += '<div class="info-row"><span class="label">' + fields[fi].label + ':</span> <span class="value">' + escapeHtml(String(val)) + '</span></div>';
      }
      html += '</div>';

      if (hasVoice) {
        html += '<div class="style-section"><h4>🎭 ESTILO DE VOZ <span class="style-count">(' + voiceLines + ' mensajes)</span></h4>';
        var voiceLinesArr = c.voice_style.split('\n').filter(function (l) { return l.trim(); });
        for (var vi = voiceLinesArr.length - 1; vi >= 0; vi--) {
          html += '<div class="style-item">' + escapeHtml(voiceLinesArr[vi]) + '</div>';
        }
        html += '</div>';
      }

      if (hasLetter) {
        html += '<div class="style-section"><h4>📬 ESTILO DE CARTA <span class="style-count">(' + letterLines + ' cartas)</span></h4>';
        var letterLinesArr = c.letter_style.split('\n').filter(function (l) { return l.trim(); });
        for (var li = letterLinesArr.length - 1; li >= 0; li--) {
          html += '<div class="style-item letter">' + escapeHtml(letterLinesArr[li]) + '</div>';
        }
        html += '</div>';
      }

      html += '<div class="card-actions">';
      html += '<button class="delete-btn" onclick="deleteEntry(\'' + escapeHtml(String(c.profile_id || c._id || '')) + '\')">🗑 ELIMINAR</button>';
      html += '</div></div></div>';
    }
    content.innerHTML = html;
  }

  window.toggleCard = function (el) {
    var body = el.nextElementSibling;
    var arrow = el.querySelector('.arrow');
    if (body) body.classList.toggle('open');
    if (arrow) arrow.classList.toggle('open');
  };

  window.deleteEntry = function (profileId) {
    if (!profileId) { showToast('⚠ Sin ID para eliminar'); return; }
    if (!confirm('¿Eliminar este perfil de CRIBS?')) return;
    chrome.storage.local.get('tess_cribs', function (data) {
      var cribs = data.tess_cribs || [];
      var idx = -1;
      for (var i = 0; i < cribs.length; i++) {
        if (String(cribs[i].profile_id) === String(profileId) || String(cribs[i]._id) === String(profileId)) {
          idx = i;
          break;
        }
      }
      if (idx === -1) { showToast('⚠ Perfil no encontrado'); return; }
      cribs.splice(idx, 1);
      chrome.storage.local.set({ tess_cribs: cribs }, function () {
        allCribs = cribs;
        render();
        showToast('🗑 Perfil eliminado');
      });
    });
  };

  function loadCribs() {
    chrome.storage.local.get('tess_cribs', function (data) {
      allCribs = data.tess_cribs || [];
      render();
    });
  }

  document.getElementById('searchInput').addEventListener('input', render);

  document.getElementById('btnExport').addEventListener('click', function () {
    var json = JSON.stringify(allCribs, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tesseract-cribs-export.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 Exportado (' + allCribs.length + ' perfiles)');
  });

  document.getElementById('btnBack').addEventListener('click', function () {
    window.close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.close();
  });

  loadCribs();
})();
