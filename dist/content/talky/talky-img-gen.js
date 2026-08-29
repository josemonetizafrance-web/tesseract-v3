// TESSERACT v24.1 - IMG GEN (Generador de imagenes IA dentro del panel BOT, pestana IMG GEN)
// Flujo: prompt + referencias -> generar (Pro por defecto / Lite opcional) -> auto-guardar en Downloads
// -> boton UPLOAD navega a Manage Media y suelta la imagen en el drop zone para que se suba sola.

var IG_API = (typeof Tesseract !== 'undefined' && Tesseract && Tesseract.API) || window.TESSERACT_API || 'https://tesseract-v3-production.up.railway.app';

var igState = {
  refs: [],
  images: [],
  activeIdx: -1,
  lastBase64: null,
  lastFormat: 'png',
  lastPrompt: '',
  busy: false
};

function _igEl(q) { return document.getElementById(q); }

function igToDataURL(file) {
  return new Promise(function (resolve, reject) {
    var rd = new FileReader();
    rd.onload = function () { resolve(rd.result); };
    rd.onerror = function () { reject(rd.error); };
    rd.readAsDataURL(file);
  });
}

function igMimeFor(fmt) {
  fmt = String(fmt || 'png').toLowerCase();
  if (fmt === 'jpeg' || fmt === 'jpg') return 'image/jpeg';
  if (fmt === 'webp') return 'image/webp';
  if (fmt === 'svg') return 'image/svg+xml';
  return 'image/png';
}

function igSetStatus(msg, kind) {
  var st = _igEl('igStatus');
  if (!st) return;
  st.textContent = msg || '';
  st.style.color = kind === 'ok' ? '#4ade80' : kind === 'err' ? '#f87171' : '#22d3ee';
}

function igSetBusy(b) {
  igState.busy = b;
  var btn = _igEl('igGenBtn');
  if (btn) btn.disabled = b;
}

function igRenderRefs() {
  var wrap = _igEl('igRefThumbs');
  if (!wrap) return;
  wrap.innerHTML = '';
  igState.refs.forEach(function (r, i) {
    var t = document.createElement('div');
    t.style.cssText = 'position:relative;width:52px;height:52px;border-radius:6px;overflow:hidden;border:1px solid #22d3ee;flex-shrink:0;background:#000;';
    var img = document.createElement('img');
    img.src = r.dataUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    var x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Quitar referencia';
    x.style.cssText = 'position:absolute;top:0;right:0;width:16px;height:16px;background:rgba(0,0,0,0.75);color:#fff;border:none;cursor:pointer;font-size:11px;line-height:1;padding:0;';
    x.addEventListener('click', function () {
      igState.refs.splice(i, 1);
      igRenderRefs();
    });
    t.appendChild(img);
    t.appendChild(x);
    wrap.appendChild(t);
  });
  var cnt = _igEl('igRefCount');
  if (cnt) cnt.textContent = igState.refs.length ? igState.refs.length + ' ref' + (igState.refs.length > 1 ? 's' : '') : 'Sin referencias';
}

function igTryAddRef(f) {
  if (!f) return;
  if (!/^image\//i.test(f.type)) {
    showTessToast('Solo se admiten imagenes.', 'error');
    return;
  }
  if (f.size > 5 * 1024 * 1024) {
    showTessToast('Referencia muy grande (max 5MB): ' + f.name, 'error');
    return;
  }
  igToDataURL(f).then(function (d) {
    if (igState.refs.length >= 8) {
      showTessToast('Maximo 8 imagenes de referencia', 'warning');
      return;
    }
    igState.refs.push({ name: f.name, dataUrl: d });
    igRenderRefs();
  }).catch(function () {
    showTessToast('No se pudo leer la imagen: ' + (f.name || ''), 'error');
  });
}

function igAddRefFiles(files) {
  Array.prototype.forEach.call(files, igTryAddRef);
}

