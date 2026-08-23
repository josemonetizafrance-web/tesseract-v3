// TESSERACT v24.0 - Core State (uses Tesseract state-manager)
const ALLOWED_DOMAIN = 'talkytimes.com';

const RESPONSE_ALERT_SECONDS = 90;
const TIMER_DISPLAY_SECONDS = 120;

function isBlacklisted(contactId) {
  if (!contactId) return false;
  return Tesseract.isBlacklisted(contactId);
}

// ============ CROSS-TAB UI SYNC ============
function _tessSyncEaterUI() {
  var ea = Tesseract.get('eaterActive');
  const btn = document.getElementById('btnEaterToggle');
  if (btn) {
    btn.textContent = '🧠 EATER: ' + (ea ? 'ON' : 'OFF');
    btn.className = 'eater-btn' + (ea ? ' on' : '');
  }
  const sug = document.getElementById('eaterSuggestions');
  if (sug) sug.style.display = ea ? 'block' : 'none';
}

function _tessSyncCloneUI() {
  var ca = Tesseract.get('clonacionActiva');
  const btn = document.getElementById('btnStopClone');
  if (!btn) return;
  if (ca) {
    btn.innerHTML = '⏹ CLONACIÓN: ACTIVA';
    btn.style.borderColor = '#ef4444';
    btn.style.background = 'rgba(239,68,68,0.15)';
    btn.style.color = '#ef4444';
  } else {
    btn.innerHTML = '▶ CLONACIÓN: DETENIDA';
    btn.style.borderColor = '#22c55e';
    btn.style.background = 'rgba(34,197,94,0.15)';
    btn.style.color = '#22c55e';
  }
}

window._tessSyncUI = function () {
  _tessSyncEaterUI();
  _tessSyncCloneUI();
};

// Sync event listeners from state-manager
Tesseract.on('eaterActiveChanged', _tessSyncEaterUI);
Tesseract.on('clonacionChanged', _tessSyncCloneUI);



// ============ ICEBREAKERS IA ============
window._ibMessages = [];
window._ibMode = 'idle';

