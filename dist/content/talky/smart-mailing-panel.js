function showMLSavedFeedback() {
  const btn = document.getElementById('mlSaveBtn');
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'GUARDADO';
    btn.style.background = '#4CAF50';
    btn.style.borderColor = '#4CAF50';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 2000);
  }
}

function createMailingPanel() {
  if (document.getElementById('mailingModal')) return;

  const m = document.createElement('div');
  m.id = 'mailingModal';
  m.innerHTML = `
<style>
#mailingModal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999999;display:none;width:460px;max-height:90vh;background:#0a0a0a;border:2px solid #8b5cf6;border-radius:12px;box-shadow:0 0 40px rgba(139,92,246,0.5);color:#e0e0e0;font-family:'Orbitron','Segoe UI',sans-serif;overflow:hidden;display:flex;flex-direction:column;}
.ml-hdr{background:linear-gradient(135deg,#1e1b4b,#8b5cf6,#1e1b4b);padding:12px 16px;font-weight:bold;letter-spacing:2px;display:flex;justify-content:space-between;border-bottom:2px solid #8b5cf6;color:#e0e0e0;font-size:13px;cursor:default;}
.ml-hdr span{cursor:pointer;font-size:18px;}
.ml-body{padding:16px;overflow-y:auto;flex:1;}
.ml-body::-webkit-scrollbar{width:4px;}
.ml-body::-webkit-scrollbar-track{background:#0a0a0a;}
.ml-body::-webkit-scrollbar-thumb{background:#8b5cf6;border-radius:2px;}
.ml-section{margin-bottom:12px;padding:10px;background:rgba(30,27,75,0.3);border:1px solid rgba(139,92,246,0.2);border-radius:8px;}
.ml-section h4{font-size:10px;letter-spacing:1px;margin:0 0 8px 0;color:#e0e0e0;text-transform:uppercase;}
.ml-section label{display:flex;align-items:center;gap:8px;font-size:11px;color:#ccc;margin:6px 0;cursor:pointer;}
.ml-section input[type="checkbox"]{accent-color:#8b5cf6;width:16px;height:16px;cursor:pointer;}
.ml-section textarea{width:100%;padding:6px;background:#000;border:1px solid #8b5cf6;border-radius:4px;color:#e0e0e0;font-family:Arial;font-size:12px;box-sizing:border-box;height:90px;resize:vertical;}
.ml-section textarea:focus{outline:none;border-color:#7c3aed;}
.ml-hint{font-size:8px;color:#666;margin-top:6px;}
.ml-foot{padding:12px;border-top:1px solid #8b5cf6;text-align:right;display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.3);}
.ml-foot .ml-status{font-size:9px;letter-spacing:1px;}
.ml-foot .ml-status .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;}
.ml-foot .ml-status .dot.on{background:#4CAF50;box-shadow:0 0 8px #4CAF50;}
.ml-foot .ml-status .dot.off{background:#666;}
.ml-foot button{padding:8px 16px;border:1px solid #8b5cf6;border-radius:6px;background:rgba(30,27,75,0.7);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;margin-left:6px;transition:all 0.3s;}
.ml-foot button:hover{background:#7c3aed;color:#fff;}
.ml-foot button.primary{background:#8b5cf6;color:#000;}
.ml-foot button.primary:hover{background:#7c3aed;color:#fff;}
.ml-error{color:#dc2626;font-size:9px;margin:4px 0;padding:6px 10px;background:rgba(220,38,38,0.1);border:1px solid #dc2626;border-radius:4px;display:none;}
</style>
<div class="ml-box">
<div class="ml-hdr"><span>SMART MAILING</span><span id="mlCloseBtn">&times;</span></div>
<div class="ml-body">

  <div class="ml-section">
    <h4>MULTIMAILING</h4>
    <label><input type="checkbox" id="mlEnabledToggle"> Activar Multimailing</label>
  </div>

  <div class="ml-section">
    <h4>PLANTILLA DE CARTA</h4>
    <textarea id="mlTemplateNew" placeholder="Escribe la carta que se enviara a los contactos...">Hola! Vi tu perfil y me pareciste interesante. ¿Te gustaría conversar?</textarea>
    <div class="ml-hint">Esta carta se enviara a todos los contactos del barrido.</div>
  </div>

  <div class="ml-section">
    <h4>MODO DE ENVIO</h4>
    <label><input type="checkbox" id="mlSendOnlyOver4"> Solo enviar a contactos con MÁS DE 4 cartas</label>
    <div class="ml-hint">Al activarlo, el barrido envia cartas unicamente a personas cuyo contador de cartas totales sea mayor a 4, saltando a quienes tengan 4 o menos.</div>
  </div>

  <div id="mlErrorMsg" class="ml-error"></div>
</div>
<div class="ml-foot">
  <div class="ml-status"><span class="dot off" id="mlStatusDot"></span><span id="mlStatusText">INACTIVO</span></div>
  <div>
    <button id="mlSaveBtn" class="primary">GUARDAR</button>
    <button id="mlCloseBtn2">CERRAR</button>
  </div>
</div>
</div>`;
  document.body.appendChild(m);

  document.getElementById('mlCloseBtn').addEventListener('click', () => mlModal(false));
  document.getElementById('mlCloseBtn2').addEventListener('click', () => mlModal(false));
  document.getElementById('mlSaveBtn').addEventListener('click', saveMLPanelConfigWrapper);
}

