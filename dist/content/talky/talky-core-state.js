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
    var systemPrompt = 'Tu tarea es generar mensajes únicos e interesantes para romper el hielo en una plataforma de citas. Todos reflejan la vida diaria de un hombre/mujer de 30 años o más, con temas maduros, cotidianos y un toque de humor cuando encaja.\n\nCUATRO CATEGORÍAS\nRH Amistad: Rompehielos relajados, neutros y amigables. Conexión tranquila, como si empezáramos una buena amistad que podría derivar en algo más. Tono cálido, cero presión romántica explícita.\nRH Amor Real: Rompehielos con intención emocional y romántica elegante, madura y respetuosa. Se nota interés genuino en conocer a la persona a fondo y ganas de algo serio cuando surja la química.\nRH Charla Caliente: Rompehielos juguetones, coquetos y ligeramente atrevidos, pero SIN cruzar nunca la línea: nada sexual explícito, nada de insinuaciones físicas directas ni doble sentido grosero. El caliente está solo en el tono pícaro, el humor sutil y la confianza atractiva de un hombre adulto.\nRH Mail: Mensajes más largos (4-8 líneas) ideales para primer contacto privado. NO dirigidos a nadie en concreto (sin Hola [Nombre], sin referencias a fotos/perfil). Genéricos pero muy personales y auténticos, escritos en primera persona. Estructura típica: anécdota o reflexión cotidiana → toque de humor o sinceridad → pregunta abierta potente que invite a una respuesta larga.\n\nREGLAS GENERALES (aplican a las 4 categorías)\n100 % español.\nTono maduro, respetuoso, fácil de responder.\nProhibido contenido sexual explícito, obscenidades, lenguaje abusivo, preguntas invasivas o datos de contacto.\nCada mensaje completo por sí mismo, lógico y único (nada de reutilizar ideas aunque cambien palabras o emojis).\nNO uses emojis ni símbolos. Texto plano sin emojis.\nTemas: rutinas matutinas, trabajo-vida, cocina, gimnasio, viajes, música/podcasts, desconexión, responsabilidades adultas, lugares favoritos, reflexiones con humor, etc.\nLÍMITES DE LONGITUD: Los mensajes friendship, real_love y hot_talks deben tener máximo 280 caracteres. Los mensajes mail deben tener 4-8 líneas.\n\nFORMATO DE RESPUESTA: Responde ÚNICAMENTE con un array JSON de 5 objetos. Cada objeto debe tener "text" (string, el mensaje) y "category" (string: "friendship", "real_love", "hot_talks" o "mail"). No agregues explicaciones, markdown ni nada fuera del JSON.';
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
    if (!jsonMatch) { showTessToast('Error: la IA no devolviÃ³ JSON vÃ¡lido. Revisa la consola (F12).', 'error'); window._ibMode = 'idle'; updateIBUI(); return; }
    jsonMatch = jsonMatch.replace(/[\x00-\x1F\x7F]/g, '');
    var parsed = JSON.parse(jsonMatch);
    if (!Array.isArray(parsed) || parsed.length < 5) { showTessToast('Error: la IA devolvió menos de 5 mensajes', 'error'); window._ibMode = 'idle'; updateIBUI(); return; }
    window._ibMessages = parsed.map(function(m) {
      if (!m) return null;
      if (!m.text) m.text = m.mensaje || m.message || m.content || m.texto || '';
      if (!m.category) m.category = m.categoria || m.type || m.tipo || 'friendship';
      m.category = m.category.toLowerCase();
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
      var createBtn = document.evaluate('//label[.//p[contains(text(),"create new")]]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!createBtn) {
        createBtn = document.querySelector(TALK_Y.ICEBREAKER_CREATE_NEW);
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
        var radio = document.querySelector(TALK_Y.ICEBREAKER_RADIO_MAIL);
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
          var allChips = document.querySelectorAll('.mood-chip');
          if (allChips.length) {
            moodEl = document.querySelector(TALK_Y.ICEBREAKER_MOOD(mood));
            if (!moodEl) {
              moodEl = Array.from(allChips).find(function(c) {
                return c.getAttribute('data-mood') === mood || c.textContent.trim().toLowerCase().replace(/\s/g, '_') === mood;
              });
            }
            if (moodEl) break;
          }
          await sleep(200);
        }
        console.log('[IB] moodEl found for', mood, moodEl ? '✓' : '✗');
        if (moodEl) {
          moodEl.click();
          console.log('[IB] mood clicked:', mood);
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
  var status = document.getElementById('ibStatus');
  if (genBtn) genBtn.disabled = window._ibMode === 'sending' || window._ibMode === 'generating';
  if (sendBtn) sendBtn.disabled = window._ibMode !== 'ready';
  if (status) {
    var labels = { idle: 'Listo', generating: 'Generando\u2026', ready: 'Listo para enviar', sending: 'Enviando\u2026' };
    status.textContent = labels[window._ibMode] || 'Listo';
  }
}

window._generateIcebreakers = generateIcebreakersFromAI;
window._executeIcebreakerSweep = executeIcebreakerSweep;
window._abortIcebreakerSweep = abortIcebreakerSweep;
window._updateIBUI = updateIBUI;

// ============ IB VISION ============
window._ibVisionPhrases = [
  "I like your style, very unique and refreshing.",
  "You seem like someone who enjoys the simple things in life.",
  "Your smile says a lot about your energy, I like it.",
  "What's the most spontaneous thing you've done lately?",
  "I can tell you have a great sense of humor just by your vibe.",
  "Your profile is one of the most interesting I've seen today.",
  "There's something about your energy that caught my attention.",
  "You look like you know how to enjoy every moment.",
  "I have a feeling we would have really interesting conversations.",
  "Your pictures show you have an adventurous soul.",
  "You radiate good vibes, I had to stop and say hi.",
  "I'm curious what kind of music gets you dancing.",
  "You seem like the kind of person who tells great stories.",
  "Your eyes are incredibly captivating.",
  "I bet you're the funniest person in your friend group.",
  "You have that rare mix of elegance and fun energy.",
  "I can see you're someone who values genuine connections.",
  "You look like you'd be amazing to travel with.",
  "Your energy is magnetic, I had to reach out.",
  "I sense you have a beautiful soul behind those eyes."
];

window._ibVisionActive = false;

async function _ibVisionSelectRandom(index) {
  console.log('[IB VISION] selectRandom: index=' + index);
  var allPlaceholders = document.querySelectorAll('.multiselect__placeholder, .multiselect__tags');
  var allInputs = document.querySelectorAll('input.multiselect__input');
  console.log('[IB VISION] selectRandom: ' + allPlaceholders.length + ' placeholders, ' + allInputs.length + ' inputs');
  var targetIdx = (index !== undefined && index !== null) ? index : 0;
  var placeholder = allPlaceholders[targetIdx];
  var input = allInputs[targetIdx];
  if (!placeholder) {
    console.log('[IB VISION] selectRandom: NOT FOUND for index', targetIdx);
    return false;
  }
  console.log('[IB VISION] selectRandom: haciendo clic en placeholder/tags');
  placeholder.click();
  await sleep(1000);
  for (var r = 0; r < 12; r++) {
    var options = document.querySelectorAll('.multiselect__content .multiselect__element, .multiselect__content li, .multiselect__option, [role="option"]');
    var realOptions = Array.from(options || []).filter(function(o) {
      var txt = (o.textContent || '').trim().toLowerCase();
      return txt && txt !== 'no icebreakers found' && txt !== 'list is empty.' && txt.indexOf('no icebreakers') === -1 && txt.indexOf('list is empty') === -1;
    });
    if (realOptions && realOptions.length > 0) {
      var pick = realOptions[Math.floor(Math.random() * realOptions.length)];
      console.log('[IB VISION] selectRandom: click option:', pick.textContent?.trim()?.substring(0,50));
      pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      pick.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      pick.click();
      await sleep(600);
      console.log('[IB VISION] selectRandom: option clicked OK');
      return true;
    }
    await sleep(400);
  }
  console.log('[IB VISION] selectRandom: sin opciones reales, escribiendo frase en input...');
  var phrase = window._ibVisionPhrases[Math.floor(Math.random() * window._ibVisionPhrases.length)];
  if (input) {
    input.value = phrase;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1200);
    for (var d = 0; d < 10; d++) {
      var dynOpts = document.querySelectorAll('.multiselect__content .multiselect__element, .multiselect__content li, .multiselect__option, [role="option"]');
      var realDyn = Array.from(dynOpts || []).filter(function(o) {
        var txt = (o.textContent || '').trim().toLowerCase();
        return txt && txt !== 'no icebreakers found' && txt !== 'list is empty.' && txt.indexOf('no icebreakers') === -1 && txt.indexOf('list is empty') === -1;
      });
      if (realDyn && realDyn.length > 0) {
        console.log('[IB VISION] selectRandom: click dynOption:', realDyn[0].textContent?.trim()?.substring(0,50));
        realDyn[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        realDyn[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        realDyn[0].click();
        await sleep(600);
        console.log('[IB VISION] selectRandom: dynOption clicked');
        return true;
      }
      await sleep(400);
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, which: 13 }));
    await sleep(500);
    console.log('[IB VISION] selectRandom: Enter enviado');
    return true;
  }
  console.log('[IB VISION] selectRandom: sin input disponible');
  return false;
}

async function _ibVisionFindAndClick(selectors, label) {
  console.log('[IB VISION] buscando ' + label + ' con selectores:', selectors);
  for (var i = 0; i < 30; i++) {
    var btn = null;
    for (var s = 0; s < selectors.length; s++) {
      btn = document.querySelector(selectors[s]);
      if (btn) break;
    }
    if (!btn) {
      btn = Array.from(document.querySelectorAll('button')).find(function (b) {
        var txt = b.textContent.trim();
        return txt === 'Launch' || txt === 'Confirm' || txt === 'Activate' || txt === 'Send';
      });
    }
    if (btn) {
      console.log('[IB VISION] encontrado ' + label + ':', {
        id: btn.id,
        classes: btn.className,
        testId: btn.getAttribute('data-test-id'),
        text: btn.textContent.trim(),
        disabled: btn.disabled
      });
      try { btn.click(); } catch(e) { console.log('[IB VISION] click fallÃ³ con error:', e); }
      console.log('[IB VISION] clicked:', label);
      return true;
    }
    await sleep(400);
  }
  console.log('[IB VISION] NO ENCONTRADO:', label);
  return false;
}

async function _ibVisionActivate(type) {
  console.log('[IB VISION] activate:', type);
  var openSelectors = [
    'button[data-test-id*="open-launch-mail-icebreaker"]',
    'button[data-test-id*="open-launch-message-icebreaker"]',
    'button[data-test-id*="launch"]'
  ];
  if (type !== 'mail') {
    openSelectors = [
      'button[data-test-id*="open-launch-message-icebreaker"]',
      'button[data-test-id*="launch"]'
    ];
  }
  var ok = await _ibVisionFindAndClick(openSelectors, 'open-' + type);
  if (!ok) { console.log('[IB VISION] no se encontrÃ³ botÃ³n ' + type); return false; }
  console.log('[IB VISION] esperando menÃº de confirmaciÃ³n...');
  await sleep(1200);
  ok = await _ibVisionFindAndClick(['button[data-test-id*="launch-icebreakers"]', 'button[data-test-id*="launch"]'], 'confirm-' + type);
  if (!ok) { console.log('[IB VISION] no se encontrÃ³ confirmaciÃ³n ' + type); return false; }
  await sleep(600);
  return true;
}

async function _ibVisionFillMultiselects(containerSelector, count) {
  console.log('[IB VISION] fillMultiselects en', containerSelector, 'count:', count);
  var filled = 0;
  var container = document.querySelector(containerSelector);
  if (!container) { console.log('[IB VISION] container NOT FOUND:', containerSelector); return 0; }
  var tags = container.querySelectorAll('.multiselect__tags');
  console.log('[IB VISION] tags en container:', tags.length);
  for (var mi = 0; mi < Math.min(tags.length, count); mi++) {
    var input = container.querySelectorAll('input.multiselect__input')[mi];
    var tagEl = tags[mi];
    if (!tagEl) continue;
    console.log('[IB VISION] click en tag #' + mi);
    tagEl.click();
    await sleep(800);
    var opts = container.querySelectorAll('.multiselect__content .multiselect__element, .multiselect__content li, .multiselect__option, [role="option"]');
    var realOpts = Array.from(opts || []).filter(function(o) {
      var t = (o.textContent || '').trim().toLowerCase();
      return t && t.indexOf('no icebreakers') === -1 && t.indexOf('list is empty') === -1;
    });
    if (realOpts.length > 0) {
      realOpts[Math.floor(Math.random() * realOpts.length)].click();
      await sleep(500);
      filled++;
      console.log('[IB VISION] option clicked, filled:', filled);
      continue;
    }
    if (input) {
      var phrase = window._ibVisionPhrases[Math.floor(Math.random() * window._ibVisionPhrases.length)];
      input.value = phrase;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(1000);
      var dynOpts = container.querySelectorAll('.multiselect__content .multiselect__element, .multiselect__content li, .multiselect__option, [role="option"]');
      var realDyn = Array.from(dynOpts || []).filter(function(o) {
        var t = (o.textContent || '').trim().toLowerCase();
        return t && t.indexOf('no icebreakers') === -1 && t.indexOf('list is empty') === -1;
      });
      if (realDyn.length > 0) {
        realDyn[0].click();
        await sleep(500);
        filled++;
        console.log('[IB VISION] dynOption clicked, filled:', filled);
        continue;
      }
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, which: 13 }));
      await sleep(500);
      filled++;
    }
  }
  return filled;
}