function renderIBPreview() {
  var container = document.getElementById('ibPreview');
  if (!container) return;
  if (!window._ibMessages || window._ibMessages.length === 0) {
    container.innerHTML = '<div style="color:#666;font-size:10px;text-align:center;padding:8px;">Genera mensajes con el bot\u00f3n \ud83c\udfb2 GENERAR</div>';
    return;
  }
  var labels = { friendship: '\ud83d\udd35 Amistad', real_love: '\u2764\ufe0f Amor Real', hot_talks: '\ud83d\udd25 Charla Caliente', mail: '\ud83d\udcec Mail' };
  var colors = { friendship: '#8b5cf6', real_love: '#ef4444', hot_talks: '#f59e0b', mail: '#10b981' };
  container.innerHTML = window._ibMessages.map(function (m, i) {
    if (m.selected === undefined) m.selected = true;
    var cat = labels[m.category] || m.category;
    var col = colors[m.category] || '#8b5cf6';
    var txt = (m.text || m.message || m.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    var checked = m.selected ? 'checked' : '';
    return '<div style="margin-bottom:4px;"><label style="display:flex;align-items:center;gap:6px;font-size:9px;color:' + col + ';font-weight:bold;margin-bottom:1px;cursor:pointer;"><input type="checkbox" data-idx="' + i + '" ' + checked + ' style="accent-color:' + col + ';cursor:pointer;">' + cat + '</label><textarea data-idx="' + i + '" style="width:100%;padding:4px;background:#111;border:1px solid ' + col + ';border-radius:4px;color:#e0e0e0;font-size:10px;font-family:Arial;resize:vertical;box-sizing:border-box;min-height:36px;">' + txt + '</textarea></div>';
  }).join('');
  container.removeEventListener('input', ibEditHandler);
  container.addEventListener('input', ibEditHandler);
  container.removeEventListener('change', ibCheckHandler);
  container.addEventListener('change', ibCheckHandler);
}

function ibCheckHandler(e) {
  var cb = e.target;
  if (cb.tagName !== 'INPUT' || cb.type !== 'checkbox' || cb.dataset.idx === undefined) return;
  var idx = parseInt(cb.dataset.idx);
  if (window._ibMessages && window._ibMessages[idx]) {
    window._ibMessages[idx].selected = cb.checked;
  }
}

function ibEditHandler(e) {
  var ta = e.target;
  if (ta.tagName !== 'TEXTAREA' || ta.dataset.idx === undefined) return;
  var idx = parseInt(ta.dataset.idx);
  if (window._ibMessages && window._ibMessages[idx]) {
    window._ibMessages[idx].text = ta.value;
  }
}

async function generateIcebreakersFromAI() {
  try {
    window._ibMessages = [];
    window._ibMode = 'generating';
    updateIBUI();
    var token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
    if (!token) { showTessToast('No hay sesión activa. Inicia sesión primero.', 'error'); window._ibMode = 'idle'; updateIBUI(); return; }
    var systemPrompt = (typeof TESS_MASTER_PROMPT!=='undefined'?TESS_MASTER_PROMPT+'\n\n':'') + 'Tu tarea es generar mensajes únicos e interesantes para romper el hielo en una plataforma de citas. Todos reflejan la vida diaria de un hombre/mujer de 30 años o más, con temas maduros, cotidianos y un toque de humor cuando encaja.\n\nCUATRO CATEGORÍAS\nRH Amistad: Rompehielos relajados, neutros y amigables. Conexión tranquila, como si empezáramos una buena amistad que podría derivar en algo más. Tono cálido, cero presión romántica explícita.\nRH Amor Real: Rompehielos con intención emocional y romántica elegante, madura y respetuosa. Se nota interés genuino en conocer a la persona a fondo y ganas de algo serio cuando surja la química.\nRH Charla Caliente: Rompehielos juguetones, coquetos y ligeramente atrevidos, pero SIN cruzar nunca la línea: nada sexual explícito, nada de insinuaciones físicas directas ni doble sentido grosero. El caliente está solo en el tono pícaro, el humor sutil y la confianza atractiva de un hombre adulto.\nRH Mail: Mensajes más largos (4-8 líneas) ideales para primer contacto privado. NO dirigidos a nadie en concreto (sin Hola [Nombre], sin referencias a fotos/perfil). Genéricos pero muy personales y auténticos, escritos en primera persona. Estructura típica: anécdota o reflexión cotidiana → toque de humor o sinceridad → pregunta abierta potente que invite a una respuesta larga.\n\nREGLAS GENERALES (aplican a las 4 categorías)\n100 % español.\nTono maduro, respetuoso, fácil de responder.\nProhibido contenido sexual explícito, obscenidades, lenguaje abusivo, preguntas invasivas o datos de contacto.\nCada mensaje completo por sí mismo, lógico y único (nada de reutilizar ideas aunque cambien palabras o emojis).\nNO uses emojis ni símbolos. Texto plano sin emojis.\nTemas: rutinas matutinas, trabajo-vida, cocina, gimnasio, viajes, música/podcasts, desconexión, responsabilidades adultas, lugares favoritos, reflexiones con humor, etc.\nLÍMITES DE LONGITUD: Los mensajes friendship, real_love y hot_talks deben tener máximo 280 caracteres. Los mensajes mail deben tener 4-8 líneas.\n\nFORMATO DE RESPUESTA: Responde ÚNICAMENTE con un array JSON de 5 objetos. Cada objeto debe tener "text" (string, el mensaje) y "category" (string: "friendship", "real_love", "hot_talks" o "mail"). No agregues explicaciones, markdown ni nada fuera del JSON.\n\nREGLAS DE MODERACIÓN DEL SITIO (OBLIGATORIAS PARA QUE SE APRUEBEN)\n- Los rompehielos deben ser neutrales e impersonalizados.\n- El sitio solo aprueba textos en inglés: los mensajes se generan en español para el operador y se traducirán a inglés antes del envío; el contenido debe ser aprobable en inglés.\n- Los rompehielos deben ser coherentes con la Política de uso del sitio.\n- Prohibido contenido para adultos, sexo virtual, frases obscenas, contenido abusivo y extorsión.\n- Todos los mensajes y cartas de Icebreaker deben tener sentido y ser fáciles de entender.\n- Cada rompehielos debe ser lógicamente completo e independiente. No escribas una historia repartida en varios rompehielos, ni uses oraciones lógicamente no relacionadas dentro de un mismo rompehielos.\n- No repitas los mismos Icebreakers aunque cambien los emoticones o la puntuación: las invitaciones duplicadas afectan negativamente la experiencia de los usuarios del sitio.\n- No escribas los nombres de otros usuarios en tu Icebreaker.\n- No uses emojis inapropiados que puedan tener significado sexual o aumentar la ambigüedad del texto.\n- No uses caracteres adicionales sin sentido en las palabras (como 0, 1, - en lugar de emoji, ~~Hello~~, etc.).\n- El Icebreaker no debe contener tu información de contacto ni información falsa sobre ti.\n- Usa texto en fuente estándar; las fuentes y emojis decorativos personalizados pueden no mostrarse bien y serán rechazados por el Equipo de Moderación.\n- Si usas emojis, usa solo los incorporados al sitio web.\n\nTEMAS SUGERIDOS PARA INICIAR CONVERSACIÓN\nhobbies, películas, libros, comida, cultura, autointroducción, historias de vida interesantes, situaciones infantiles divertidas, música, planes para el futuro, coches, tecnologías, estilo de vida.';
    var aiData = await Tesseract.callAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'Genera 5 mensajes como un SOLO array JSON con 5 objetos. Cada objeto solo tiene "categoria" y "mensaje". 1 friendship, 1 real_love, 1 hot_talks, 2 mail. SIN emojis ni campo emojis. SOLO el array JSON.' }],
      1500
    );
    var content = aiData?.choices?.[0]?.message?.content || '';
    console.log('[IB] Raw AI response (first 500):', content.substring(0, 500));
    var jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (jsonMatch) jsonMatch = jsonMatch[1];
    else {
      var fallback = content.match(/\[[\s\S]*?\]/g);
      if (fallback) jsonMatch = '[' + fallback.map(function(m){ return m.slice(1,-1); }).join(',') + ']';
      else jsonMatch = null;
    }
    if (!jsonMatch) { showTessToast('Error: la IA no devolvió JSON válido. Revisa la consola (F12).', 'error'); window._ibMode = 'idle'; updateIBUI(); return; }
    jsonMatch = jsonMatch.replace(/[\x00-\x1F\x7F]/g, '');
    var parsed = JSON.parse(jsonMatch);
    if (!Array.isArray(parsed) || parsed.length < 5) { showTessToast('Error: la IA devolvió menos de 5 mensajes', 'error'); window._ibMode = 'idle'; updateIBUI(); return; }
    window._ibMessages = parsed.map(function(m) {
      if (!m) return null;
      if (!m.text) m.text = m.mensaje || m.message || m.content || m.texto || '';
      // Normalizacion robusta: la IA puede devolver "RH Amistad", "friendship", etc.
      var rawCat = String(m.categoria || m.category || m.type || m.tipo || '').toLowerCase();
      if (rawCat.indexOf('amistad') > -1 || rawCat === 'friendship') m.category = 'friendship';
      else if (rawCat.indexOf('amor') > -1 || rawCat === 'real_love') m.category = 'real_love';
      else if (rawCat.indexOf('caliente') > -1 || rawCat.indexOf('hot') > -1) m.category = 'hot_talks';
      else if (rawCat.indexOf('mail') > -1 || rawCat.indexOf('correo') > -1) m.category = 'mail';
      else m.category = 'friendship';
      return m;
    }).filter(Boolean);
    window._ibMode = 'ready';
    renderIBPreview();
    updateIBUI();
    showTessToast('5 Icebreakers generados correctamente', 'success');
  } catch (e) {
    console.error('[IB] Error generando:', e);
    showTessToast('Error al generar Icebreakers: ' + e.message, 'error');
    window._ibMode = 'idle';
    updateIBUI();
  }
}