function mlModal(show) {
  const el = document.getElementById('mailingModal');
  if (el) el.style.display = show ? 'block' : 'none';
}

let mlCfgCache = null;

async function openMLPanel() {
  createMailingPanel();
  mlModal(true);
  mlCfgCache = await _loadMLCfg();
  populateMLPanel();
}

async function _loadMLCfg() {
  try {
    if (typeof window._getMailingConfigDirect === 'function') {
      const cfg = window._getMailingConfigDirect();
      if (cfg) return cfg;
    }
    if (typeof window._loadMailingConfigDirect === 'function') {
      await window._loadMailingConfigDirect();
      return window._getMailingConfigDirect ? window._getMailingConfigDirect() : null;
    }
    const r = await chrome.storage.local.get(['tess_mailing_config']);
    return r.tess_mailing_config || null;
  } catch (e) { return null; }
}

function populateMLPanel() {
  const cfg = mlCfgCache || getDefaultMailingConfig();

  document.getElementById('mlEnabledToggle').checked = !!cfg.enabled;
  document.getElementById('mlTemplateNew').value = cfg.templatesNew || cfg.messageTemplate || '';
  document.getElementById('mlSendOnlyOver4').checked = !!cfg.sendOnlyOver4Letters;

  updateMLStatusBar(cfg.enabled);
}

async function saveMLPanelConfigWrapper() {
  const errEl = document.getElementById('mlErrorMsg');
  errEl.style.display = 'none';
  try {
    const cfg = mlCfgCache || {};
    cfg.enabled = !!document.getElementById('mlEnabledToggle').checked;
    cfg.templatesNew = document.getElementById('mlTemplateNew').value;
    cfg.messageTemplate = document.getElementById('mlTemplateNew').value;
    cfg.sendOnlyOver4Letters = !!document.getElementById('mlSendOnlyOver4').checked;

    if (typeof window._getMailingConfigDirect === 'function') {
      Object.assign(window._getMailingConfigDirect(), cfg);
    }

    if (typeof window._saveMailingConfigDirect === 'function') {
      mlCfgCache = cfg;
      await window._saveMailingConfigDirect();
    } else {
      await chrome.storage.local.set({ tess_mailing_config: cfg });
    }

    if (typeof window._tessServerSync !== 'undefined') window._tessServerSync.config('tess_mailing_config', cfg);
    showMLSavedFeedback();
    updateMLStatusBar(cfg.enabled);
  } catch (e) {
    errEl.textContent = 'Error: ' + (e.message || 'desconocido');
    errEl.style.display = 'block';
  }
}

function getDefaultMailingConfig() {
  return {
    enabled: false,
    maxDaily: 30,
    sentToday: 0,
    messageTemplate: 'Hola! Vi tu perfil y me pareciste interesante. ¿Te gustaría conversar?',
    respectQuietHours: true,
    workingHours: { start: 8, end: 22 },
    delay: { min: 3000, max: 7000 },
    skipPinned: true,
    scheduleEnabled: false,
    scheduleStartDate: '',
    scheduleFrequency: 'daily',
    scheduleCycles: 30,
    scheduleRemaining: 30,
    templatesNew: 'Hola! Vi tu perfil y me pareciste interesante. ¿Te gustaría conversar?',
    blockActiveDialogue: true,
    activeDialogueHours: 48,
    sendOnlyOver4Letters: false
  };
}

function updateMLStatusBar(enabled) {
  const dot = document.getElementById('mlStatusDot');
  const text = document.getElementById('mlStatusText');
  if (dot) dot.className = 'dot ' + (enabled ? 'on' : 'off');
  if (text) text.textContent = enabled ? 'ACTIVO' : 'INACTIVO';
}
