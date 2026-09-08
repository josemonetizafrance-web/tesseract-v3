// TESSERACT v24.1 - BARRIDO DE ACTIVE (Talkytimes)
// Barre los contactos del apartado Active ordenados por fecha (mas antigua -> mas reciente).
// - Contactos con tag Pinned o Saved en la fila -> auto-bloquear.
// - Contactos sin esos tags -> generar 5 mensajes IA (prompt maestro de reenganche),
//   mostrarlos editables, e inyectarlos/enviarlos uno a uno en orden.

var BR_API = (typeof Tesseract !== 'undefined' && Tesseract && Tesseract.API) || window.TESSERACT_API || 'https://tesseract-v3-production.up.railway.app';

var brState = {
  running: false,
  paused: false,
  stop: false,
  manual: false,
  queue: [],
  current: null,
  stats: { procesados: 0, bloqueados: 0, mensajes: 0, errores: 0 }
};

// ===== SELECTORES TALKYTIMES =====
var BR_SEL = {
  bandejas: ['#active > div', '#active', '#app [class*="dialogs__scroll-infinite-list"]', '#app [class*="dialogs__list"]', 'main [class*="dialog-item"]'],
  items: ['.dialog-item-content', '[class*="dialog-item__content"]', '.dialog-item', '[class*="dialog-item"]', '.item-content', '[class*="dialogs__item"]'],
  fecha: '.dialog-item__date-row, [class*="date"]',
  pinned: 'svg[id="CustomPushPin"], [data-ispinned="true"]',
  saved: 'svg[id="Bookmark"]',
  nombre: '.dialog-item__name, [class*="dialog-item__title"], [class*="dialog-item"] [class*="name"]',
  textarea: 'textarea#form-textarea[data-test-id*="type-your-message"], textarea#form-textarea.ui-textarea_control',
  send: '.add-message .send-button-wrapper, .send-button-wrapper',
  restriccion: ['.restriction-limits-wrapper .v-popper span > div', '.restriction-limits-wrapper [class*="tooltip"] span > div', '.restriction-limits-wrapper [class*="popper"] span > div', '[class*="restriction-limits"] [class*="tooltip"] span > div'],
  ultimo: '.dialog-item__description .last-message-text, .last-message-text, [class*="last-message"] [class*="text"]'
};

// Devuelve el primer contenedor candidato que contenga filas de dialogo.
function brBuscarBandeja() {
  for (var s = 0; s < BR_SEL.bandejas.length; s++) {
    var el = document.querySelector(BR_SEL.bandejas[s]);
    if (!el) { brLog('Bandeja candidata NO encontrada: ' + BR_SEL.bandejas[s]); continue; }
    var n = BR_SEL.items.reduce(function (acc, it) { return acc + el.querySelectorAll(it).length; }, 0);
    if (n) {
      brLog('Bandeja encontrada: ' + BR_SEL.bandejas[s] + ' (' + n + ' filas detectadas)');
      return el;
    }
  }
  for (var i = 0; i < BR_SEL.items.length; i++) {
    var many = document.querySelectorAll(BR_SEL.items[i]);
    if (many.length) { brLog('Sin bandeja concreta; usando fallback global (' + BR_SEL.items[i] + ', ' + many.length + ' filas)'); return document; }
  }
  return null;
}

// Prompt maestro de reenganche (genera 5 mensajes).
function brPrompt() {
  return 'Actúa como especialista en comunicación interpersonal y redacción de mensajes de reenganche.\n' +
    'Tu tarea es generar una SECUENCIA DE 5 MENSAJES consecutivos escritos por UNA PERSONA REAL que habló brevemente con alguien, la conversación se cortó, y esa persona se quedó con la duda de por qué no se volvieron a hablar y con ganas de retomar las cosas para ver a dónde llegan.\n' +
    'OBJETIVO: que suene EXACTAMENTE como un mensaje que escribiría esa persona horas o días después del corte: humano, natural, sin pensarle demasiado a las palabras. El eje es la ligera curiosidad de por qué no hubo continuación y el interés genuino por retomar, sin mendigar respuesta ni parecer necesitado.\n' +
    'ESTRUCTURA OBLIGATORIA (debe LEERSE natural, no como plantilla):\n' +
    'MENSAJE 1 — SALUDO: retomar la palabra de forma casual y creíble, como quien vuelve a escribir sin ceremonia. Nada de "hola, ¿cómo estás?" genérico.\n' +
    'MENSAJE 2 — INTERROGANTE: una pregunta abierta y ligera que invite a retomar el diálogo en general, sobre la persona, no sobre un tema concreto. Sin relleno ni interrogatorio.\n' +
    'MENSAJE 3 — COMPLEMENTO: una impresión breve, general y honesta de lo poco que se habló o de cómo conversa la otra persona; algo que justifique el interés por retomar. Sin halagos físicos, sin idealizar.\n' +
    'MENSAJE 4 — RESCATE DEL HILO: dejar caer con naturalidad y ligereza que se quedó con la duda de por qué no siguieron hablando y con ganas de retomar. Como "se quedó todo a medias", "me quedé con la duda de por qué no seguimos", "me dio curiosidad retomar la charla". Sin drama, sin culpa, sin pregunta directa del tipo "¿por qué no me escribiste?".\n' +
    'MENSAJE 5 — CIERRE: abrir la puerta de forma despreocupada y genuina a retomar y ver a dónde llega el asunto. Que deje claro que sí quiere saber, pero sin urgencia ni necesidad de respuesta.\n' +
    'REGLAS DE TONO: lengua real de un chat entre dos personas que se están conociendo: natural, humana, cálida, relajada, con salidas espontáneas y humor sutil si encaja. Nada de frases pulidas, nada de guion de ventas. Cada mensaje debe conectar con el anterior como escrito por la misma persona en momentos seguidos.\n' +
    'RESTRICCIONES: NO mencionar ningún tema concreto del chat ni hacer referencia específica a lo que se escribió (el último mensaje visible suele ser del propio emisor, no del cliente; no lo uses como ancla). NO personalizar inventando datos de la persona (no repetir su nombre, ni inventar profesión, hobbies, familia, ciudad, planes ni experiencias). NO frases gastadas ("¿cómo has estado?", "vi que estabas...", "un café virtual", "hace mucho"). NO romantizar ni idealizar. NO mendigar: nada de disculpas por escribir, "solo a ti te escribo", "espero que me respondas", "eres de las pocas personas...". NO preguntar directamente por qué no respondieron. NO referencias a vínculo afectivo ni encuentros físicos. NO clichés ("conexión", "energía", "vibras", "sin filtros"). Que NO parezca automatizado ni reciclado.\n' +
    'LONGITUD: cada mensaje breve, de 15 a 30 palabras.\n' +
    'RESULTADO: Responde ÚNICAMENTE con un bloque JSON válido y NADA más (sin markdown, sin títulos, sin explicaciones, sin comentarios antes ni después), con exactamente esta estructura y en este orden: {"1":"texto del saludo","2":"texto del interrogante","3":"texto del complemento","4":"texto del rescate del hilo","5":"texto del cierre"}. Usa comillas dobles y respeta cada clave del 1 al 5.';
}