async function _executeIBVision() {
  if (window._ibVisionActive) return;
  if (document.querySelector('.warning-text')) {
    showTessToast('LÃ­mite diario de Icebreakers alcanzado', 'error');
    return;
  }
  window._ibVisionActive = true;
  var anySuccess = false;
  try {
    var statusEl = document.getElementById('ibStatus');
    if (statusEl) statusEl.textContent = 'IB VISION activo...';

    var link = document.querySelector(TALK_Y.ICEBREAKER_SIDEBAR_LINK);
    if (link) { link.click(); await sleep(2000); }

    // === MAIL FLOW ===
    console.log('[IB VISION] === MAIL FLOW ===');
    var mailBtn = document.querySelector('button[data-test-id*="open-launch-mail-icebreaker"]');
    if (mailBtn) {
      mailBtn.click();
      await sleep(1500);
      var mailFilled = await _ibVisionFillMultiselects('#launch-icebreaker-type-mail', 1);
      if (mailFilled > 0) {
        anySuccess = true;
        await sleep(500);
        var mailConfirm = document.querySelector('button[data-test-id*="launch-icebreakers"]');
        if (mailConfirm) { mailConfirm.click(); await sleep(1500); }
      }
    }

    // === CHAT FLOW ===
    console.log('[IB VISION] === CHAT FLOW ===');
    var chatBtn = document.querySelector('button[data-test-id*="open-launch-message-icebreaker"]');
    if (chatBtn) {
      chatBtn.click();
      await sleep(1500);
      var chatFilled = await _ibVisionFillMultiselects('#launch-icebreaker-type-chat', 3);
      if (chatFilled > 0) {
        anySuccess = true;
        await sleep(500);
        var chatConfirm = document.querySelector('button[data-test-id*="launch-icebreakers"]');
        if (chatConfirm) { chatConfirm.click(); await sleep(1500); }
      }
    }

    if (!anySuccess) throw new Error('No se pudo completar ningun paso del proceso');

    if (statusEl) statusEl.textContent = 'IB VISION: Completado';
    _ibVisionStartTimer();
    showTessToast('IB VISION completado. Timer 4h activado.', 'success');
  } catch (e) {
    console.error('[IB VISION] Error:', e);
    showTessToast('Error en IB VISION: ' + e.message, 'error');
    var st = document.getElementById('ibStatus');
    if (st) st.textContent = 'IB VISION: Error';
  }
  window._ibVisionActive = false;
}