async function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function translateTextToEnglish(text) {
  try {
    var token = await new Promise(function (r) { chrome.storage.local.get('tess_jwt', function (d) { r(d.tess_jwt); }); });
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var resp = await fetch(Tesseract.API + '/api/openai/translate', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ text: text, targetLang: 'en', targetName: 'English' })
    });
    var data = await resp.json();
    if (data.success && data.data?.translations?.[0]?.text) return data.data.translations[0].text;
    if (data.translatedText) return data.translatedText;
  } catch (e) { console.warn('[IB] Translation error:', e.message); }
  return text;
}

async function translateIcebreakersToEnglish() {
  if (!window._ibMessages || window._ibMessages.length === 0) {
    showTessToast('Primero genera los mensajes con 🎲 GENERAR', 'warning');
    return;
  }
  if (window._ibMode === 'sending' || window._ibMode === 'generating') return;
  window._ibMode = 'translating';
  updateIBUI();
  var statusEl = document.getElementById('ibStatus');
  if (statusEl) statusEl.textContent = 'Traduciendo al inglés…';
  var items = window._ibMessages;
  for (var ti = 0; ti < items.length; ti++) {
    if (!items[ti] || !items[ti].text) continue;
    var tResult = await translateTextToEnglish(items[ti].text);
    if (tResult && tResult.trim() && tResult.trim() !== items[ti].text.trim()) items[ti].text = tResult.trim();
  }
  window._ibMode = 'ready';
  renderIBPreview();
  if (statusEl) statusEl.textContent = 'Traducido al inglés';
  showTessToast('🌐 Icebreakers traducidos al inglés', 'success');
  updateIBUI();
}