// ===== Utilidades =====
function brEl(id) { return document.getElementById(id); }

function brStatus(msg, kind) {
  var s = brEl('brStatus');
  if (!s) return;
  s.textContent = msg || '';
  s.style.color = kind === 'ok' ? '#4ade80' : kind === 'err' ? '#f87171' : kind === 'warn' ? '#fbbf24' : '#22d3ee';
}

function brRenderStats() {
  var map = { procesados: 'brStProcesados', bloqueados: 'brStBloqueados', mensajes: 'brStMensajes', errores: 'brStErrores' };
  Object.keys(map).forEach(function (k) {
    var el = brEl(map[k]);
    if (el) el.textContent = brState.stats[k];
  });
}

function brLog(msg) { console.log('[BARRIDO]', msg); }
function brLogE(msg) { console.error('[BARRIDO]', msg); }

function brParseFecha(raw) {
  // "Apr 14" -> Date. Año: se asume el del mensaje actual (podia ser de este anio).
  if (!raw) return Infinity;
  var txt = String(raw).trim();
  var m = txt.match(/([A-Za-z]{3,})\s+(\d{1,2})(?:\s*,?\s*(\d{2,4}))?/);
  if (!m) {
    // unix ms
    var n = parseInt(txt, 10);
    if (!isNaN(n) && String(n).length >= 12) return n;
    return Infinity;
  }
  var meses = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var mo = meses[String(m[1]).toLowerCase().slice(0, 3)];
  if (mo === undefined) return Infinity;
  var today = new Date();
  var year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
  var d = new Date(year, mo, parseInt(m[2], 10));
  // si el mes esta 'futuro' respecto a hoy en mismo anio, asumir anio anterior
  if (!m[3] && d > today) d = new Date(year - 1, mo, parseInt(m[2], 10));
  return d.getTime();
}

function brOrdenarAsc(a, b) { return (a.fechaTs || Infinity) - (b.fechaTs || Infinity); }

function brSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ===== Captura de la bandeja Active (lista virtualizada: scroll hasta el final) =====

// Extrae datos utiles de una fila renderizada (.virtua-item)
function brInfoFila(fila) {
  var info = { id: '', nombre: '', fechaRaw: '', ultimo: '', esPinned: false, esSaved: false, top: 0 };
  try {
    var vi = fila.querySelector('.virtualized-item[data-id], [data-id]');
    if (vi) info.id = vi.getAttribute('data-id') || '';
    info.top = parseInt((fila.style && fila.style.top) || '0', 10) || 0;
    var nmT = fila.querySelector(BR_SEL.nombre);
    var nmD = fila.querySelector('[class*="description"]');
    var nm = nmT || nmD;
    if (nm) {
      var txtt = (nmT ? (nmT.textContent || '') : '').trim();
      if (txtt && !/,\s*\d{1,3}\s*$/.test(txtt)) {
        info.nombre = txtt;
      } else {
        var tx = (nm.textContent || '').trim();
        info.nombre = tx.split(/\s*,\s*\d{1,3}\s*$/)[0].split('\n')[0].trim() || txtt || tx;
      }
    }
    if (!info.nombre) {
      info.nombre = (fila.textContent || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 1).join(' ') || '';
    }
    var fFecha = fila.querySelector(BR_SEL.fecha);
    if (fFecha) info.fechaRaw = (fFecha.textContent || '').trim();
    info.esPinned = !!fila.querySelector(BR_SEL.pinned);
    info.esSaved = !!fila.querySelector(BR_SEL.saved);
    var fUlt = fila.querySelector(BR_SEL.ultimo);
    if (fUlt) info.ultimo = (fUlt.textContent || '').trim();
  } catch (e) { /* info parcial */ }
  return info;
}