var _ibVisionCountdown = 4 * 3600;
var _ibVisionTimerInterval = null;

function _ibVisionStartTimer() {
  _ibVisionCountdown = 4 * 3600;
  var display = document.getElementById('ibVisionTimer');
  if (display) display.style.display = 'block';
  if (_ibVisionTimerInterval) clearInterval(_ibVisionTimerInterval);
  _ibVisionTimerInterval = setInterval(function() {
    _ibVisionCountdown--;
    if (_ibVisionCountdown <= 0) {
      clearInterval(_ibVisionTimerInterval);
      _ibVisionTimerInterval = null;
      var d = document.getElementById('ibVisionTimer');
      if (d) d.style.display = 'none';
      _ibVisionShowModal();
      return;
    }
    var h = String(Math.floor(_ibVisionCountdown / 3600)).padStart(2, '0');
    var m = String(Math.floor((_ibVisionCountdown % 3600) / 60)).padStart(2, '0');
    var s = String(_ibVisionCountdown % 60).padStart(2, '0');
    var el = document.getElementById('ibVisionTimer');
    if (el) el.textContent = '\u23f1 ' + h + ':' + m + ':' + s;
  }, 1000);
}

function _ibVisionShowModal() {
  var modal = document.getElementById('ibVisionModal');
  if (!modal) return;
  modal.style.display = 'flex';
  var siBtn = document.getElementById('ibVisionModalSi');
  var noBtn = document.getElementById('ibVisionModalNo');
  if (siBtn) siBtn.onclick = function() {
    modal.style.display = 'none';
    _executeIBVision();
  };
  if (noBtn) noBtn.onclick = function() {
    modal.style.display = 'none';
    showTessToast('\u00a1NO te va a llegar tr\u00e1fico imb\u00e9cil!', 'error');
    _ibVisionStartTimer();
  };
}

