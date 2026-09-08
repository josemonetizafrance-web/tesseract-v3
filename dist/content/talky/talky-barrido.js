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
  restriccion: ['.restriction-limits-wrapper .v-popper span > div', '.restriction-limits-wrapper [class*="tooltip"] span > div', '.restriction-limits-wrapper [class*="popper"] span > div', '[class*="restriction-limits"] [class*="tooltip"] span > div']
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
  return 'Actúa como un especialista en comunicación interpersonal y redacción de mensajes de reenganche para conversaciones incipientes.\n' +
    'Tu tarea es generar una SECUENCIA DE 5 MENSAJES consecutivos dirigidos a una persona con quien solamente se han intercambiado uno o dos mensajes previamente y después no hubo continuidad.\n' +
    'OBJETIVO: Despertar curiosidad y motivar una respuesta sin reclamar la falta de comunicación, sin parecer necesitado y sin asumir que existe una relación, vínculo afectivo o confianza que todavía no se ha construido.\n' +
    'ESTRUCTURA OBLIGATORIA DE LOS 5 MENSAJES:\n' +
    'MENSAJE 1 — SALUDO: Comenzar de manera natural y cordial. Puede incluir una pregunta sencilla sobre cómo está o cómo comenzó su día. No mencionar todavía la conversación anterior de forma evidente. Debe sentirse espontáneo, no como un mensaje preparado.\n' +
    'MENSAJE 2 — INTERROGANTE: Continuar naturalmente desde el saludo anterior. Introducir una pregunta que permita conocer algo más de la persona. La pregunta debe despertar curiosidad, pero sin ser demasiado personal. Evitar interrogatorios o preguntas genéricas demasiado obvias.\n' +
    'MENSAJE 3 — COMPLEMENTO: Hacer referencia indirecta a la pequeña conversación que tuvieron. Destacar sutilmente alguna impresión positiva sobre su manera de expresarse, pensar o conversar. El complemento debe ser elegante y moderado. No utilizar halagos físicos ni exagerados.\n' +
    'MENSAJE 4 — SEMBRAR INTRIGA: Hacer notar indirectamente que la conversación quedó corta o incompleta. Nunca reclamar que la persona dejó de escribir. Utilizar una sensación de curiosidad: "me quedé pensando", "me llamó la atención", "sentí que apenas...", etc. Crear la sensación de que todavía hay algo por descubrir.\n' +
    'MENSAJE 5 — CIERRE (PUSH & PULL MODERADO): Mostrar interés y, al mismo tiempo, conservar cierta distancia o incertidumbre. No sonar necesitado, insistente ni ansioso. Cerrar dejando abierta la posibilidad de continuar hablando. Terminar preferiblemente con una pregunta suave o una invitación indirecta a continuar. El cierre debe sentirse natural, no como una petición directa de respuesta.\n' +
    'REGLAS DE TONO: Seductor, elegante, natural y ligeramente misterioso. Intriga sutil, nunca manipulación. Confianza moderada. Cercano, pero sin exceso de confianza. Lenguaje cotidiano y humano. Evitar frases demasiado románticas o intensas. Mantener "me llamaste la atención, pero todavía estoy descubriendo quién eres". Push and pull MODERADO. Cada mensaje debe conectar con el anterior como si hubiera sido escrito por la misma persona en momentos consecutivos.\n' +
    'RESTRICCIONES: NO mencionar vínculo afectivo. NO asumir relación. NO usar "mi amor", "cariño", "mi vida", "te extraño", "te necesito". NO hablar de encuentros físicos reales. NO mencionar besos, abrazos, contacto físico, citas presenciales o planes para verse. NO referencias a experiencias compartidas que nunca ocurrieron. Plano intangible: conversación, curiosidad, pensamientos, personalidad, palabras e impresiones. NO reclamar "¿por qué no me escribiste?". NO frustración. NO exagerar la importancia de una conversación breve. NO clichés ("conexión real", "sin filtros", "sin máscaras", "sin prisa"). NO repetir estructuras o palabras innecesariamente. Que no parezca automatizado.\n' +
    'LONGITUD: cada mensaje breve, de 15 a 35 palabras.\n' +
    'RESULTADO: Responde ÚNICAMENTE con un bloque JSON válido y NADA más (sin markdown, sin títulos, sin explicaciones, sin comentarios antes ni después), con exactamente esta estructura y en este orden: {"1":"texto del saludo","2":"texto del interrogante","3":"texto del complemento","4":"texto de la intriga","5":"texto del cierre"}. Usa comillas dobles y respeta cada clave del 1 al 5.';
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