// Devuelve el contenedor scrolleable de la lista
function brScrollEl() {
  var list = document.querySelector('.virt-list.list-infinite, [data-test-id="dialogs-list-items"], .dialogs__scroll-infinite-list');
  if (!list) return null;
  var sc = list.querySelector('.scroll[tabindex]') || list.querySelector('.scroll');
  if (sc && sc.scrollHeight > sc.clientHeight) return sc;
  var vz = list.querySelector('.virtualizer');
  var el = vz;
  while (el) {
    if (el.scrollHeight > el.clientHeight + 100) return el;
    el = el.parentElement;
  }
  return sc;
}

async function brCapturarActive() {
  var bandeja = brBuscarBandeja();
  if (!bandeja) {
    brLog('No se encontro ninguna bandeja. Debes estar en el apartado Active de Talkytimes.');
    return [];
  }
  var sc = brScrollEl();
  if (sc) { try { sc.scrollTop = sc.scrollHeight; } catch (e) { } } // ir al final: contacto mas antiguo abajo
  await brSleep(600);
  var visto = {};
  var out = [];
  var pasos = 0, MAX = 600;
  while (!brState.stop && pasos++ < MAX) {
    bandeja.querySelectorAll('.virtua-item').forEach(function (fila) {
      var info = brInfoFila(fila);
      if (!info.id) return;
      if (visto[info.id]) return;
      visto[info.id] = true;
      if (!info.nombre) return;
      out.push({
        id: info.id,
        nombre: info.nombre,
        fechaRaw: info.fechaRaw,
        ultimo: info.ultimo,
        fechaTs: brParseFecha(info.fechaRaw),
        esPinned: info.esPinned,
        esSaved: info.esSaved,
        bloqueado: false
      });
    });
    if (!sc) break;
    if (sc.scrollTop <= 0) break; // llegamos arriba
    var before = sc.scrollTop;
    sc.scrollTop = Math.max(0, sc.scrollTop - Math.max(600, sc.clientHeight * 0.9));
    if (sc.scrollTop >= before) break; // no avanzo hacia arriba
    await brSleep(450);
  }
  out.sort(brOrdenarAsc);
  brLog('Capturados ' + out.length + ' contactos en Active (scroll completo, de abajo hacia arriba). Ordenados por fecha ascendente (mas antiguo primero).');
  var pin = out.filter(function (c) { return c.esPinned || c.esSaved; }).length;
  brLog('De los ' + out.length + ', ' + pin + ' son Pinned/Saved (se saltan).');
  out.slice(0, 3).forEach(function (c) {
    brLog('  # ' + (c.nombre || '(sin nombre)') + ' | fecha: ' + (c.fechaRaw || '(sin fecha)') + ' | Pinned:' + c.esPinned + ' Saved:' + c.esSaved);
  });
  if (!out.length) brLog('No se capturo ningun contacto. Revisa que la lista Active este visible y el contenedor .scroll de la lista virtualizada.');
  return out;
}

// Relocaliza una fila por data-id scrolleando desde arriba (robusto ante reordenamiento)
async function brLocalizarId(id) {
  var sc = brScrollEl();
  if (sc) { try { sc.scrollTop = 0; } catch (e) { } }
  var guard = 0;
  while (!brState.stop && guard++ < 400) {
    var node = document.querySelector('.virtualized-item[data-id="' + id + '"]');
    if (node) return node;
    if (!sc) return null;
    var bottom = sc.scrollHeight - sc.clientHeight;
    if (bottom > 0 && sc.scrollTop >= bottom - 4) return null;
    sc.scrollTop = Math.min(bottom, sc.scrollTop + Math.max(600, sc.clientHeight * 0.9));
    await brSleep(450);
  }
  return null;
}

// Abre el chat de un contacto haciendo click en su fila (relocalizada por data-id)
async function brAbrirChat(c) {
  var node = await brLocalizarId(c.id);
  if (!node) { brLogE('No se pudo relocalizar la fila de ' + (c.nombre || c.id)); return false; }
  var content = node.querySelector('.dialog-item-content');
  if (!content) { brLogE('Fila sin .dialog-item-content para ' + (c.nombre || c.id)); return false; }
  try { content.click(); } catch (e) { brLogE('click fila:', e.message); return false; }
  await brSleep(1500);
  return true;
}

// Verifica que el chat abierto corresponde al contacto destino:
// coincide el data-id de la fila seleccionada y el nombre de esa fila con c.nombre.
function brVerificarDestino(c) {
  var filaSel = document.querySelector('.dialog-item[data-isselected="true"]');
  var v = { ok: false, nombreVisto: '', idOk: false, nombreOk: false };
  if (filaSel) {
    var nm = filaSel.querySelector('.dialog-item__name, [class*="dialog-item__title"]');
    v.nombreVisto = nm ? String(nm.textContent || '').trim().replace(/\s*,\s*\d{1,3}\s*$/, '') : '';
    v.idOk = !!(filaSel.closest && filaSel.closest('.virtualized-item[data-id="' + c.id + '"]'));
    v.nombreOk = !!c.nombre && v.nombreVisto.toLowerCase() === String(c.nombre).trim().toLowerCase();
    v.ok = v.idOk || v.nombreOk;
  } else {
    // sin fila marcada como seleccionada: verificar solo que exista la fila con el id
    v.idOk = !!document.querySelector('.virtualized-item[data-id="' + c.id + '"]');
    v.ok = v.idOk;
  }
  return v;
}