async function executeIcebreakerSweep() {
  if (!window._ibMessages || window._ibMessages.length < 5) {
    showTessToast('Primero genera los mensajes con 🎲 GENERAR', 'warning');
    return;
  }
  if (window._ibMode === 'sending') return;
  if (document.querySelector('.warning-text')) {
    showTessToast('Límite diario de Icebreakers alcanzado (warning-text detectado)', 'error');
    return;
  }
  window._ibMode = 'sending';
  updateIBUI();
  var toSend = window._ibMessages.filter(function(m) { return m.selected !== false; });
  if (toSend.length === 0) {
    showTessToast('Selecciona al menos un Icebreaker para enviar', 'warning');
    window._ibMode = 'idle'; updateIBUI(); return;
  }
  var catOrder = { friendship: 1, real_love: 2, hot_talks: 3, mail: 4 };
  toSend.sort(function(a, b) { return (catOrder[a.category] || 99) - (catOrder[b.category] || 99); });
  document.getElementById('ibStatus').textContent = 'Traduciendo al ingl\u00e9s\u2026';
  var translated = [];
  for (var ti = 0; ti < toSend.length; ti++) {
    var tResult = await translateTextToEnglish(toSend[ti].text);
    translated.push({ category: toSend[ti].category, text: tResult || toSend[ti].text, selected: toSend[ti].selected });
  }
  window._ibMessages = toSend = translated;
  toSend.sort(function(a, b) { return (catOrder[a.category] || 99) - (catOrder[b.category] || 99); });
  renderIBPreview();
  var total = toSend.length;
  document.getElementById('ibStatus').textContent = 'Enviando 1/' + total + '\u2026';
  try {
    var link = document.querySelector(TALK_Y.ICEBREAKER_SIDEBAR_LINK);
    if (link && !document.querySelector('.sidebar-statistics .accordion__header')?.classList.contains('active')) {
      link.click();
      await sleep(800);
    }
    for (var i = 0; i < toSend.length; i++) {
      if (window._ibMode !== 'sending') break;
      var msg = toSend[i];
      document.getElementById('ibStatus').textContent = 'Enviando ' + (i + 1) + '/' + total + '\u2026';
      var createBtn = document.evaluate('//label[.//p[contains(translate(text(),"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"create new")]]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!createBtn) {
        createBtn = document.querySelector(TALK_Y.ICEBREAKER_CREATE_NEW) || Array.from(document.querySelectorAll('label.chip-root')).find(function (l) { return /create\s*new/i.test(l.textContent || ''); }) || null;
      }
      if (!createBtn) { showTessToast('No se encontró el botón Create new en la página Icebreakers', 'error'); break; }
      createBtn.click();
      console.log('[IB] createBtn clicked for msg', i, 'category:', msg.category);
      await sleep(800);
      var textarea = null;
      for (var tw = 0; tw < 8; tw++) {
        textarea = document.querySelector(TALK_Y.ICEBREAKER_TEXTAREA) || document.querySelector('textarea[placeholder="Type your message here"]:not([maxlength="1000"])');
        if (textarea && !textarea.disabled) break;
        await sleep(200);
      }
      if (!textarea) { showTessToast('No se encontró el textarea', 'error'); break; }
      await sleep(300);
      textarea.removeAttribute('disabled');
      textarea.disabled = false;
      textarea.value = msg.text;
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: msg.text }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      if (msg.category && msg.category.toLowerCase() === 'mail') {
        var radio = document.querySelector(TALK_Y.ICEBREAKER_RADIO_MAIL) || document.querySelector('input[type="radio"][name="messageType"][value="mail"]');
        if (radio) { (radio.closest('label') || radio).click(); await sleep(400); }
        var mailTextarea = document.querySelector(TALK_Y.ICEBREAKER_TEXTAREA_MAIL);
        if (mailTextarea && mailTextarea !== textarea) {
          mailTextarea.removeAttribute('disabled');
          mailTextarea.disabled = false;
          mailTextarea.value = msg.text;
          mailTextarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: msg.text }));
          mailTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        var moodMap = { friendship: 'friendship', real_love: 'real_love', hot_talks: 'hot_talks' };
        var mood = moodMap[(msg.category || '').toLowerCase()] || 'friendship';
        console.log('[IB] mood selection: category=', msg.category, '→ mood=', mood);
        var moodEl = null;
        for (var mc = 0; mc < 10; mc++) {
          var candidates = document.querySelectorAll('div[data-mood="' + mood + '"]');
          moodEl = Array.from(candidates).find(function (el) {
            return el.getAttribute('data-isselectable') === 'true' && el.getAttribute('data-isdisabled') !== 'true';
          });
          if (!moodEl) {
            var wrapEl = document.querySelector('[data-test-id="mood-chip selectMood ' + mood + '"]');
            if (wrapEl) {
              moodEl = wrapEl.querySelector('div[data-mood]') || (wrapEl.getAttribute('data-mood') === mood ? wrapEl : null);
            }
          }
          if (!moodEl) {
            var anyChip = Array.from(document.querySelectorAll('[data-test-id*="mood-chip"], .mood-chip'));
            moodEl = anyChip.map(function (c) { return c.querySelector('div[data-mood]') || c; }).find(function (c) {
              return c.getAttribute('data-mood') === mood || (c.getAttribute('data-test-id') || '').indexOf(mood) !== -1;
            }) || null;
          }
          if (moodEl) break;
          await sleep(200);
        }
        console.log('[IB] moodEl found for', mood, moodEl ? '✓' : '✗');
        if (moodEl) {
          moodEl.click();
          var selected = false;
          for (var sw = 0; sw < 15; sw++) {
            await sleep(200);
            if (document.querySelector('div[data-mood="' + mood + '"][data-isselected="true"]')) { selected = true; break; }
          }
          console.log('[IB] mood clicked:', mood, '| confirmado:', selected);
          if (!selected) console.log('[IB] WARN: mood no confirmo data-isselected, continuando');
          await sleep(300);
        } else {
          console.log('[IB] mood element not found for:', mood);
        }
      }
      await sleep(300);
      var sendBtn = document.querySelector(TALK_Y.ICEBREAKER_SEND_MODERATION);
      if (!sendBtn) {
        sendBtn = Array.from(document.querySelectorAll('button')).find(function(b) {
          return /\bSend for Moderation\b/i.test(b.textContent);
        });
      }
      if (!sendBtn) { showTessToast('No se encontró el botón Send for Moderation', 'error'); break; }
      console.log('[IB] sending msg', i, 'category:', msg.category);
      sendBtn.click();
      await sleep(1500);
      if (document.querySelector('.warning-text')) {
        showTessToast('Límite diario alcanzado. Se detuvo el envío.', 'error');
        window._ibMode = 'idle'; updateIBUI(); return;
      }
      window._ibSentCount = (window._ibSentCount || 0) + 1;
      var stats = Tesseract.get('botStats');
      stats.icebreakersSent = (stats.icebreakersSent || 0) + 1;
      Tesseract.set('botStats', stats);
      console.log('[IB] waiting after send for msg', i);
      for (var w = 0; w < 12; w++) {
        var remains = document.querySelector(TALK_Y.ICEBREAKER_TEXTAREA) || document.querySelector('textarea[placeholder="Type your message here"]');
        if (!remains) break;
        await sleep(300);
      }
    }
    document.getElementById('ibStatus').textContent = window._ibMode === 'sending' ? 'Completado' : 'Detenido';
    if (window._ibMode === 'sending') {
      showTessToast(toSend.length + ' Icebreakers enviados a moderaci\u00f3n', 'success');
    }
  } catch (e) {
    console.error('[IB] Error en sweep:', e);
    showTessToast('Error durante el env\u00edo: ' + e.message, 'error');
  }
  window._ibMode = 'idle';
  updateIBUI();
}