window._executeIBVision = _executeIBVision;

// ============ LANGUAGE DETECTION ============
function detectLanguage(text) {
  if (!text) return null;
  var t = text.toLowerCase().trim();
  var words = t.split(/\s+/).filter(function (w) { return w.length > 2; });
  var scores = { en: 0, es: 0, fr: 0, pt: 0 };
  var dicts = {
    en: ['the', 'you', 'and', 'for', 'are', 'but', 'not', 'was', 'have', 'has', 'had', 'your', 'with', 'from', 'they', 'this', 'that', 'she', 'her', 'what', 'all', 'can'],
    es: ['que', 'las', 'los', 'por', 'para', 'con', 'del', 'como', 'mas', 'pero', 'esta', 'este', 'esto', 'muy', 'todo', 'bien', 'cuando', 'si', 'solo', 'cada'],
    fr: ['les', 'des', 'que', 'pas', 'pour', 'dans', 'avec', 'vous', 'elle', 'ils', 'sur', 'nous', 'plus', 'tout', 'mais', 'fait', 'faire'],
    pt: ['que', 'para', 'com', 'dos', 'das', 'mais', 'como', 'muito', 'isso', 'esta', 'este', 'aqui', 'tudo', 'bem', 'sua', 'seu', 'voce', 'ela']
  };
  for (var wi = 0; wi < words.length; wi++) {
    for (var lang in dicts) {
      if (dicts[lang].indexOf(words[wi]) !== -1) scores[lang]++;
    }
  }
  if (scores.en > scores.es && scores.en >= 1) return 'en';
  if (scores.fr > scores.es && scores.fr >= 1) return 'fr';
  if (scores.pt > scores.es && scores.pt >= 1) return 'pt';
  return null;
}