// Obtiene las filas reales de la bandeja.
// Estructura real: ... > .dialogs__scroll-infinite-list > div > div > div > div > .virtualizer > div > div (cada uno es una fila).
function brObtenerFilas(bandeja) {
  var out = [];
  var vistos = new Set();
  function add(el) { if (el && el.nodeType === 1 && !vistos.has(el)) { vistos.add(el); out.push(el); } }
  // 1) virtualizer: cada hijo de .virtualizer > div es una fila de dialogo
  try {
    var rows = bandeja.querySelectorAll('.virtualizer > div > div, [class*="virtualizer"] > div > div');
    rows.forEach(function (r) { if (brEsFila(r)) add(r); });
  } catch (e) { brLogE('virtualizer:', e.message); }
  // 2) fallback: subir desde cada item a su fila individual
  if (!out.length) {
    bandeja.querySelectorAll(BR_SEL.items.join(', ')).forEach(function (n) {
      if (!n || n.nodeType !== 1) return;
      var fila = n;
      try {
        var cl = n.closest('.virtualizer > div > div, [class*="dialog-item"]');
        if (cl && cl !== document) fila = cl;
      } catch (e) { /* closest fallback */ }
      add(fila);
    });
  }
  brLog('brObtenerFilas -> ' + out.length + ' filas (hijos directos de la bandeja: ' + bandeja.children.length + ')');
  return out;
}

// Detecta si un elemento parece una fila de dialogo (contiene contenido o marcadores).
function brEsFila(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.querySelector('.dialog-item-content, .dialog-item__date-row, .dialog-item__icons, .chat-actions-button')) return true;
  return /^dialog[-_]item(\s|$)/.test(String(el.className || '').trim());
}

// ===== Salto de contactos Pinned/Saved (no reciben mensajes) =====
function brSaltar(contacto) {
  contacto.bloqueado = true;
  brState.stats.bloqueados++;
  brRenderStats();
  brLog('Saltado (Pinned/Saved, sin mensajes): ' + (contacto.nombre || '(sin nombre)') + ' [Pinned:' + contacto.esPinned + ' Saved:' + contacto.esSaved + ']');
}

// ===== Generacion IA de los 5 mensajes =====
async function brGenerarMensajes(contacto) {
  var token;
  try { token = await tessStorageGet('tess_jwt'); } catch (e) { token = null; }
  if (!token) throw new Error('No hay sesion activa');
  var contexto = 'Genera la secuencia de reenganche. Nombre visible en el chat: ' + (contacto.nombre || 'sin nombre identificado') + '. Conversación incipiente que se cortó.' +
    ' IMPORTANTE: no uses ningún tema concreto ni menciones nada específico del chat (el único rastro visible suele ser un mensaje del propio emisor, no del cliente).' +
    ' La secuencia debe girar únicamente en torno a: la ligera duda de por qué no se volvieron a hablar y las ganas genuinas de retomar el diálogo, sin mendigar respuesta.';
  var resp = await fetch(BR_API + '/api/chatgpt/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ messages: [{ role: 'system', content: brPrompt() }, { role: 'user', content: contexto }], max_tokens: 800 })
  });
  var json = await resp.json().catch(function () { return {}; });
  if (!resp.ok) {
    var m = (json && json.error) || ('Error HTTP ' + resp.status);
    if (/401/i.test(String(resp.status))) m = 'Sesion expirada. Vuelve a iniciar sesion.';
    throw new Error(m);
  }
  var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!content) throw new Error('La IA no devolvio mensajes');
  brLog('IA respondio (preview): ' + String(content).slice(0, 160));
  var msgs = brExtraerJsonMensajes(content);
  if (!msgs) msgs = brParsearMensajes(content);
  if (!msgs || !msgs.length) throw new Error('No se pudieron extraer mensajes de la IA');
  brLog('Parseados ' + msgs.length + ' mensajes.');
  return msgs;
}

// Extraer mensajes desde JSON estricto {"1":...,"2":...,...}
function brExtraerJsonMensajes(content) {
  try {
    var m = String(content).match(/\{[\s\S]*\}/);
    if (!m) return null;
    var obj = JSON.parse(m[0]);
    if (!obj || typeof obj !== 'object') return null;
    var out = [];
    for (var k = 1; k <= 5; k++) {
      var v = obj[String(k)];
      if (typeof v === 'string' && v.trim()) out.push(v.trim());
    }
    return out.length ? out : null;
  } catch (e) { return null; }
}

// Parseo robusto: acepta [1]-[5] con identificadores, numeros sueltos, bullets, o lineas en blanco.
function brParsearMensajes(content) {
  var out = [];
  // caso 1: marcadores [N] o "N)" o "1."
  var reMark = /(?:^|\n)\s*(?:\[\s*([1-5])\s*\]|[-\*]?\s*\(?([1-5])\)?[\.:\)]\s*)(.+)/i;
  try {
    var lines = String(content).replace(/\r/g, '').split('\n');
    var cur = -1;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l) continue;
      var m = l.match(/^\s*(?:\[\s*([1-5])\s*\]|[-\*]\s*)?\(?([1-5])\)?[\.:]\s*(.+)$/i);
      if (m && (m[1] || m[2])) {
        cur = parseInt(m[1] || m[2], 10) - 1;
        out[cur] = m[3].trim();
      } else if (/^\s*\[\s*[1-5]\s*\]\s*$/i.test(l) || /^\(\s*[1-5]\s*\)\s*$/i.test(l)) {
        cur = parseInt(l.match(/\d+/)[0], 10) - 1;
        out[cur] = '';
      } else if (cur >= 0) {
        if (out[cur] == null) out[cur] = '';
        out[cur] = (out[cur] ? out[cur] + ' ' : '') + l;
      }
    }
  } catch (e) { /* ignore */ }
  out = out.slice(0, 5).map(function (s) { return (s || '').trim(); }).filter(Boolean);
  if (out.length) return out;
  // caso 2: separar por linea en blanco
  var chunks = String(content).replace(/\r/g, '').split(/\n\s*\n/).map(function (c) { return c.trim(); }).filter(Boolean);
  if (chunks.length) return chunks.slice(0, 5);
  // caso 3: todo el texto como un solo mensaje
  var t = String(content).trim();
  return t ? [t] : [];
}