function abortIcebreakerSweep() {
  window._ibMode = 'idle';
  updateIBUI();
}

function updateIBUI() {
  var genBtn = document.getElementById('btnIBGenerate');
  var sendBtn = document.getElementById('btnIBSend');
  var trBtn = document.getElementById('btnIBTranslate');
  var status = document.getElementById('ibStatus');
  if (genBtn) genBtn.disabled = window._ibMode === 'sending' || window._ibMode === 'generating';
  if (sendBtn) sendBtn.disabled = window._ibMode !== 'ready';
  if (trBtn) trBtn.disabled = window._ibMode === 'sending' || window._ibMode === 'generating' || !window._ibMessages || window._ibMessages.length === 0;
  if (status) {
    var labels = { idle: 'Listo', generating: 'Generando\u2026', translating: 'Traduciendo\u2026', ready: 'Listo para enviar', sending: 'Enviando\u2026' };
    status.textContent = labels[window._ibMode] || 'Listo';
  }
}

window._generateIcebreakers = generateIcebreakersFromAI;
window._executeIcebreakerSweep = executeIcebreakerSweep;
window._abortIcebreakerSweep = abortIcebreakerSweep;
window._translateIcebreakersToEnglish = translateIcebreakersToEnglish;
window._updateIBUI = updateIBUI;

