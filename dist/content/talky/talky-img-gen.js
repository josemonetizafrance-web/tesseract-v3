// TESSERACT v24.1 - IMG GEN 1 (Generador de imagenes IA para Manage Media)
// Flujo: prompt + referencias -> generar (Pro por defecto / Lite opcional) -> auto-guardar en Downloads
// -> boton UPLOAD navega a Manage Media y suelta la imagen en el drop zone para que se suba sola.

var IG_API = (typeof Tesseract !== 'undefined' && Tesseract && Tesseract.API) || window.TESSERACT_API || 'https://tesseract-v3-production.up.railway.app';

var igState = {
  refs: [],
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
  st.style.color = kind === 'ok' ? '#4ade80' : kind === 'err' ? '#f87171' : '#a78bfa';
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
    t.style.cssText = 'position:relative;width:56px;height:56px;border-radius:6px;overflow:hidden;border:1px solid #8b5cf6;flex-shrink:0;background:#000;';
    var img = document.createElement('img');
    img.src = r.dataUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    var x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Quitar referencia';
    x.style.cssText = 'position:absolute;top:0;right:0;width:18px;height:18px;background:rgba(0,0,0,0.75);color:#fff;border:none;cursor:pointer;font-size:12px;line-height:1;padding:0;';
    x.addEventListener('click', function () {
      igState.refs.splice(i, 1);
      igRenderRefs();
    });
    t.appendChild(img);
    t.appendChild(x);
    wrap.appendChild(t);
  });
  _igEl('igRefCount').textContent = igState.refs.length ? igState.refs.length + ' ref' + (igState.refs.length > 1 ? 's' : '') : 'Sin referencias';
}

function igAddRefFiles(files) {
  Array.prototype.forEach.call(files, function (f) {
    if (!/^image\//i.test(f.type)) return;
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
      showTessToast('No se pudo leer la imagen: ' + f.name, 'error');
    });
  });
}

function igSaveToDownloads(b64, fmt) {
  try {
    var mime = igMimeFor(fmt);
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var blob = new Blob([u8], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tesseract-gen-' + Date.now() + '.' + (fmt === 'svg' ? 'svg' : fmt === 'jpeg' ? 'jpg' : fmt);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
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

  igSetBusy(true);
  igSetStatus('Generando imagen...', '');
  showTessToast('Generando imagen, esto puede tardar 30-90s...', 'warning');

  var preset = (_igEl('igPreset') && _igEl('igPreset').value) || '1';
  var refs = igState.refs.map(function (r) { return r.dataUrl; });
  var body = { prompt: prompt, preset: preset };
  if (refs.length) body.references = refs;

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
      var msg = (json && json.error) || ('Error HTTP ' + resp.status);
      if (/401/i.test(String(resp.status))) msg = 'Sesion expirada. Vuelve a iniciar sesion.';
      igSetStatus(msg, 'err');
      showTessToast(msg, 'error');
      return;
    }
    if (!json.base64) {
      igSetStatus('El servidor no devolvio imagen', 'err');
      return;
    }
    igState.lastBase64 = json.base64;
    igState.lastFormat = json.format || 'png';
    igState.lastPrompt = prompt;

    var imgEl = _igEl('igPreviewImg');
    imgEl.src = 'data:' + igMimeFor(igState.lastFormat) + ';base64,' + igState.lastBase64;
    imgEl.title = 'Generada con ' + (json.model || 'IA') + ' (' + (preset === '2' ? 'Lite' : 'Pro') + ')';
    _igEl('igPreview').style.display = 'block';
    _igEl('igModelTag').textContent = (json.model || '') + (preset === '2' ? '  [LITE]' : '  [PRO]');

    var saved = igSaveToDownloads(igState.lastBase64, igState.lastFormat);
    igSetStatus(saved ? 'Imagen generada y guardada en Descargas. UPLOAD para subirla a Manage Media.' : 'Imagen generada.', 'ok');
    if (saved) showTessToast('Imagen guardada en Descargas', 'success');
    else showTessToast('Generada. Usa GUARDAR si la descarga no inicio.', 'warning');
  } catch (err) {
    clearTimeout(tmr);
    var m = (err && err.name === 'AbortError') ? 'Tiempo de espera agotado (180s). Reintenta.' : ((err && err.message) || String(err));
    if (/Failed to fetch|NetworkError/i.test(m)) m = 'Sin conexion o servidor no disponible.';
    igSetStatus(m, 'err');
    showTessToast(m, 'error');
  } finally {
    clearTimeout(tmr);
    igSetBusy(false);
  }
}

function igClickManageMedia() {
  var sel = 'a[data-test-id*="item-navigation-to Manage_Media"], [data-test-id*="item-navigation-to Manage_Media"], #Manage_Media';
  var el = document.querySelector(sel);
  if (!el) {
    document.querySelectorAll('a, [role="tab"], [role="menuitem"], button').forEach(function (c) {
      if ((c.textContent || '').trim().toLowerCase() === 'manage media' && !el) el = c;
    });
  }
  if (!el) {
    showTessToast('No encontre "Manage Media" en esta pagina. Abrelo tu y reintenta UPLOAD.', 'warning');
    return false;
  }
  el.click();
  return true;
}