// ===== Inyeccion y envio en textarea =====
function brSetTextarea(value) {
  var ta = document.querySelector(BR_SEL.textarea);
  if (!ta) throw new Error('No se encontro el textarea de mensaje');
  ta.focus();
  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, value);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  return ta;
}

function brClickSend() {
  var wrap = document.querySelector(BR_SEL.send);
  if (!wrap) return false;
  var btn = wrap.querySelector('button, [role="button"], [class*="send"]') || wrap;
  btn.click();
  return true;
}

async function brEnviarMensaje(texto) {
  try {
    brSetTextarea(texto);
    await new Promise(function (r) { setTimeout(r, 400); });
    var ok = brClickSend();
    if (!ok) {
      // fallback: Enter
      var ta = document.querySelector(BR_SEL.textarea);
      if (ta) ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
    return true;
  } catch (e) {
    brLogE('enviar error:', e.message);
    return false;
  }
}

// ===== Secuencia para un contacto (usa mensajes editados de la UI) =====
async function brEnviarSecuencia(contacto, msgs) {
  for (var i = 0; i < msgs.length; i++) {
    if (brState.stop) return 'stop';
    while (brState.paused && !brState.stop) { await new Promise(function (r) { setTimeout(r, 500); }); }
    if (brState.stop) return 'stop';
    brStatus('Enviando mensaje ' + (i + 1) + '/5 a ' + (contacto.nombre || '(contacto)') + '...', '');
    var ok = await brEnviarMensaje(msgs[i]);
    if (ok) {
      brState.stats.mensajes++;
      brRenderStats();
    } else {
      brState.stats.errores++;
      brRenderStats();
      brLogE('fallo enviar msg ' + (i + 1) + ' a ' + (contacto.nombre || '(contacto)'));
    }
    if (i < msgs.length - 1) {
      await brEsperaPausa();
      if (brState.stop) return 'stop';
    }
  }
  return 'ok';
}

function brEsperaPausa() {
  var ms = (parseInt((brEl('brGapMsgs') && brEl('brGapMsgs').value) || '20000', 10) || 20000);
  return new Promise(function (resolve) {
    var t0 = Date.now();
    (function tick() {
      if (brState.stop) return resolve();
      if (Date.now() - t0 >= ms) return resolve();
      setTimeout(tick, 300);
    })();
  });
}

function brEsperaPausaContactos() {
  var ms = (parseInt((brEl('brGapContacts') && brEl('brGapContacts').value) || '45000', 10) || 45000);
  return new Promise(function (resolve) {
    var t0 = Date.now();
    (function tick() {
      if (brState.stop) return resolve();
      if (Date.now() - t0 >= ms) return resolve();
      setTimeout(tick, 300);
    })();
  });
}

// ===== UI de edicion de los 5 mensajes antes de enviar =====
function brMostrarEdicion(msgs) {
  var box = brEl('brEditBox');
  if (!box) return;
  box.style.display = 'block';
  var nameEl = brEl('brEditName');
  if (nameEl) {
    var c = brState.current;
    nameEl.textContent = 'PARA: ' + ((c && c.nombre) || '(contacto)');
  }
  var cont = brEl('brEditMsgs');
  cont.innerHTML = '';
  var labels = ['1 - SALUDO', '2 - INTERROGANTE', '3 - COMPLEMENTO', '4 - RESCATE DEL HILO', '5 - CIERRE'];
  msgs.forEach(function (txt, i) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:6px;';
    var lab = document.createElement('div');
    lab.textContent = labels[i] || ('Mensaje ' + (i + 1));
    lab.style.cssText = 'font-size:8px;color:#fbbf24;letter-spacing:1px;margin-bottom:2px;';
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.dataset.idx = i;
    ta.style.cssText = 'width:100%;padding:5px;background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-size:11px;font-family:Arial;height:52px;resize:vertical;box-sizing:border-box;';
    wrap.appendChild(lab);
    wrap.appendChild(ta);
    cont.appendChild(wrap);
  });
}

function brLeerEditados() {
  var cont = brEl('brEditMsgs');
  var out = [];
  if (cont) {
    cont.querySelectorAll('textarea[data-idx]').forEach(function (ta) {
      var i = parseInt(ta.dataset.idx, 10);
      out[i] = ta.value;
    });
  }
  return out.filter(Boolean).slice(0, 5);
}

// Traduce un mensaje al ingles usando el proxy del server (fallback: texto original)
async function brTraducir(texto) {
  var token;
  try { token = await tessStorageGet('tess_jwt'); } catch (e) { token = null; }
  if (!token) return texto;
  try {
    var resp = await fetch(BR_API + '/api/openai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ text: texto, targetLang: 'en', targetName: 'inglés' })
    });
    var json = await resp.json().catch(function () { return {}; });
    var t = json && json.data && json.data.translations && json.data.translations[0] && json.data.translations[0].text;
    return (t && String(t).trim()) ? String(t).trim() : texto;
  } catch (e) {
    brLogE('brTraducir error:', e.message);
    return texto;
  }
}