// ============ IB REMINDER ============
// Detector: cuando el operador lanza icebreakers manualmente (botones Launch de
// mail/chat), arranca un contador de 3h persistente. Al terminar, recordatorio:
// ACTUALIZA IB MALPARID@

var IB_REMINDER_PERIOD_MS = 3 * 3600 * 1000;
var _ibReminderInterval = null;
var _ibCurrentEndAt = 0;

// ── FREEZE: pausa el contador (persistente) ──
window._ibFrozen = false;
try { window._ibFrozen = localStorage.getItem('tessIbFrozen') === '1'; } catch (e) {}

function _ibSetFrozenUI(on) {
  var btn = document.getElementById('btnIBFreeze');
  if (!btn) return;
  btn.textContent = on ? '\u2744 CONGELADO' : '\u2744 FREEZE';
  btn.style.borderColor = on ? '#38bdf8' : '#555';
  btn.style.background = on ? 'rgba(56,189,248,0.25)' : 'transparent';
  btn.style.color = on ? '#38bdf8' : '#888';
}

function _ibStartTicking(endAt) {
  _ibCurrentEndAt = endAt;
  try { localStorage.setItem('tessIbVisionEndAt', String(endAt)); } catch (e) {}
  if (_ibReminderInterval) clearInterval(_ibReminderInterval);
  _ibReminderInterval = setInterval(function () { _ibReminderTick(endAt); }, 1000);
}