// Abre el selector de archivos dirigido a la carpeta Descargas de la PC.
async function igPickRefs() {
  try {
    if (window.showOpenFilePicker) {
      try {
        var handles = await window.showOpenFilePicker({
          multiple: true,
          excludeAcceptAllOption: false,
          startIn: 'downloads',
          types: [{
            description: 'Imagenes',
            accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'] }
          }]
        });
        for (var i = 0; i < handles.length; i++) {
          var f = await handles[i].getFile();
          igTryAddRef(f);
        }
        return;
      } catch (pickErr) {
        if (pickErr && pickErr.name === 'AbortError') return; // usuario cancelo
        // fallback: input clasico
      }
    }
  } catch (e) {
    console.warn('[IMG-GEN] showOpenFilePicker no disponible:', e && e.message);
  }
  var inp = _igEl('igRefInput');
  if (inp) inp.click();
}

function igSaveToDownloads(b64, fmt) {
  var mime = igMimeFor(fmt);
  var raw = String(b64 || '').replace(/\s+/g, '');
  if (raw.indexOf(',') >= 0 && /^data:/i.test(raw)) raw = raw.slice(raw.indexOf(',') + 1);
  var ext = (fmt === 'svg' ? 'svg' : fmt === 'jpeg' ? 'jpg' : fmt);
  var filename = 'tesseract-gen-' + Date.now() + '.' + ext;

  // 1) VIA chrome.downloads (siempre guarda en la carpeta Descargas de la PC).
  try {
    if (chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage({ action: 'TESS_DOWNLOAD', base64: raw, mime: mime, filename: filename }, function (resp) {
            if (chrome.runtime.lastError) {
              console.warn('[IMG-GEN] bg download msg error:', chrome.runtime.lastError.message);
              return resolve(igAnchorDownload(raw, mime, filename));
            }
            if (resp && resp.success) {
              console.log('[IMG-GEN] guardado en Downloads via chrome.downloads:', filename);
              return resolve(true);
            }
            console.warn('[IMG-GEN] bg download fallo:', resp && resp.error);
            resolve(igAnchorDownload(raw, mime, filename));
          });
        } catch (e) {
          resolve(igAnchorDownload(raw, mime, filename));
        }
      });
    }
  } catch (e) {
    console.warn('[IMG-GEN] chrome.downloads no disponible:', e.message);
  }
  // 2) FALLBACK: blob + anchor (requiere gesto de usuario).
  return Promise.resolve(igAnchorDownload(raw, mime, filename));
}