// Lee el limite de mensajes disponibles del tooltip de restricciones del cliente.
// Devuelve null si no aplica, o un numero entre 1 y 5 con el maximo de mensajes a enviar.
function brLimiteMensajes() {
  var el = null;
  for (var i = 0; i < BR_SEL.restriccion.length; i++) {
    el = document.querySelector(BR_SEL.restriccion[i]);
    if (el) break;
  }
  if (!el) return null;
  var txt = String(el.textContent || '').trim();
  var nums = String(txt).match(/\d+/g);
  brLog('Restriccion detectada: "' + txt + '"');
  if (!nums || !nums.length) return null;
  var lim = parseInt(nums[0], 10);
  if (isNaN(lim)) return null;
  return Math.max(1, Math.min(5, lim));
}

// ===== Confirmacion y continuacion de cola =====
async function brConfirmarEnvio() {
  if (brState.running) { showTessToast('El barrido ya esta en curso (envio automatico)', 'warning'); return; }
  if (brState.manual) return; // evita doble clic / doble envio
  brState.manual = true;
  try {
    if (!brState.current) return;
    var msgs = brLeerEditados();
    if (!msgs.length) { showTessToast('No hay mensajes editados', 'error'); return; }
    var c = brState.current;
    brStatus('Traduciendo al ingles...', '');
    var en = [];
    for (var i = 0; i < msgs.length; i++) {
      en.push(await brTraducir(msgs[i]));
      if (brState.stop) { brStatus('Barrido detenido.', 'warn'); return; }
    }
    var lim = brLimiteMensajes();
    if (lim != null && lim < en.length) {
      brLog('Cliente con limite de ' + lim + ' mensajes; se enviaran solo ' + lim + ' de ' + en.length + '.');
      showTessToast('Límite: solo ' + lim + ' mensajes disponibles', 'warning');
      en = en.slice(0, lim);
    }
    brLog('Enviando en ingles: ' + JSON.stringify(en));
    var reabierto = await brAbrirChat(c);
    if (!reabierto && !brState.stop) {
      brState.stats.errores++;
      brRenderStats();
      brStatus('No se pudo reabrir el chat de ' + (c.nombre || '(contacto)') + '; se omite.', 'err');
      await brEsperaPausaContactos();
      await brContinuarCola();
      return;
    }
    var v = brVerificarDestino(c);
    if (!v.ok && !brState.stop) {
      brLog('Destino NO concuerda (manual): esperado ' + (c.nombre || c.id) + ', vista "' + v.nombreVisto + '". Reintento.');
      await brAbrirChat(c);
      v = brVerificarDestino(c);
    }
    if (!v.ok && !brState.stop) {
      brState.stats.errores++;
      brRenderStats();
      brStatus('🛡 Se omite ' + (c.nombre || '(contacto)') + ': no concuerda el destino.', 'err');
      await brEsperaPausaContactos();
      await brContinuarCola();
      return;
    }
    brLog('Destino verificado (manual): ' + (c.nombre || c.id) + ' (fila: "' + v.nombreVisto + '")');
    var res = await brEnviarSecuencia(c, en);
    brState.stats.procesados++;
    brRenderStats();
    if (res !== 'stop') {
      // continuar con el resto de la cola (el actual ya fue quitado por brContinuarCola)
      await brContinuarCola();
    } else {
      brStatus('Barrido detenido.', 'warn');
    }
  } finally {
    brState.manual = false;
  }
}

var brQueue = [];

// Envia automaticamente los mensajes de un contacto: traduce al ingles, aplica limite y envia en secuencia.
async function brProcesarContacto(c, msgs) {
  if (brState.stop) return 'stop';
  brStatus('Traduciendo mensajes al ingles para ' + (c.nombre || '(contacto)') + '...', '');
  var en = [];
  for (var i = 0; i < msgs.length; i++) {
    en.push(await brTraducir(msgs[i]));
    if (brState.stop) { brStatus('Barrido detenido.', 'warn'); return 'stop'; }
  }
  var lim = brLimiteMensajes();
  if (lim != null && lim < en.length) {
    brLog('Cliente con limite de ' + lim + ' mensajes; se enviaran solo ' + lim + ' de ' + en.length + '.');
    showTessToast('Límite: solo ' + lim + ' mensajes disponibles', 'warning');
    en = en.slice(0, lim);
  }
  brLog('Enviando a ' + (c.nombre || c.id) + ' en ingles: ' + JSON.stringify(en));
  var reabierto = await brAbrirChat(c);
  if (!reabierto && !brState.stop) {
    brState.stats.errores++;
    brRenderStats();
    brStatus('No se pudo reabrir el chat de ' + (c.nombre || '(contacto)') + '; se omite.', 'err');
    return 'error';
  }
  // VERIFICACION DE DESTINO: el mensaje debe concordar con el contacto (nombre + fila seleccionada)
  var v = brVerificarDestino(c);
  if (!v.ok && !brState.stop) {
    brStatus('Destino no concuerda para ' + (c.nombre || '(contacto)') + '; reintentando...', 'warn');
    brLog('Destino NO concuerda: esperado ' + (c.nombre || c.id) + ', vista fila "' + v.nombreVisto + '" (idOk:' + v.idOk + '). Reintento.');
    await brAbrirChat(c);
    v = brVerificarDestino(c);
  }
  if (!v.ok && !brState.stop) {
    brState.stats.errores++;
    brRenderStats();
    brStatus('🛡 Se omite ' + (c.nombre || '(contacto)') + ': el chat abierto no concuerda (visto "' + v.nombreVisto + '").', 'err');
    brLog('OMITIDO por destino no concordante: esperado ' + (c.nombre || c.id) + ' | visto "' + v.nombreVisto + '" | idOk:' + v.idOk);
    return 'error';
  }
  brLog('Destino verificado: ' + (c.nombre || c.id) + ' (fila: "' + v.nombreVisto + '", idOk:' + v.idOk + ')');
  var res = await brEnviarSecuencia(c, en);
  brState.stats.procesados++;
  brRenderStats();
  return res;
}