function _ibReminderShow() {
  showTessToast('ACTUALIZA IB MALPARID@', 'error');
  var el = document.getElementById('ibVisionTimer');
  if (el) { el.style.display = 'block'; el.textContent = '\u26a0 ACTUALIZA IB'; }
  var modal = document.getElementById('ibVisionModal');
  if (modal) {
    modal.style.display = 'flex';
    var okBtn = document.getElementById('ibVisionModalOk');
    if (okBtn) okBtn.onclick = function () { modal.style.display = 'none'; };
  }
}

function _ibReminderTick(endAt) {
  var left = Math.max(0, Math.floor((endAt - Date.now()) / 1000));
  var el = document.getElementById('ibVisionTimer');
  var h = String(Math.floor(left / 3600)).padStart(2, '0');
  var m = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
  var s = String(left % 60).padStart(2, '0');
  if (el) { el.style.display = 'block'; el.textContent = '\u23f1 ' + h + ':' + m + ':' + s; }
  if (left <= 0) {
    clearInterval(_ibReminderInterval);
    _ibReminderInterval = null;
    try { localStorage.removeItem('tessIbVisionEndAt'); localStorage.setItem('tessIbOverdue', '1'); } catch (e) {}
    console.log('[IB] 3h cumplidas: ACTUALIZA IB');
    _ibReminderShow();
  }
}

function startIbReminder() {
  var endAt = Date.now() + IB_REMINDER_PERIOD_MS;
  try {
    localStorage.removeItem('tessIbOverdue');
    localStorage.removeItem('tessIbFrozenRemaining');
    localStorage.removeItem('tessIbFrozen');
  } catch (e) {}
  window._ibFrozen = false;
  _ibSetFrozenUI(false);
  _ibStartTicking(endAt);
  console.log('[IB] Lanzamiento manual detectado - contador de 3h activado');
}
window.startIbReminder = startIbReminder;

// Toggle FREEZE: detiene el contador y lo deja pausado hasta descongelar
window._toggleIBFreeze = function () {
  window._ibFrozen = !window._ibFrozen;
  try { localStorage.setItem('tessIbFrozen', window._ibFrozen ? '1' : '0'); } catch (e) {}
  var el = document.getElementById('ibVisionTimer');
  if (window._ibFrozen) {
    if (_ibReminderInterval) {
      var left = Math.max(0, _ibCurrentEndAt - Date.now());
      try { localStorage.setItem('tessIbFrozenRemaining', String(left)); } catch (e) {}
      clearInterval(_ibReminderInterval);
      _ibReminderInterval = null;
    }
    if (el && !el.textContent.includes('ACTUALIZA')) el.textContent = '\u2744 CONGELADO';
    showTessToast('Contador congelado: NO avisara al cumplir 3h', 'info');
  } else {
    var rem = 0;
    try { rem = parseInt(localStorage.getItem('tessIbFrozenRemaining'), 10) || 0; } catch (e) {}
    if (rem > 0) _ibStartTicking(Date.now() + rem);
    showTessToast(rem > 0 ? 'Contador reanudado' : 'Descongelado', rem > 0 ? 'success' : 'info');
  }
  _ibSetFrozenUI(window._ibFrozen);
};

// Click en cualquiera de los dos botones Launch (mail o chat) => contador
document.addEventListener('click', function (ev) {
  try {
    var btn = ev.target && ev.target.closest && ev.target.closest('button[data-test-id*="open-launch-mail-icebreaker"], button[data-test-id*="open-launch-message-icebreaker"]');
    if (btn && !btn.disabled) startIbReminder();
  } catch (e) {}
}, true);

