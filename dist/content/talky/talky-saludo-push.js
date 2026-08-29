// TESSERACT v24.0 - Saludo Push Module ("Say Hi!")
// Genera con IA una secuencia de 5 mensajes (saludo → intriga → remate → pre-cierre → cierre),
// los traduce al inglés y los envía uno a uno a cada contacto de la pestaña Active.

const SP_STORAGE_KEY = 'tess_saludo_push_config';
const SP_CONTACTED_KEY = 'tess_sp_contacted';
const SP_SEP = '\n|||SP|||\n';

let spConfig = {
  maxDaily: 30,
  sentToday: 0,
  traducir: true,
  recentHours: 48
};
let spActive = false;
let spProcessedIds = new Set();
let spLastSequence = null;

// ─── AUTO-BLOQUEO DE CONVERSACIÓN ACTIVA/RECIENTE ───
// Convierte la hora del DOM ("8:06 am", "May 28, 12:28 am", "48 minutes ago") a horas transcurridas
function spParseTimeHoursAgo(txt) {
  if (!txt) return null;
  var t = String(txt).trim().toLowerCase();
  if (t.includes('now') || t.includes('ahora') || t.includes('just')) return 0;

  var m = t.match(/(\d+)\s*(m|min|minuto|minute)s?\b/);
  if (m) return parseInt(m[1], 10) / 60;
  m = t.match(/(\d+)\s*(h|hr|hora|hour)s?\b/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/(\d+)\s*(d|dia|día|day)s?\b/);
  if (m) return parseInt(m[1], 10) * 24;
  if (t.includes('ayer') || t.includes('yesterday')) return 24;

  m = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (m) {
    var hh = parseInt(m[1], 10);
    var mm = parseInt(m[2], 10);
    var ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    if (!ap && hh < 8) hh += 12;
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    if (d.getTime() > now.getTime()) d = new Date(now.getTime() - 24 * 3600 * 1000);
    return (now.getTime() - d.getTime()) / 3600000;
  }

  var months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var md = t.match(/([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (md) {
    var mon = months[String(md[1]).toLowerCase().substring(0, 3)];
    if (mon !== undefined) {
      var hh2 = parseInt(md[3], 10);
      var mm2 = parseInt(md[4], 10);
      var ap2 = (md[5] || '').toLowerCase();
      if (ap2 === 'pm' && hh2 < 12) hh2 += 12;
      if (ap2 === 'am' && hh2 === 12) hh2 = 0;
      var now2 = new Date();
      var y = now2.getFullYear();
      var dd = new Date(y, mon, parseInt(md[2], 10), hh2, mm2, 0, 0);
      if (dd.getTime() > now2.getTime()) dd = new Date(y - 1, mon, parseInt(md[2], 10), hh2, mm2, 0, 0);
      return (now2.getTime() - dd.getTime()) / 3600000;
    }
  }
  return null;
}

// Escanea el chat YA abierto: recuento de recibidos/enviados y antigüedad del último recibido
// (nivel document para no perder mensajes si el contenedor del chat no coincide con los selectores)
function spScanOpenChat() {
  var info = { received: 0, sent: 0, lastIncomingAgo: null };
  var wrappers = document.querySelectorAll('.tu-message-wrapper');
  for (var i = 0; i < wrappers.length; i++) {
    var wCls = wrappers[i].className || '';
    if (/my-tu-message-wrapper/.test(wCls)) { info.sent++; continue; }
    info.received++;
    if (info.lastIncomingAgo === null) {
      var tEl = wrappers[i].querySelector(TALK_Y.TIME_ELEMENT) || wrappers[i].querySelector('[class*="time"],[class*="date"],[data-test-id*="time"]');
      var hrs = spParseTimeHoursAgo(tEl ? (tEl.textContent || '') : '');
      if (hrs !== null) info.lastIncomingAgo = hrs;
    }
  }
  return info;
}

// Espera a que el chat termine de renderizar los mensajes (evita falsos negativos por carga async)
async function spWaitChatSettled(timeoutMs) {
  var start = Date.now();
  var last = -1;
  var stable = 0;
  while (Date.now() - start < timeoutMs) {
    var n = document.querySelectorAll('.tu-message-wrapper').length;
    if (n > 0) {
      if (n === last) { stable++; if (stable >= 2) return true; }
      else { stable = 0; last = n; }
    }
    await sleep(300);
  }
  return true;
}

// Veredicto de conversación activa/reciente:
// - Si hay mensajes recibidos cuya antigüedad NO se puede confirmar como mayor a la ventana → bloquea.
// - Si la antigüedad del último recibido ES mayor a la ventana → permite (reactivación de cliente frío).
function spHasActiveConversation() {
  var info = spScanOpenChat();
  var w = (spConfig && spConfig.recentHours > 0) ? spConfig.recentHours : 48;
  if (info.received > 0) {
    if (info.lastIncomingAgo !== null && info.lastIncomingAgo > w) return { active: false, info: info };
    return { active: true, info: info };
  }
  return { active: false, info: info };
}

// ¿Llegaron respuestas nuevas mientras se enviaba la secuencia?
function spChatGotLiveReplies(baseRecv) {
  try {
    return document.querySelectorAll('.tu-message-wrapper:not(.my-tu-message-wrapper)').length > baseRecv;
  } catch (e) { return false; }
}

// Antigüedad de la última actividad visible en el item de la lista (best-effort, antes de abrir)
function spItemRecentHours(item) {
  try {
    var tEl = item.querySelector(TALK_Y.TIME_ELEMENT) || item.querySelector('[class*="time"],[class*="date"],[data-test-id*="time"]');
    if (!tEl) return null;
    return spParseTimeHoursAgo((tEl.textContent || '').trim());
  } catch (e) { return null; }
}

window._mlAutoBlockIfInteraction = function (profileId) {
  try {
    var r = spHasActiveConversation();
    if (r.active) {
      console.log('[SP] AutoBlock: conversación activa/reciente (' + r.info.received + ' recibidos, último hace '
        + (r.info.lastIncomingAgo === null ? 'desconocido' : r.info.lastIncomingAgo.toFixed(1) + 'h') + '). Saltando:', profileId);
      return true;
    }
  } catch (e) {}
  return false;
};

const SP_FALLBACK_SEQ = [
  'Hola, como has estado?',
  'Me genera algo de intriga no haber sabido mas nada acerca de ti.',
  'Pense que habiamos conectado de alguna manera, y que podriamos conocernos mejor.',
  'Pero si me equivoque debo decir que es una lastima.',
  'Sin embargo estare esperando una respuesta de tu parte, si hay algo que hacer para seguir con esto me gustaria saberlo, adios!'
];

async function loadSPConfig() {
  try {
    const r = await chrome.storage.local.get([SP_STORAGE_KEY]);
    if (r[SP_STORAGE_KEY]) spConfig = { ...spConfig, ...r[SP_STORAGE_KEY] };
  } catch (e) {}
}

async function saveSPConfig() {
  try {
    await chrome.storage.local.set({ [SP_STORAGE_KEY]: spConfig });
  } catch (e) {}
}

// ─── GENERACIÓN DE SECUENCIA (IA) ───

function spParseSequence(raw) {
  if (!raw) return null;
  var parts = raw.split(/\|\|\|/).map(function (s) {
    return s.replace(/^\s*\d+[.)]\s*/, '').replace(/["""]/g, '').trim();
  }).filter(function (s) { return s.length > 0; });
  if (parts.length < 3) return null;
  return parts.slice(0, 5).map(function (s) { return s.slice(0, 298); });
}

async function spGenerateSequence() {
  var system = [
    (typeof TESS_MASTER_PROMPT!=='undefined'?TESS_MASTER_PROMPT+'\n\n':'') + '\n\nTAREA:\n',
    'Eres un hombre escribiendo por chat a una mujer que ya conversó con él pero dejó de responder.',
    'Debes escribir UNA secuencia de 5 mensajes cortos en español natural latinoamericano, tono cálido pero con dignidad, para reactivar la conversación:',
    '1. SALUDO INICIAL - saluda y pregunta cómo ha estado. Tono de referencia: "Hola, como has estado?"',
    '2. COMPLEMENTO - di que te genera intriga no haber sabido más de ella. Tono: "Me genera algo de intriga no haber sabido mas nada acerca de ti."',
    '3. REMATE - di que pensaste que habían conectado y podrían conocerse mejor. Tono: "Pense que habiamos conectado de alguna manera, y que podriamos conocernos mejor."',
    '4. PREAMBULO DEL CIERRE - acepta que si te equivocaste sería una lástima. Tono: "Pero si me equivoque debo decir que es una lastima."',
    '5. CIERRE - di que esperarás su respuesta y despídete. Tono: "Sin embargo estare esperando una respuesta de tu parte, si hay algo que hacer para seguir con esto me gustaria saberlo, adios!"',
    'REGLAS:',
    '- Los ejemplos son SOLO guía de tono: varía las palabras en cada generación, NUNCA copies literal.',
    '- Máximo 280 caracteres por mensaje. Sin emojis, sin comillas, sin numeración.',
    '- Responde EXACTAMENTE con los 5 mensajes separados por ||| y nada más.'
  ].join('\n');
  var user = 'Genera la secuencia ahora. Variacion #' + Math.floor(Math.random() * 100000);
  try {
    var data = await Tesseract.callGroq(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      undefined,
      1200
    );
    var seq = spParseSequence(data?.choices?.[0]?.message?.content);
    if (seq && seq.length >= 3) {
      console.log('[SP] Secuencia generada (' + seq.length + ' mensajes)');
      while (seq.length < 5) seq.push(SP_FALLBACK_SEQ[seq.length]);
      return seq;
    }
    console.warn('[SP] Respuesta IA invalida para secuencia');
  } catch (e) { console.warn('[SP] Error generando secuencia:', e.message); }
  return null;
}

async function spTranslate(text) {
  try {
    var groqData = await Tesseract.callGroq(
      [{ role: 'system', content: (typeof TESS_TRANSLATOR_POLICY!=='undefined'?TESS_TRANSLATOR_POLICY+' ':'') + 'Traduce el siguiente texto del español al inglés. Responde SOLO con la traducción, sin explicaciones ni notas.' }, { role: 'user', content: text }],
      undefined,
      300
    );
    var translatedText = groqData?.choices?.[0]?.message?.content;
    if (translatedText && translatedText.trim() && translatedText.trim() !== text) {
      console.log('[SP] Translated:', text.substring(0, 40), '→', translatedText.trim().substring(0, 40));
      return translatedText.trim();
    }
    console.log('[SP] Translate returned same or no translation');
  } catch (e) { console.warn('[SP] Translation error:', e.message); }
  return text;
}

async function spTranslateBatch(msgs) {
  if (!spConfig.traducir) return msgs.slice();
  try {
    var joined = msgs.join(' ||| ');
    var data = await Tesseract.callGroq(
      [{ role: 'system', content: (typeof TESS_TRANSLATOR_POLICY!=='undefined'?TESS_TRANSLATOR_POLICY+' ':'') + 'Traduce al inglés cada mensaje separado por |||. Mantén EXACTAMENTE los separadores ||| entre mensajes. Responde solo con la traducción.' }, { role: 'user', content: joined }],
      undefined,
      900
    );
    var out = data?.choices?.[0]?.message?.content;
    if (out) {
      var parts = out.split(/\|\|\|/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
      if (parts.length === msgs.length) {
        console.log('[SP] Lote traducido (' + parts.length + ' mensajes)');
        return parts.map(function (s) { return s.slice(0, 298); });
      }
      console.warn('[SP] Traduccion lote: cantidad no coincide (' + parts.length + '/' + msgs.length + '), traduciendo individual');
    }
  } catch (e) { console.warn('[SP] Error traduccion lote:', e.message); }
  var res = [];
  for (var i = 0; i < msgs.length; i++) res.push(await spTranslate(msgs[i]));
  return res;
}

// ─── DOM HELPERS ───

function spFindChatInput() {
  return document.querySelector(TALK_Y.CHAT_TEXTAREA_SP) || document.querySelector(TALK_Y.CHAT_TEXTAREA) || document.querySelector(TALK_Y.CHAT_INPUT_ID) || document.querySelector(TALK_Y.ANY_TEXTAREA);
}

function spFindSendBtn() {
  return document.querySelector(TALK_Y.SEND_BTN_SP)
    || document.querySelector('.send-button-wrapper button.send-button')
    || document.querySelector('button[data-test-id*="send-message send"]')
    || document.querySelector(TALK_Y.SEND_BTN_CLASS);
}

async function spWaitSendEnabled(btn, timeoutMs) {
  var start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') return true;
    await sleep(250);
    btn = spFindSendBtn();
  }
  return false;
}

async function spTypeAndSend(text) {
  var input = spFindChatInput();
  if (!input) return false;
  input.removeAttribute('disabled');
  input.disabled = false;
  input.focus();
  input.value = text;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(350);

  var btn = spFindSendBtn();
  var ready = await spWaitSendEnabled(btn, 3000);
  if (!ready) {
    console.log('[SP] Boton de envio sigue deshabilitado');
    return false;
  }
  btn.removeAttribute('disabled');
  btn.disabled = false;
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  btn.click();

  // Confirmar: textarea debe quedar vacio tras enviar
  var start = Date.now();
  while (Date.now() - start < 3000) {
    var cur = spFindChatInput();
    if (!cur || cur.value === '') return true;
    await sleep(300);
  }
  // Reintento con Enter como backup
  input = spFindChatInput();
  if (input) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    await sleep(800);
    var cur2 = spFindChatInput();
    if (!cur2 || cur2.value === '') return true;
  }
  return false;
}

function spMessageAlreadySent(text) {
  var msgs = document.querySelectorAll('.tu-message-wrapper.dialog-message');
  for (var i = 0; i < msgs.length; i++) {
    var content = (msgs[i].textContent || '').trim().toLowerCase();
    if (content.indexOf(text.toLowerCase()) !== -1) return true;
  }
  return false;
}

async function spWaitForInput(timeoutMs) {
  var start = Date.now();
  while (Date.now() - start < timeoutMs) {
    var input = spFindChatInput();
    if (input && !input.disabled) return input;
    await sleep(300);
  }
  var input = spFindChatInput();
  if (input) {
    input.removeAttribute('disabled');
    input.disabled = false;
  }
  return input || null;
}

// Limites del contacto LEIDOS DIRECTO DEL ITEM DE LA LISTA (sin abrir el chat)
// <div class="counter" data-nolimits="false" data-type="Chat" data-test-id="file:restriction-limits messages-counter">
//   <span class="counter-success">9</span></div>
function spItemLimits(item) {
  try {
    var c = item.querySelector('[data-test-id*="restriction-limits"]') || item.querySelector('.counter[data-type="Chat"]') || item.querySelector('.counter');
    if (!c) return { ok: true, left: Infinity };
    if (c.getAttribute('data-nolimits') === 'true') return { ok: false, left: 0 };
    var span = c.querySelector('span.counter-success') || c.querySelector('span');
    var n = parseInt(((span && span.textContent) || '').trim(), 10);
    if (isNaN(n)) n = -1;
    var agotado = !!c.querySelector('[class*="danger"], [class*="error"]');
    if (agotado || n === 0) return { ok: false, left: 0 };
    return { ok: true, left: n > 0 ? n : Infinity };
  } catch (e) { return { ok: true, left: Infinity }; }
}

async function spGetMsgCount() {
  try {
    var el = document.querySelector('.counter span.counter-success, [data-type="Chat"] span.counter-success, .counter span');
    if (el) {
      var n = parseInt((el.textContent || '').trim(), 10);
      if (!isNaN(n)) return n;
    }
  } catch (e) {}
  return 0;
}

async function spScrollAndCollect(list) {
  var all = [];
  var seen = new Set();
  for (var pg = 0; pg < 20; pg++) {
    var items = list.querySelectorAll(TALK_Y.DIALOG_LISTITEM);
    for (var ii = 0; ii < items.length; ii++) {
      var id = (items[ii].querySelector(TALK_Y.DIALOG_AVATAR) || {}).id;
      if (id && !seen.has(id)) { seen.add(id); all.push(items[ii]); }
    }
    if (items.length < 200) {
      list.scrollTop = list.scrollHeight;
      await sleep(800);
      var newItems = list.querySelectorAll(TALK_Y.DIALOG_LISTITEM);
      if (newItems.length === items.length) break;
    } else break;
  }
  return all;
}

async function spIsProfileContacted(profileId) {
  try {
    var data = await chrome.storage.local.get([SP_CONTACTED_KEY]);
    var history = data[SP_CONTACTED_KEY] || {};
    return !!history[String(profileId)];
  } catch (e) { return false; }
}

async function spMarkProfileContacted(profileId, seqIdx) {
  try {
    var data = await chrome.storage.local.get([SP_CONTACTED_KEY]);
    var history = data[SP_CONTACTED_KEY] || {};
    var key = String(profileId);
    if (!history[key]) history[key] = [];
    if (seqIdx !== undefined && seqIdx !== null && history[key].indexOf(seqIdx) === -1) history[key].push(seqIdx);
    await chrome.storage.local.set({ [SP_CONTACTED_KEY]: history });
  } catch (e) {}
}

async function spGetSentSeq(profileId) {
  try {
    var data = await chrome.storage.local.get([SP_CONTACTED_KEY]);
    var history = data[SP_CONTACTED_KEY] || {};
    return history[String(profileId)] || [];
  } catch (e) { return []; }
}

// ─── FLUJO PRINCIPAL ───

async function executeSaludoPush() {
  if (spActive) return;
  spActive = true;
  spProcessedIds = new Set();
  updateSPUI();

  await loadSPConfig();

  if (spConfig.maxDaily > 0 && spConfig.sentToday >= spConfig.maxDaily) {
    console.log('[SP] Limite diario alcanzado');
    spActive = false;
    updateSPUI();
    showTessToast('Limite diario de saludos alcanzado (' + spConfig.maxDaily + ')', 'warning');
    return;
  }

  // Ir a pestana Active
  var activeTab = document.querySelector(TALK_Y.DIALOG_TAB_BY_ID('active'));
  if (activeTab && activeTab.getAttribute('data-isselected') !== 'true') {
    activeTab.click();
    await sleep(1200);
  }

  var list = document.querySelector(TALK_Y.DIALOG_LIST);
  if (!list) {
    console.log('[SP] No se encontro la lista de dialogos');
    spActive = false;
    updateSPUI();
    showTessToast('No se encontro la lista de contactos. Abre la pagina de mensajes.', 'error');
    return;
  }

  var items = await spScrollAndCollect(list);
  if (items.length === 0) {
    console.log('[SP] No hay contactos en la lista');
    spActive = false;
    updateSPUI();
    showTessToast('No hay contactos visibles en la lista', 'warning');
    return;
  }

  console.log('[SP] Say Hi! iniciado. Contactos en cola:', items.length);
  showTessToast('Say Hi! iniciado sobre ' + items.length + ' contactos', 'success');

  var sent = 0;

  for (var i = 0; i < items.length; i++) {
    if (!spActive) break;
    if (spConfig.maxDaily > 0 && spConfig.sentToday >= spConfig.maxDaily) break;

    var item = items[i];
    var avatar = item.querySelector(TALK_Y.DIALOG_AVATAR);
    if (!avatar) continue;
    var profileId = avatar.id;
    if (!profileId || !/^\d{6,15}$/.test(profileId)) continue;
    if (spProcessedIds.has(profileId)) continue;
    spProcessedIds.add(profileId);

    if (typeof isBlacklisted === 'function' && isBlacklisted(profileId)) {
      console.log('[SP] Saltado (blacklist):', profileId);
      continue;
    }

    if (typeof isPinnedOrSaved === 'function' && isPinnedOrSaved(item)) {
      console.log('[SP] Saltado (pinned/saved):', profileId);
      continue;
    }

    if (await spIsProfileContacted(profileId)) {
      console.log('[SP] Ya contactado previamente, saltando:', profileId);
      continue;
    }

    // LIMITES: si no tiene o agoto, saltar DE UNA VEZ sin abrir chat
    var lim = spItemLimits(item);
    if (!lim.ok || lim.left <= 0) {
      console.log('[SP] Sin limites disponibles (data-nolimits/contador en 0), saltando:', profileId);
      continue;
    }

    // Guardia pre-apertura: actividad reciente visible en el item de la lista (best-effort)
    var itemHrs = spItemRecentHours(item);
    if (itemHrs !== null && itemHrs <= (spConfig.recentHours || 48)) {
      console.log('[SP] Actividad reciente en la lista (' + itemHrs.toFixed(1) + 'h), saltando:', profileId);
      await spMarkProfileContacted(profileId);
      continue;
    }

    // Abrir chat
    var clickTarget = item.querySelector(TALK_Y.DIALOG_GO_TO_CHAT);
    if (!clickTarget) continue;
    clickTarget.click();
    await sleep(900);

    var input = await spWaitForInput(4000);
    if (!input) {
      console.log('[SP] No se encontro input de chat para:', profileId);
      continue;
    }

    // Esperar a que el chat termine de renderizar los mensajes antes de evaluar el auto-bloqueo
    await spWaitChatSettled(4000);
    var openScan = spScanOpenChat();
    var liveRecvBase = openScan.received;

    // Auto-bloqueo: conversación activa o reciente (cualquier respuesta no confirmada como vieja)
    if (typeof window._mlAutoBlockIfInteraction === 'function' && window._mlAutoBlockIfInteraction(profileId)) {
      console.log('[SP] Contacto auto-bloqueado por conversacion activa/reciente:', profileId);
      await spMarkProfileContacted(profileId);
      continue;
    }

    // Generar secuencia fresca para este contacto
    var seq = await spGenerateSequence();
    if (!seq) {
      seq = spLastSequence || SP_FALLBACK_SEQ.slice();
      console.log('[SP] Usando secuencia previa/fallback para:', profileId);
    } else {
      spLastSequence = seq.slice();
    }
    if (!spActive) break;

    // Traducir lote completo
    var msgs = await spTranslateBatch(seq);
    if (!spActive) break;

    // Espacio disponible: minimo entre limites del item y espacio real del chat (max 10)
    var maxMsg = 10;
    var curMsg = await spGetMsgCount();
    var room = lim.left;
    if (curMsg > 0) room = Math.min(room, Math.max(0, maxMsg - curMsg));
    if (room <= 0) {
      console.log('[SP] Contacto sin espacio/limites (' + curMsg + '/10, left=' + lim.left + '), saltando:', profileId);
      if (input && input.value) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
      continue;
    }

    var sentSeq = await spGetSentSeq(profileId);
    var msgsToSend = Math.min(msgs.length, room, 5);
    var sentToThis = 0;
    for (var mi = 0; mi < msgsToSend; mi++) {
      if (!spActive) break;
      if (spConfig.maxDaily > 0 && spConfig.sentToday >= spConfig.maxDaily) break;

      // Si el cliente respondió en vivo mientras enviábamos, detener para este contacto
      if (spChatGotLiveReplies(liveRecvBase)) {
        console.log('[SP] Respuesta en vivo detectada, deteniendo envio para:', profileId);
        await spMarkProfileContacted(profileId);
        break;
      }

      if (sentSeq.indexOf(mi) !== -1) {
        console.log('[SP] Mensaje ' + (mi + 1) + '/5 ya enviado antes a', profileId);
        continue;
      }

      if (spMessageAlreadySent(msgs[mi])) {
        console.log('[SP] Mensaje ' + (mi + 1) + ' detectado en conversacion, saltando:', profileId);
        await spMarkProfileContacted(profileId, mi);
        continue;
      }

      await sleep(400 + Math.random() * 250);
      var ok = await spTypeAndSend(msgs[mi]);
      if (!ok) {
        console.log('[SP] Error al enviar mensaje ' + (mi + 1) + '/5 para:', profileId);
        break;
      }
      await sleep(700 + Math.random() * 400);

      spConfig.sentToday++;
      sent++;
      sentToThis++;
      try {
        var spStats = Tesseract.get('botStats') || {};
        spStats.saludosSent = (spStats.saludosSent || 0) + 1;
        Tesseract.set('botStats', spStats);
      } catch (e) {}
      await spMarkProfileContacted(profileId, mi);
      await saveSPConfig();
      updateSPUI();

      // Limites agotados en medio de la secuencia -> siguiente contacto
      if (sentToThis >= lim.left) { console.log('[SP] Limites del contacto agotados tras', sentToThis, 'mensaje(s)'); break; }
      var nowLeft = await spGetMsgCount();
      if (nowLeft > 0 && nowLeft >= maxMsg) { console.log('[SP] Chat lleno (' + nowLeft + '/10), siguiente'); break; }
    }
    if (input && input.value) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }

    await sleep(500 + Math.random() * 500);
  }

  console.log('[SP] Barrido completado. Enviados:', sent);
  if (sent > 0) {
    try { if (typeof syncMetricsToStorage === 'function') syncMetricsToStorage('SAYHI_BATCH', sent); } catch (e) {}
    showTessToast('Say Hi! completado: ' + sent + ' mensajes enviados', 'success');
  } else {
    showTessToast('No se enviaron saludos. Verifica blacklist y limites.', 'warning');
  }
  spActive = false;
  updateSPUI();
}

function abortSaludoPush() {
  spActive = false;
  updateSPUI();
  showTessToast('Say Hi! detenido', 'warning');
}

function updateSPUI() {
  var btn = document.getElementById('btnSPToggle');
  if (btn) {
    if (spActive) {
      btn.textContent = 'DETENER';
      btn.style.background = '#ef4444';
      btn.style.borderColor = '#ef4444';
    } else {
      btn.textContent = 'SAY HI!';
      btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
      btn.style.borderColor = '#10b981';
    }
  }
  var status = document.getElementById('spStatus');
  if (status) {
    status.textContent = spActive ? 'ACTIVO' : 'INACTIVO';
    status.style.color = spActive ? '#10b981' : '#888';
  }
  var sentEl = document.getElementById('spSentToday');
  if (sentEl) sentEl.textContent = spConfig.sentToday || 0;
}

async function openSPPanel() {
  await loadSPConfig();
  var tr = document.getElementById('spTraducir');
  if (tr) tr.checked = spConfig.traducir !== false;
  var md = document.getElementById('spMaxDaily');
  if (md) md.value = spConfig.maxDaily || 30;
  var rh = document.getElementById('spRecentHours');
  if (rh) rh.value = spConfig.recentHours || 48;
  var st = document.getElementById('spSentToday');
  if (st) st.textContent = spConfig.sentToday || 0;
  updateSPUI();
}

async function saveSPPanelConfig() {
  var tr = document.getElementById('spTraducir');
  if (tr) spConfig.traducir = tr.checked;
  var md = document.getElementById('spMaxDaily');
  if (md) spConfig.maxDaily = parseInt(md.value) || 30;
  var rh = document.getElementById('spRecentHours');
  if (rh) spConfig.recentHours = parseInt(rh.value) || 48;
  await saveSPConfig();
  showMLSavedFeedback();
}

window._executeSaludoPush = executeSaludoPush;
window._abortSaludoPush = abortSaludoPush;
window._openSPPanel = openSPPanel;
window._saveSPPanelConfig = saveSPPanelConfig;
window._updateSPUI = updateSPUI;