async function brContinuarCola() {
  brState.running = true;
  var guard = 0;
  while (brQueue.length && !brState.stop) {
    if (guard++ > 1000) break;
    while (brState.paused && !brState.stop) { await new Promise(function (r) { setTimeout(r, 500); }); }
    if (brState.stop) { brStatus('Barrido detenido.', 'warn'); break; }
    var c = brQueue.shift();
    brState.current = c;
    if (c.esPinned || c.esSaved) {
      brSaltar(c);
      brState.stats.procesados++;
      brRenderStats();
      await brEsperaPausaContactos();
      continue;
    }
    brStatus('Abriendo chat de ' + (c.nombre || '(contacto)') + '...', '');
    var abierto = await brAbrirChat(c);
    if (!abierto && !brState.stop) {
      brState.stats.errores++;
      brRenderStats();
      brStatus('No se pudo abrir el chat de ' + (c.nombre || '(contacto)') + '; se omite.', 'err');
      brLogE('No se pudo abrir el chat: ' + String(c.id));
      await brEsperaPausaContactos();
      continue;
    }
    brStatus('Generando 5 mensajes para ' + (c.nombre || '(contacto)') + '...', '');
    try {
      var msgs = await brGenerarMensajes(c);
      if (!msgs || !msgs.length) throw new Error('No se generaron mensajes para ' + (c.nombre || '(contacto)'));
      brMostrarEdicion(msgs);
      brStatus('Mensajes para ' + (c.nombre || '(contacto)') + ' generados. Enviando automaticamente en breve...', 'ok');
      await brSleep(2500); // deja ver los mensajes editables antes de enviar
      var res = await brProcesarContacto(c, msgs);
      if (res === 'stop') break;
      await brEsperaPausaContactos();
    } catch (e) {
      brState.stats.errores++;
      brRenderStats();
      brStatus('Error: ' + e.message, 'err');
      brLogE(e.message);
      await brEsperaPausaContactos();
    }
  }
  if (!brQueue.length && !brState.stop) {
    brStatus('Barrido completado. Bloqueados: ' + brState.stats.bloqueados + ' | Mensajes: ' + brState.stats.mensajes, 'ok');
    showTessToast('Barrido completado.', 'success');
  }
  brState.running = false;
  var b = brEl('brStartBtn'); if (b) b.disabled = false;
}

// ===== Controles UI =====
async function brStart() {
  if (brState.running) { showTessToast('El barrido ya esta en curso', 'warning'); return; }
  brState.running = true; // marca desde el inicio para evitar doble arranque
  brState.stop = false;
  brState.paused = false;
  brState.stats = { procesados: 0, bloqueados: 0, mensajes: 0, errores: 0 };
  brRenderStats();
  brEl('brStartBtn').disabled = true;
  brStatus('Capturando lista de Active (de abajo hacia arriba)...', '');
  brQueue = await brCapturarActive();
  if (!brQueue.length) {
    brStatus('No se capturaron contactos en Active. Revisa la consola [BARRIDO] y confirma que estas en la pestana/filtro Active.', 'err');
    showTessToast('BARRIDO: no se capturaron contactos', 'error');
    brEl('brStartBtn').disabled = false;
    brState.running = false;
    return;
  }
  brContinuarCola();
}

function brPauseToggle() {
  brState.paused = !brState.paused;
  var b = brEl('brPauseBtn');
  if (b) { b.textContent = brState.paused ? '▶ REANUDAR' : '⏸ PAUSAR'; b.style.background = brState.paused ? '#15803d' : 'rgba(245,158,11,0.2)'; }
}

function brStop() {
  brState.stop = true;
  brStatus('Deteniendo...', 'warn');
  var b = brEl('brStartBtn'); if (b) b.disabled = false;
}

// FRENO DE EMERGENCIA: corta de inmediato el proceso en curso (puede dejar un mensaje medio enviado).
function brFreno() {
  brState.stop = true;
  brQueue = [];
  brState.running = false;
  brStatus('🛑 FRENO DE EMERGENCIA. Barrido detenido.', 'err');
  showTessToast('FRENO: barrido detenido', 'warning');
  var b = brEl('brStartBtn'); if (b) b.disabled = false;
}