function igAnchorDownload(b64, mime, filename) {
  try {
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var blob = new Blob([u8], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    console.log('[IMG-GEN] descarga (fallback) -> ' + filename + ' (' + Math.round(u8.length / 1024) + 'KB)');
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    return true;
  } catch (e) {
    console.error('[IMG-GEN] save download error:', e);
    return false;
  }
}

async function igGenerate() {
  if (igState.busy) return;
  var prompt = (_igEl('igPrompt').value || '').trim();
  if (!prompt) {
    igSetStatus('Escribe una descripcion (prompt)', 'err');
    showTessToast('Escribe un prompt para generar', 'error');
    return;
  }
  var token;
  try { token = await tessStorageGet('tess_jwt'); } catch (e) { token = null; }
  if (!token) {
    showTessToast('No hay sesion activa. Inicia sesion en TESSERACT.', 'error');
    return;
  }

  var quantity = parseInt((_igEl('igQuantity') && _igEl('igQuantity').value) || '1', 10) || 1;
  var preset = (_igEl('igPreset') && _igEl('igPreset').value) || '1';
  var refs = igState.refs.map(function (r) { return r.dataUrl; });
  var body = { prompt: prompt, preset: preset };
  if (refs.length) body.references = refs;

  igSetBusy(true);
  igState.images = [];
  igState.activeIdx = -1;
  igRenderGallery();
  igSetStatus((quantity > 1 ? 'Generando ' + quantity + ' imagenes...' : 'Generando imagen...') + ' (esto puede tardar)', '');

  var okCount = 0;
  var lastModel = '';
  var firstErr = null;
  for (var q = 0; q < quantity; q++) {
    if (q > 0) { igSetStatus('Generando ' + (q + 1) + '/' + quantity + '...', ''); await new Promise(function (r) { setTimeout(r, 300); }); }
    var ctrl = new AbortController();
    var tmr = setTimeout(function () { ctrl.abort(); }, 180000);
    try {
      var resp = await fetch(IG_API + '/api/chatgpt/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      var json = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        clearTimeout(tmr);
        if (!firstErr && (!q || !json.error || !/499|429|500|503/i.test(String(resp.status)))) {
          firstErr = (json && json.error) || ('Error HTTP ' + resp.status);
          if (/401/i.test(String(resp.status))) firstErr = 'Sesion expirada. Vuelve a iniciar sesion.';
        }
        if (q + 1 === quantity) {
          igSetStatus(firstErr || 'Error generando', 'err');
          showTessToast(firstErr || 'Error generando', 'error');
        }
        continue;
      }
      if (!json.base64) {
        if (q + 1 === quantity) igSetStatus('El servidor no devolvio imagen', 'err');
        continue;
      }
      var fmt = json.format || 'png';
      var mime = igMimeFor(fmt);
      igState.images.push({ base64: json.base64, format: fmt, model: json.model || '' });
      igState.activeIdx = igState.images.length - 1;
      igState.lastBase64 = json.base64;
      igState.lastFormat = fmt;
      igState.lastPrompt = prompt;
      lastModel = json.model || lastModel;

      var imgEl = _igEl('igPreviewImg');
      imgEl.src = 'data:' + mime + ';base64,' + json.base64;
      imgEl.title = 'Generada con ' + (json.model || 'IA') + ' (' + (preset === '2' ? 'Lite' : 'Pro') + ')';
      _igEl('igPreview').style.display = 'block';
      _igEl('igModelTag').textContent = (json.model || '') + (preset === '2' ? '  [LITE]' : '  [PRO]') + '  |  ~' + (preset === '2' ? '512x512' : '1024x1024') + (quantity > 1 ? '  |  ' + (igState.activeIdx + 1) + '/' + quantity : '');

      await igSaveToDownloads(json.base64, fmt);
      igRenderGallery();
      okCount++;
      igSetStatus((quantity > 1 ? 'Generadas ' + okCount + '/' + quantity + '. ' : 'Imagen generada. ') + 'Guardada en Descargas.' + (quantity > 1 && okCount < quantity ? ' Generando el resto...' : ''), 'ok');
    } catch (err) {
      clearTimeout(tmr);
      var m = (err && err.name === 'AbortError') ? 'Tiempo de espera agotado (180s).' : ((err && err.message) || String(err));
      if (/Failed to fetch|NetworkError/i.test(m)) m = 'Sin conexion o servidor no disponible.';
      if (!firstErr) firstErr = m;
    } finally {
      clearTimeout(tmr);
    }
  }
  igSetBusy(false);
  if (okCount > 0) {
    igSetStatus(quantity > 1 ? (okCount === quantity ? 'Listo: ' + okCount + ' imagenes generadas y guardadas en Descargas.' : okCount + '/' + quantity + ' generadas' + (firstErr ? ' (error en alguna: ' + firstErr + ')' : '')).slice(0, 90) : 'Imagen generada y guardada en Descargas. UPLOAD para subirla.', 'ok');
    showTessToast(okCount === quantity ? okCount + ' imagenes guardadas en Descargas' : okCount + ' de ' + quantity + ' generadas', okCount === quantity ? 'success' : 'warning');
  } else if (firstErr) {
    igSetStatus(firstErr, 'err');
    showTessToast(firstErr, 'error');
  }
}

function igSetActiveImage(idx) {
  var it = igState.images[idx];
  if (!it) return;
  igState.activeIdx = idx;
  igState.lastBase64 = it.base64;
  igState.lastFormat = it.format;
  var imgEl = _igEl('igPreviewImg');
  imgEl.src = 'data:' + igMimeFor(it.format) + ';base64,' + it.base64;
  _igEl('igModelTag').textContent = (it.model || '') + '  |  seleccion ' + (idx + 1) + '/' + igState.images.length;
  igRenderGallery();
  igSetStatus('Seleccionada imagen ' + (idx + 1) + ' de ' + igState.images.length + '. UPLOAD la sube, GUARDAR la descarga, CORREGIR la usa como base.', '');
}

function igRenderGallery() {
  var g = _igEl('igGallery');
  if (!g) return;
  g.innerHTML = '';
  g.style.display = igState.images.length ? 'flex' : 'none';
  igState.images.forEach(function (it, i) {
    var t = document.createElement('div');
    t.title = 'Imagen ' + (i + 1) + ' - click para seleccionar';
    t.style.cssText = 'position:relative;width:56px;height:56px;flex-shrink:0;border-radius:6px;overflow:hidden;border:2px solid ' + (i === igState.activeIdx ? '#facc15' : '#1e293b') + ';cursor:pointer;background:#000;';
    var img = document.createElement('img');
    img.src = 'data:' + igMimeFor(it.format) + ';base64,' + it.base64;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;';
    var n = document.createElement('span');
    n.textContent = (i + 1);
    n.style.cssText = 'position:absolute;top:1px;left:1px;background:rgba(0,0,0,0.7);color:#facc15;font-size:8px;padding:0 3px;border-radius:3px;';
    t.appendChild(img);
    t.appendChild(n);
    t.addEventListener('click', function () { igSetActiveImage(i); });
    g.appendChild(t);
  });
}

function igClickManageMedia() {
  var sel = 'a[data-test-id*="item-navigation-to Manage_Media"], [data-test-id*="item-navigation-to Manage_Media"], #Manage_Media';
  var el = document.querySelector(sel);
  if (!el) {
    document.querySelectorAll('a, [role="tab"], [role="menuitem"], button').forEach(function (c) {
      if (!el && (c.textContent || '').trim().toLowerCase() === 'manage media') el = c;
    });
  }
  if (!el) {
    showTessToast('No encontre "Manage Media" en esta pagina. Abrelo tu y reintenta UPLOAD.', 'warning');
    return false;
  }
  el.click();
  return true;
}

function igDropTargetCandidates() {
  return [
    '[data-test-id*="drop"]',
    '[data-test-id*="Drop"]',
    '[data-test-id*="file-drop"]',
    '[data-test-id*="upload"]',
    '[data-test-id*="Upload"]',
    '[data-test-id*="file"] input[type="file"]',
    'input[type="file"][accept*="image"]',
    '[role="dialog"] [class*="drop"]',
    '[class*="drop-zone"]',
    '[class*="dropZone"]',
    '[class*="drop_zone"]',
    '[class*="file-drop"]',
    '[class*="FileDrop"]'
  ];
}

// Simula arrastrar y soltar la imagen EN EL CENTRO DE LA PANTALLA de Manage Media.
async function igDropFileIntoTalky(b64, fmt) {
  var used = null;
  var diag = [];
  try {
    var mime = igMimeFor(fmt);
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var file = new File([u8], 'upload-' + Date.now() + '.png', { type: mime });
    var dt = new DataTransfer();
    dt.items.add(file);
    var cx = Math.round(window.innerWidth / 2);
    var cy = Math.round(window.innerHeight / 2);
    var go = function (el, type) {
      try { el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: cx, clientY: cy, screenX: cx, screenY: cy })); } catch (e) { /* ignorar */ }
    };
    var snap = function (zone) {
      try {
        var r = zone.getBoundingClientRect();
        diag.push('target=' + zone.tagName + ' | id=' + (zone.id || '') + ' | cls=' + String(zone.className || '').slice(0, 120) + ' | testid=' + (zone.getAttribute && zone.getAttribute('data-test-id') || '') + ' | rect=' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      } catch (e) { /* ignorar */ }
    };

    // 1) dragover globales -> la app muestra su overlay central de subida.
    go(document.documentElement, 'dragenter');
    go(document.documentElement, 'dragover');
    go(document.body, 'dragenter');
    go(document.body, 'dragover');
    go(window, 'dragover');

    console.log('[IMG-GEN] ** DIAGNOSTICO UPLOAD **');
    // Lista de contendientes tipo drop en la pagina.
    document.querySelectorAll(igDropTargetCandidates().join(',')).forEach(function (c) { diag.push('candidato ' + (c.tagName || '?') + ' | id=' + (c.id || '') + ' | cls=' + String(c.className || '').slice(0, 80) + ' | testid=' + (c.getAttribute && c.getAttribute('data-test-id') || '')); });
    if (!igDropTargetCandidates().some(function (s) { return document.querySelector(s); })) diag.push('NO hay elementos con testid/class de drop; centro por defecto sera el objetivo.');

    // 2) Espera a que monten cualquier overlay/candidato manteniendo el dragover vivo
    //    (como un usuario con el archivo sostenido sobre la pagina).
    var zone = null;
    var start = Date.now();
    var hold = setInterval(function () { go(window, 'dragover'); go(document.body, 'dragover'); }, 250);
    while (Date.now() - start < 12000) {
      var sel = igDropTargetCandidates().join(',');
      zone = document.querySelector(sel);
      if (!zone) {
        var mid = document.elementFromPoint(cx, cy);
        if (mid && mid !== document.body && mid !== document.documentElement) zone = mid;
      }
      if (zone) { snap(zone); break; }
      await new Promise(function (r) { setTimeout(r, 300); });
    }
    clearInterval(hold);

    if (!zone) {
      diag.push('sin candidatos detectados; se tomo el elemento central por defecto.');
      var fell = document.elementFromPoint(cx, cy);
      if (fell && fell !== document.body && fell !== document.documentElement) { zone = fell; snap(zone); }
    }

    // 3) Soltar sobre el candidato central elegido (es el equivalente a soltar en el centro).
    if (zone) {
      go(zone, 'dragenter');
      go(zone, 'dragover');
      go(zone, 'drop');
      used = 'drop-' + zone.tagName;
    }
    // 4) Retry amplio: todos los dropable + window + body.
    document.querySelectorAll(igDropTargetCandidates().join(',')).forEach(function (cand) {
      try {
        go(cand, 'dragenter');
        go(cand, 'dragover');
        go(cand, 'drop');
        if (!used) used = 'drop-' + cand.tagName;
      } catch (e) { /* ignorar */ }
    });
    go(window, 'dragenter');
    go(window, 'dragover');
    go(window, 'drop');
    go(document.body, 'drop');

    diag.forEach(function (l) { console.log('[IMG-GEN]', l); });
    if (used) console.log('[IMG-GEN] result: drop intentado sobre ->', used);

    // 5) Fallback input[type=file].
    var inp = document.querySelector('input[type="file"][accept*="image"], [data-test-id*="file"] input[type="file"]');
    if (inp) {
      try {
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        used = used || 'input-file';
      } catch (e) {
        console.warn('[IMG-GEN] fallback input file fallo:', e.message);
      }
    }
    showTessToast(used
      ? (used === 'input-file' ? 'Subido via input file. Revisa que la imagen entro.' : 'Imagen soltada en ' + (zone ? zone.tagName + '/' + (zone.id || zone.className || '?') : 'la pantalla') + '. Revisa que se subio.')
      : 'No encuentro el area de subida. Arrastrala tu hacia el centro de la pantalla.', used ? 'success' : 'warning');
  } catch (err) {
    showTessToast('Error subiendo la imagen: ' + ((err && err.message) || err), 'error');
  }
}