// Reanudar tras recarga de pagina
(function _ibReminderRestore() {
  _ibSetFrozenUI(window._ibFrozen);
  var frozenRem = 0;
  try { frozenRem = parseInt(localStorage.getItem('tessIbFrozenRemaining'), 10) || 0; } catch (e) {}
  var raw = null;
  try { raw = localStorage.getItem('tessIbVisionEndAt'); } catch (e) {}
  var endAt = parseInt(raw, 10) || 0;
  // Congelado: mostrar pausado, sin tick
  if (window._ibFrozen) {
    if (frozenRem > 0 || endAt > Date.now()) {
      var el = document.getElementById('ibVisionTimer');
      if (el) { el.style.display = 'block'; el.textContent = '\u2744 CONGELADO'; }
      return;
    }
    return;
  }
  if (endAt > Date.now()) {
    _ibStartTicking(endAt);
    return;
  }
  var overdue = false;
  try { overdue = localStorage.getItem('tessIbOverdue') === '1'; } catch (e) {}
  if (overdue) setTimeout(_ibReminderShow, 2500);
})();

// ============ LANGUAGE DETECTION ============
function detectLanguage(text) {
  if (!text) return null;
  var t = text.toLowerCase().trim();
  var words = t.split(/\s+/).filter(function (w) { return w.length > 2; });
  if (words.length === 0) return null;
  var dicts = {
    en: ['the', 'you', 'and', 'for', 'are', 'but', 'not', 'was', 'have', 'has', 'had', 'your', 'with', 'from', 'they', 'this', 'that', 'she', 'her', 'what', 'all', 'can', 'want', 'know', 'love', 'like'],
    es: ['que', 'las', 'los', 'por', 'para', 'con', 'del', 'como', 'mas', 'pero', 'esta', 'este', 'esto', 'muy', 'todo', 'bien', 'cuando', 'si', 'solo', 'cada', 'quiero', 'estoy', 'eres', 'hola'],
    fr: ['les', 'des', 'que', 'pas', 'pour', 'dans', 'avec', 'vous', 'elle', 'ils', 'sur', 'nous', 'plus', 'tout', 'mais', 'fait', 'faire', 'suis', 'veux', 'aime', 'bonjour'],
    pt: ['que', 'para', 'com', 'dos', 'das', 'mais', 'como', 'muito', 'isso', 'esta', 'este', 'aqui', 'tudo', 'bem', 'sua', 'seu', 'voce', 'ela', 'quero', 'estou', 'amo', 'olá'],
    de: ['der', 'die', 'das', 'und', 'ich', 'nicht', 'mit', 'ein', 'auf', 'auch', 'sich', 'für', 'den', 'sie', 'bei', 'von', 'ist', 'wie', 'du', 'zu', 'mich', 'dich', 'dass', 'hallo'],
    it: ['che', 'per', 'con', 'non', 'una', 'sono', 'più', 'della', 'delle', 'cosa', 'come', 'bene', 'molto', 'ti', 'mi', 'tu', 'il', 'gli', 'dove', 'voglio', 'amo', 'ciao'],
    nl: ['het', 'een', 'van', 'dat', 'ik', 'je', 'niet', 'met', 'voor', 'ook', 'maar', 'die', 'zijn', 'we', 'op', 'aan', 'dan', 'zo', 'jij', 'mij', 'mijn', 'houden', 'hallo']
  };
  var scores = {};
  for (var lang in dicts) scores[lang] = 0;
  for (var wi = 0; wi < words.length; wi++) {
    for (var lang in dicts) {
      if (dicts[lang].indexOf(words[wi]) !== -1) scores[lang]++;
    }
  }
  var best = null, bestScore = 0;
  for (var lang in scores) {
    if (scores[lang] > bestScore) { bestScore = scores[lang]; best = lang; }
  }
  if (!best || bestScore === 0) return null;
  if (best === 'es') return null;
  return best;
}