// ===== Montaje de la pestana =====
function mountBarridoTab() {
  var host = document.getElementById('tabBarrido');
  if (!host) return false;
  if (host.querySelector('#brWrap')) return true;

  var style = document.createElement('style');
  style.textContent = `
#brWrap *{box-sizing:border-box;}
#brWrap .br-sec{margin-bottom:10px;padding:9px;background:rgba(8,10,16,0.85);border:1px solid #8b5cf6;border-radius:8px;}
#brWrap .br-sec h4{font-size:9px;letter-spacing:1px;margin:0 0 6px 0;color:#e0e0e0;text-transform:uppercase;}
#brWrap .br-desc{font-size:9px;color:#888;margin-bottom:8px;}
#brWrap .br-row{display:flex;align-items:center;gap:8px;margin-top:8px;}
#brWrap .br-row label{font-size:9px;color:#888;white-space:nowrap;}
#brWrap .br-row input{width:70px;background:#000;color:#e0e0e0;border:1px solid #8b5cf6;border-radius:4px;font-size:10px;padding:4px;}
#brWrap .br-ctl{width:100%;margin-top:10px;padding:10px;border:1px solid #8b5cf6;border-radius:6px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:1px;transition:all .3s;}
#brWrap .br-ctl:hover:not(:disabled){background:#5b21b6;box-shadow:0 0 12px rgba(139,92,246,.7);}
#brWrap .br-ctl:disabled{opacity:.5;cursor:not-allowed;}
#brWrap .br-ctls{display:flex;gap:6px;margin-top:8px;}
#brWrap .br-ctls button{flex:1;padding:8px;border-radius:6px;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;transition:all .3s;border:1px solid #8b5cf6;background:rgba(8,10,16,0.85);color:#e0e0e0;}
#brWrap .br-ctls button:hover{background:#5b21b6;color:#fff;}
#brWrap .br-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;}
#brWrap .br-stat{background:rgba(8,10,16,0.6);border:1px solid #2a2a44;border-radius:6px;text-align:center;padding:6px;}
#brWrap .br-stat .v{font-size:16px;color:#a78bfa;font-weight:bold;}
#brWrap .br-stat .l{font-size:8px;color:#888;letter-spacing:1px;text-transform:uppercase;}
#brWrap .br-status{font-size:10px;color:#22d3ee;min-height:14px;margin-top:8px;}
#brWrap .br-editbox{display:none;margin-top:10px;padding:9px;background:rgba(8,10,16,0.85);border:1px solid #fbbf24;border-radius:8px;}
#brWrap .br-editbox h4{font-size:9px;letter-spacing:1px;margin:0 0 6px 0;color:#fbbf24;text-transform:uppercase;}
#brWrap .br-editbox .br-step{font-size:9px;color:#888;margin-bottom:6px;}`;
  document.head.appendChild(style);

  var wrap = document.createElement('div');
  wrap.id = 'brWrap';
  wrap.innerHTML = `
  <div class="br-sec">
    <h4>🧹 BARRIDO DE ACTIVE</h4>
    <div class="br-desc">Recorre Active de abajo hacia arriba (mas antiguo a mas nuevo). PINNED/SAVED se bloquean; el resto recibe 5 mensajes IA generados, traducidos al ingles y enviados automaticamente uno a uno. Usa el FRENO en emergencias.</div>
    <div class="br-row">
      <label>Pausa entre mensajes (s):</label>
      <input id="brGapMsgs" type="number" value="20" min="2">
    </div>
    <div class="br-row">
      <label>Pausa entre contactos (s):</label>
      <input id="brGapContacts" type="number" value="45" min="5">
    </div>
    <button class="br-ctl" id="brStartBtn">▶ INICIAR BARRIDO</button>
    <div class="br-ctls">
      <button id="brPauseBtn">⏸ PAUSAR</button>
      <button id="brStopBtn">⏹ DETENER</button>
    </div>
    <div class="br-ctls">
      <button id="brBrakeBtn" style="flex:1.6;border-color:#f87171;background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff;">🛑 FRENO DE EMERGENCIA</button>
    </div>
    <div class="br-stats">
      <div class="br-stat"><div class="v" id="brStProcesados">0</div><div class="l">Procesados</div></div>
      <div class="br-stat"><div class="v" id="brStBloqueados">0</div><div class="l">Bloqueados</div></div>
      <div class="br-stat"><div class="v" id="brStMensajes">0</div><div class="l">Mensajes</div></div>
      <div class="br-stat"><div class="v" id="brStErrores">0</div><div class="l">Errores</div></div>
    </div>
    <div class="br-status" id="brStatus"></div>
  </div>
  <div class="br-editbox" id="brEditBox">
    <h4>✏️ MENSAJES GENERADOS (editables)</h4>
    <div class="br-step" id="brEditName"></div>
    <div id="brEditMsgs"></div>
    <button class="br-ctl" id="brConfirmBtn" style="background:linear-gradient(135deg,#059669,#047857);border-color:#22c55e;">✔ CONFIRMAR Y ENVIAR</button>
  </div>`;
  host.appendChild(wrap);

  brEl('brStartBtn').addEventListener('click', brStart);
  brEl('brPauseBtn').addEventListener('click', brPauseToggle);
  brEl('brStopBtn').addEventListener('click', brStop);
  brEl('brBrakeBtn').addEventListener('click', brFreno);
  brEl('brConfirmBtn').addEventListener('click', brConfirmarEnvio);

  console.log('[BARRIDO] ✅ Pestana BARRIDO montada (bot panel)');
  return true;
}

function initBarrido() {
  try {
    mountBarridoTab();
  } catch (e) {
    console.error('[BARRIDO] init error:', e.message);
  }
}

if (!window.__brInitReady) {
  window.__brInitReady = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initBarrido(); });
  } else {
    setTimeout(initBarrido, 400);
  }
}