// ===== Captura de la bandeja Active =====
function brCapturarActive() {
  var bandeja = brBuscarBandeja();
  if (!bandeja) {
    brLog('No se encontro ninguna bandeja. Debes estar en el apartado Active de Talkytimes.');
    return [];
  }
  var filas = brObtenerFilas(bandeja);
  var out = [];
  filas.forEach(function (fila) {
    try {
      var nombre = '';
      var nmT = fila.querySelector(BR_SEL.nombre);
      var nmD = fila.querySelector('[class*="description"]');
      var nm = nmT || nmD;
      if (nm) {
        var txtt = (nmT ? (nmT.textContent || '') : '').trim();
        if (txtt && !/,\s*\d{1,3}\s*$/.test(txtt)) {
          nombre = txtt;
        } else {
          var tx = (nm.textContent || '').trim();
          // quitar fragmentos externos tipo " , 45" (edad) o preview
          nombre = tx.split(/\s*,\s*\d{1,3}\s*$/)[0].split('\n')[0].trim() || txtt || tx;
        }
      }
      if (!nombre) {
        nombre = (fila.textContent || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 1).join(' ') || '';
      }
      var fechaRaw = '';
      var fFecha = fila.querySelector(BR_SEL.fecha);
      if (fFecha) fechaRaw = (fFecha.textContent || '').trim();
      var esPinned = !!fila.querySelector(BR_SEL.pinned);
      var esSaved = !!fila.querySelector(BR_SEL.saved);
      out.push({
        fila: fila,
        nombre: nombre,
        fechaRaw: fechaRaw,
        fechaTs: brParseFecha(fechaRaw),
        esPinned: esPinned,
        esSaved: esSaved,
        bloqueado: false
      });
    } catch (e) { brLogE('fila skip:', e.message); }
  });
  out.sort(brOrdenarAsc);
  brLog('Capturados ' + out.length + ' contactos en Active. Ordenados por fecha ascendente (mas antigua primero).');
  var pin = out.filter(function (c) { return c.esPinned || c.esSaved; }).length;
  brLog('De los ' + out.length + ', ' + pin + ' son Pinned/Saved (se saltan).');
  out.slice(0, 3).forEach(function (c) {
    brLog('  # ' + (c.nombre || '(sin nombre)') + ' | fecha: ' + (c.fechaRaw || '(sin fecha)') + ' | Pinned:' + c.esPinned + ' Saved:' + c.esSaved);
  });
  return out;
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
  var contexto = 'Genera la secuencia de reenganche para esta persona. Contexto: ' + (contacto.nombre || 'sin nombre identificado') + '. Conversacion incipiente (uno o dos mensajes) que se corto.';
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
  var labels = ['1 - SALUDO', '2 - INTERROGANTE', '3 - COMPLEMENTO', '4 - INTRIGA', '5 - CIERRE'];
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
  var res = await brEnviarSecuencia(c, en);
  brState.stats.procesados++;
  brRenderStats();
  if (res !== 'stop') {
    // continuar con el resto de la cola (el actual ya fue quitado por brContinuarCola)
    await brContinuarCola();
  } else {
    brStatus('Barrido detenido.', 'warn');
  }
}

var brQueue = [];

async function brContinuarCola() {
  brState.running = true;
  var guard = 0;
  while (brQueue.length && !brState.stop) {
    if (guard++ > 1000) break;
    while (brState.paused && !brState.stop) { await new Promise(function (r) { setTimeout(r, 500); }); }
    if (brState.stop) { brStatus('Barrido detenido.', 'warn'); brState.running = false; return; }
    var c = brQueue.shift();
    brState.current = c;
    if (c.esPinned || c.esSaved) {
      brSaltar(c);
      brState.stats.procesados++;
      brRenderStats();
      await brEsperaPausaContactos();
      continue;
    }
    brStatus('Generando 5 mensajes para ' + (c.nombre || '(contacto)') + '...', '');
    try {
      var msgs = await brGenerarMensajes(c);
      brMostrarEdicion(msgs);
      brStatus('Mensajes para ' + (c.nombre || '(contacto)') + ' listos. Revisa y pulsa CONFIRMAR ENVIAR.', 'ok');
      return; // vuelve a esperar confirmacion
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
  brEl('brStartBtn').disabled = false;
}

// ===== Controles UI =====
function brStart() {
  if (brState.running) { showTessToast('El barrido ya esta en curso', 'warning'); return; }
  brState.stats = { procesados: 0, bloqueados: 0, mensajes: 0, errores: 0 };
  brRenderStats();
  brEl('brStartBtn').disabled = true;
  brQueue = brCapturarActive();
  if (!brQueue.length) {
    brStatus('No se capturaron contactos en Active. Revisa la consola [BARRIDO] y confirma que estas en la pestana/filtro Active.', 'err');
    showTessToast('BARRIDO: no se capturaron contactos', 'error');
    brEl('brStartBtn').disabled = false;
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
    <div class="br-desc">Recorre los contactos de Active desde la fecha m\u00e1s antigua hasta la actual. Los marcados con PINNED o SAVED se bloquean autom\u00e1ticamente; el resto recibe 5 mensajes IA editables y enviados uno a uno.</div>
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