async function igUpload() {
  if (!igState.lastBase64) {
    showTessToast('Primero genera una imagen', 'warning');
    return;
  }
  if (!igClickManageMedia()) return;
  showTessToast('Navegando a Manage Media y subiendo imagen...', 'warning');
  await igDropFileIntoTalky(igState.lastBase64, igState.lastFormat);
}

function igClearGen() {
  igState.lastBase64 = null;
  igState.lastFormat = 'png';
  igState.lastPrompt = '';
  igState.images = [];
  igState.activeIdx = -1;
  var prev = _igEl('igPreview');
  if (prev) prev.style.display = 'none';
  var img = _igEl('igPreviewImg');
  if (img) img.removeAttribute('src');
  var tag = _igEl('igModelTag');
  if (tag) tag.textContent = '';
  igRenderGallery();
  igSetStatus('', '');
  showTessToast('Imagen(es) eliminada(s) del panel (los archivos en Descargas siguen ahi).', 'success');
}

function mountImgGenTab() {
  var host = document.getElementById('tabImgGen');
  if (!host) return false;
  if (host.querySelector('#igWrap')) return true;

  var style = document.createElement('style');
  style.textContent = `
#igWrap{display:block;}
#igWrap *{box-sizing:border-box;}
#igWrap .ig-sec{margin-bottom:10px;padding:9px;background:rgba(8,10,16,0.85);border:1px solid #22d3ee;border-radius:8px;}
#igWrap .ig-sec h4{font-size:9px;letter-spacing:1px;margin:0 0 6px 0;color:#e0e0e0;text-transform:uppercase;}
#igWrap .ig-sec textarea{width:100%;padding:6px;background:#000;border:1px solid #22d3ee;border-radius:4px;color:#e0e0e0;font-family:Arial;font-size:12px;box-sizing:border-box;height:60px;resize:vertical;}
#igWrap .ig-sec textarea:focus{outline:none;border-color:#06b6d4;}
#igWrap .ig-refdrop{border:1px dashed #22d3ee;border-radius:6px;padding:10px;text-align:center;font-size:10px;color:#67e8f9;cursor:pointer;background:rgba(8,10,16,0.8);}
#igWrap .ig-refdrop:hover{background:rgba(6,182,212,0.15);}
#igWrap .ig-thumbs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
#igWrap .ig-count{font-size:9px;color:#888;margin-top:6px;}
#igWrap .ig-row{display:flex;align-items:center;gap:8px;margin-top:8px;}
#igWrap .ig-row select{flex:1;background:#000;color:#e0e0e0;border:1px solid #22d3ee;border-radius:4px;font-size:10px;padding:4px;}
#igWrap .ig-gen-btn{width:100%;margin-top:10px;padding:10px;border:1px solid #06b6d4;border-radius:6px;background:linear-gradient(135deg,#0891b2,#06b6d4);color:#fff;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:1px;transition:all .3s;}
#igWrap .ig-gen-btn:hover:not(:disabled){background:#0e7490;box-shadow:0 0 12px rgba(6,182,212,0.7);}
#igWrap .ig-gen-btn:disabled{opacity:.5;cursor:not-allowed;}
#igWrap .ig-status{font-size:10px;color:#22d3ee;min-height:14px;margin-top:8px;}
#igWrap .ig-preview{display:none;margin-top:10px;}
#igWrap .ig-preview img{max-width:100%;max-height:200px;border-radius:8px;border:1px solid #22d3ee;display:block;margin:0 auto;}
#igWrap .ig-model{font-size:8px;color:#888;margin-top:4px;word-break:break-all;text-align:center;}
#igWrap .ig-pbtns{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}
#igWrap .ig-pbtns button{flex:1;min-width:68px;padding:8px;border-radius:6px;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;transition:all .3s;border:1px solid #22d3ee;background:rgba(8,10,16,0.85);color:#e0e0e0;}
#igWrap .ig-pbtns button:hover{background:#0e7490;color:#fff;}
#igWrap .ig-pbtns button.ig-upload{background:#14532d;border-color:#22c55e;}
#igWrap .ig-pbtns button.ig-upload:hover{background:#15803d;}
#igWrap .ig-pbtns button.ig-del{background:rgba(220,38,38,0.25);border-color:#ef4444;color:#fecaca;}
#igWrap .ig-pbtns button.ig-del:hover{background:#b91c1c;color:#fff;}
#igWrap .ig-qrow{display:flex;align-items:center;gap:8px;margin-top:6px;}
#igWrap #igQuantity{flex:1;background:#000;color:#e0e0e0;border:1px solid #22d3ee;border-radius:4px;font-size:10px;padding:4px;}
#igWrap .ig-gallery{display:none;flex-wrap:wrap;gap:6px;margin-top:10px;padding-top:8px;border-top:1px dashed #155e75;}
#igWrap .ig-glabel{font-size:8px;letter-spacing:1px;color:#67e8f9;margin-top:8px;text-transform:uppercase;}`;
  document.head.appendChild(style);

  var wrap = document.createElement('div');
  wrap.id = 'igWrap';
  wrap.innerHTML = `
  <div class="ig-sec">
    <h4>PROMPT</h4>
    <textarea id="igPrompt" placeholder="Describe la imagen que quieres generar..."></textarea>
    <div class="ig-qrow">
      <label style="font-size:9px;color:#888;white-space:nowrap;">¿Cuántas imágenes?</label>
      <select id="igQuantity" title="Genera varias versiones con el mismo prompt (el proveedor acepta 1 imagen por llamada, se generan de a una)">
        <option value="1">1 imagen</option>
        <option value="3">3 imágenes</option>
        <option value="5">5 imágenes</option>
        <option value="10" selected>10 imágenes</option>
      </select>
    </div>
  </div>
  <div class="ig-sec">
    <h4>REFERENCIAS (opcional)</h4>
    <div class="ig-refdrop" id="igRefDrop">Haz click (abrira tu carpeta Descargas) o arrastra aqui referencias (max 8)</div>
    <input type="file" id="igRefInput" accept="image/*" multiple style="display:none;">
    <div class="ig-thumbs" id="igRefThumbs"></div>
    <div class="ig-count" id="igRefCount">Sin referencias</div>
  </div>
  <div class="ig-sec">
    <h4>MODELO / RESOLUCION</h4>
    <div class="ig-row">
      <select id="igPreset">
        <option value="1">Nano Banana Pro (calidad, por defecto)</option>
        <option value="2">Nano Banana 2 Lite (rapido y barato)</option>
      </select>
    </div>
    <div class="ig-count">Resolucion cuadrada por defecto (Pro ~1024px, Lite ~512px)</div>
  </div>
  <button class="ig-gen-btn" id="igGenBtn">GENERAR IMAGEN</button>
  <div class="ig-status" id="igStatus"></div>
  <div class="ig-preview" id="igPreview">
    <img id="igPreviewImg" alt="Imagen generada">
    <div class="ig-model" id="igModelTag"></div>
    <div class="ig-glabel" id="igGalleryLabel">TODAS LAS GENERADAS (click para seleccionar)</div>
    <div class="ig-gallery" id="igGallery"></div>
    <div class="ig-pbtns">
      <button class="ig-upload" id="igUploadBtn">UPLOAD</button>
      <button id="igFixBtn">CORREGIR</button>
      <button id="igSaveBtn">GUARDAR</button>
      <button class="ig-del" id="igDelBtn">ELIMINAR</button>
    </div>
  </div>`;
  host.appendChild(wrap);

  _igEl('igGenBtn').addEventListener('click', igGenerate);
  _igEl('igUploadBtn').addEventListener('click', igUpload);
  _igEl('igDelBtn').addEventListener('click', igClearGen);
  _igEl('igSaveBtn').addEventListener('click', async function () {
    if (!igState.lastBase64) return showTessToast('Primero genera una imagen', 'warning');
    if (await igSaveToDownloads(igState.lastBase64, igState.lastFormat)) {
      igSetStatus('Imagen guardada automaticamente en Descargas.', 'ok');
      showTessToast('Imagen guardada en Descargas', 'success');
    } else {
      showTessToast('No se pudo iniciar la descarga.', 'error');
    }
  });
  _igEl('igFixBtn').addEventListener('click', function () {
    if (!igState.lastBase64) return showTessToast('Primero genera una imagen', 'warning');
    var mime = igMimeFor(igState.lastFormat);
    if (igState.refs.length < 8) igState.refs.push({ name: 'generada-' + Date.now(), dataUrl: 'data:' + mime + ';base64,' + igState.lastBase64 });
    igRenderRefs();
    if (igState.lastPrompt) _igEl('igPrompt').value = igState.lastPrompt;
    _igEl('igPrompt').focus();
    igSetStatus('Escribe que corregir en el prompt y pulsa GENERAR (usa la imagen actual como base).', '');
    showTessToast('Modo correccion: edita el prompt y regenera.', 'warning');
  });

  _igEl('igRefDrop').addEventListener('click', igPickRefs);
  _igEl('igRefInput').addEventListener('change', function () { igAddRefFiles(this.files); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) {
    _igEl('igRefDrop').addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); });
  });
  _igEl('igRefDrop').addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files) igAddRefFiles(e.dataTransfer.files);
  });

  console.log('[IMG-GEN] ✅ Pestana IMG GEN montada (bot panel)');
  return true;
}

function initImgGen1() {
  try {
    mountImgGenTab();
  } catch (e) {
    console.error('[IMG-GEN] init error:', e.message);
  }
}

if (!window.__igGen1Ready) {
  window.__igGen1Ready = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initImgGen1(); });
  } else {
    setTimeout(initImgGen1, 400);
  }
}