function igWaitForDropZone(timeoutMs) {
  return new Promise(function (resolve) {
    var start = Date.now();
    (function poll() {
      var z = document.querySelector('[data-test-id*="file:drop-zone"]');
      if (z) return resolve(z);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(poll, 500);
    })();
  });
}

async function igDropFileIntoTalky(b64, fmt) {
  try {
    var mime = igMimeFor(fmt);
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var file = new File([u8], 'tesseract-gen-' + Date.now() + '.png', { type: mime });
    var dt = new DataTransfer();
    dt.items.add(file);

    var zone = await igWaitForDropZone(15000);
    if (zone) {
      try {
        zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
        zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      } catch (e) {
        console.warn('[IMG-GEN] synthetic drop fallo, intento input file:', e.message);
      }
    }
    // Fallback: input[type=file] dentro del area de media
    var inp = zone ? zone.querySelector('input[type="file"]') : document.querySelector('[data-test-id*="file:"] input[type="file"], input[type="file"][accept*="image"]');
    if (inp) {
      try {
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        console.warn('[IMG-GEN] fallback input file fallo:', e.message);
      }
    }
    showTessToast(zone ? 'Imagen soltada en Manage Media. Revisa que se subio.' : 'No encontre el area de subida. Sueltala tu manualmente.', zone ? 'success' : 'warning');
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
  _igEl('igPreview').style.display = 'none';
  _igEl('igPreviewImg').removeAttribute('src');
  _igEl('igModelTag').textContent = '';
  igSetStatus('', '');
  showTessToast('Imagen eliminada del panel (el archivo en Descargas sigue ahi).', 'success');
}

function createImgGen1UI() {
  if (document.getElementById('tessImgGen1Panel')) return;

  var style = document.createElement('style');
  style.textContent = `
#ig1Fab{position:fixed;right:24px;bottom:120px;z-index:9999990;background:linear-gradient(135deg,#1e1b4b,#8b5cf6);border:1px solid #a78bfa;color:#fff;font-family:'Orbitron','Segoe UI',sans-serif;font-size:10px;letter-spacing:1px;padding:9px 12px;border-radius:8px;cursor:pointer;box-shadow:0 0 16px rgba(139,92,246,0.55);transition:transform .15s;}
#ig1Fab:hover{transform:scale(1.06);}
#tessImgGen1Panel{position:fixed;left:auto;right:24px;bottom:180px;width:340px;max-height:70vh;display:none;z-index:9999999;background:#0a0a0a;border:2px solid #8b5cf6;border-radius:12px;box-shadow:0 0 40px rgba(139,92,246,0.5);color:#e0e0e0;font-family:'Segoe UI',sans-serif;overflow:hidden;flex-direction:column;}
.tess-resize{position:absolute;width:14px;height:14px;z-index:30;}
.tess-resize.se{right:0;bottom:0;cursor:se-resize;}
.tess-resize.sw{left:0;bottom:0;cursor:sw-resize;}
.ig-hdr{background:linear-gradient(135deg,#1e1b4b,#8b5cf6,#1e1b4b);padding:10px 14px;font-weight:bold;letter-spacing:2px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #8b5cf6;color:#e0e0e0;font-size:12px;cursor:move;}
.ig-hdr span{cursor:pointer;font-size:16px;}
.ig-body{padding:12px;overflow-y:auto;}
.ig-body::-webkit-scrollbar{width:4px;} .ig-body::-webkit-scrollbar-track{background:#0a0a0a;} .ig-body::-webkit-scrollbar-thumb{background:#8b5cf6;border-radius:2px;}
.ig-sec{margin-bottom:10px;padding:9px;background:rgba(30,27,75,0.3);border:1px solid rgba(139,92,246,0.2);border-radius:8px;}
.ig-sec h4{font-size:9px;letter-spacing:1px;margin:0 0 6px 0;color:#e0e0e0;text-transform:uppercase;}
.ig-sec textarea{width:100%;padding:6px;background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-family:Arial;font-size:12px;box-sizing:border-box;height:64px;resize:vertical;}
.ig-sec textarea:focus{outline:none;border-color:#7c3aed;}
.ig-refdrop{border:1px dashed #8b5cf6;border-radius:6px;padding:10px;text-align:center;font-size:10px;color:#a78bfa;cursor:pointer;background:rgba(30,27,75,0.2);}
.ig-refdrop:hover{background:rgba(30,27,75,0.5);}
.ig-thumbs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.ig-count{font-size:9px;color:#888;margin-top:6px;}
.ig-row{display:flex;align-items:center;gap:8px;margin-top:8px;}
.ig-row select{flex:1;background:#000;color:#e0e0e0;border:1px solid #8b5cf6;border-radius:4px;font-size:10px;padding:4px;}
.ig-gen-btn{width:100%;margin-top:10px;padding:10px;border:1px solid #8b5cf6;border-radius:6px;background:linear-gradient(135deg,#7c3aed,#8b5cf6);color:#fff;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:1px;transition:all .3s;}
.ig-gen-btn:hover:not(:disabled){background:#6d28d9;box-shadow:0 0 12px rgba(139,92,246,0.7);}
.ig-gen-btn:disabled{opacity:.5;cursor:not-allowed;}
.ig-status{font-size:10px;color:#a78bfa;min-height:14px;margin-top:8px;}
.ig-preview{display:none;margin-top:10px;}
.ig-preview img{max-width:100%;max-height:220px;border-radius:8px;border:1px solid #8b5cf6;display:block;}
.ig-model{font-size:8px;color:#888;margin-top:4px;word-break:break-all;}
.ig-pbtns{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}
.ig-pbtns button{flex:1;min-width:70px;padding:8px;border-radius:6px;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;transition:all .3s;border:1px solid #8b5cf6;background:rgba(30,27,75,0.7);color:#e0e0e0;}
.ig-pbtns button:hover{background:#7c3aed;color:#fff;}
.ig-pbtns button.ig-upload{background:#166534;border-color:#22c55e;}
.ig-pbtns button.ig-upload:hover{background:#15803d;}
.ig-pbtns button.ig-del{background:rgba(220,38,38,0.25);border-color:#ef4444;color:#fecaca;}
.ig-pbtns button.ig-del:hover{background:#b91c1c;color:#fff;}`;
  document.head.appendChild(style);

  var fab = document.createElement('button');
  fab.id = 'ig1Fab';
  fab.textContent = 'IMG GEN 1';
  fab.title = 'Generar imagenes con IA y subirlas a Manage Media';
  document.body.appendChild(fab);

  var p = document.createElement('div');
  p.id = 'tessImgGen1Panel';
  p.innerHTML = `
  <div class="ig-hdr"><span>IMG GEN 1</span><span id="igClose">&times;</span></div>
  <div class="ig-body">
    <div class="ig-sec">
      <h4>PROMPT</h4>
      <textarea id="igPrompt" placeholder="Describe la imagen que quieres generar..."></textarea>
    </div>
    <div class="ig-sec">
      <h4>REFERENCIAS (opcional)</h4>
      <div class="ig-refdrop" id="igRefDrop">Haz click o arrastra aqui imagenes de referencia (max 8)</div>
      <input type="file" id="igRefInput" accept="image/*" multiple style="display:none;">
      <div class="ig-thumbs" id="igRefThumbs"></div>
      <div class="ig-count" id="igRefCount">Sin referencias</div>
    </div>
    <div class="ig-sec">
      <h4>MODELO</h4>
      <div class="ig-row">
        <select id="igPreset">
          <option value="1">Nano Banana Pro (calidad, por defecto)</option>
          <option value="2">Nano Banana 2 Lite (rapido y barato)</option>
        </select>
      </div>
    </div>
    <button class="ig-gen-btn" id="igGenBtn">GENERAR IMAGEN</button>
    <div class="ig-status" id="igStatus"></div>
    <div class="ig-preview" id="igPreview">
      <img id="igPreviewImg" alt="Imagen generada">
      <div class="ig-model" id="igModelTag"></div>
      <div class="ig-pbtns">
        <button class="ig-upload" id="igUploadBtn">UPLOAD</button>
        <button id="igFixBtn">CORREGIR</button>
        <button id="igSaveBtn">GUARDAR</button>
        <button class="ig-del" id="igDelBtn">ELIMINAR</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(p);
  makeDraggable('tessImgGen1Panel', '.ig-hdr');

  var respawn = document.createElement('div'); respawn.className = 'tess-resize se'; p.appendChild(respawn);

  fab.addEventListener('click', function () {
    var show = p.style.display === 'none' || !p.style.display;
    p.style.display = show ? 'flex' : 'none';
    if (show) { try { _igEl('igPrompt').focus(); } catch (e) {} }
  });
  _igEl('igClose').addEventListener('click', function () { p.style.display = 'none'; });

  _igEl('igGenBtn').addEventListener('click', igGenerate);
  _igEl('igUploadBtn').addEventListener('click', igUpload);
  _igEl('igDelBtn').addEventListener('click', igClearGen);
  _igEl('igSaveBtn').addEventListener('click', function () {
    if (!igState.lastBase64) return showTessToast('Primero genera una imagen', 'warning');
    igSaveToDownloads(igState.lastBase64, igState.lastFormat);
    showTessToast('Imagen guardada en Descargas', 'success');
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

  _igEl('igRefDrop').addEventListener('click', function () { _igEl('igRefInput').click(); });
  _igEl('igRefInput').addEventListener('change', function () { igAddRefFiles(this.files); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) {
    _igEl('igRefDrop').addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); });
  });
  _igEl('igRefDrop').addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files) igAddRefFiles(e.dataTransfer.files);
  });
}

function initImgGen1() {
  try {
    createImgGen1UI();
    console.log('[IMG-GEN] ✅ IMG GEN 1 listo');
  } catch (e) {
    console.error('[IMG-GEN] init error:', e.message);
  }
}

if (window.__igGen1Ready) {
} else {
  window.__igGen1Ready = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initImgGen1(); });
  } else {
    setTimeout(initImgGen1, 500);
  }
}