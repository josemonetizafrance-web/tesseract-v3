// TESSERACT v24.0 - Panel UI + Eventos + Auth + Init (extraído de talky-bot-panel.js)

// ============ FUNCIÓN CENTRAL: Registrar ID en Star Tools ============
function registerIdInStarTools(id, category) {
  if (!id || !/^\d{6,15}$/.test(String(id).trim())) return false;
  id = String(id).trim();
  if (!collectedIds[category]) collectedIds[category] = [];
  if (collectedIds[category].includes(id)) return false;
  
  collectedIds[category].push(id);
  console.log('[STAR-TOOLS] ✅ ID registrado en ' + category + ':', id, '| Total ' + category + ':', collectedIds[category].length);
  
  if (currentTab === 'star') {
    renderStarIds();
  }
  updateStats();
  saveAllStates();
  return true;
}

// ============ INICIALIZACIÓN ============
async function initTesseract() {
  if (window.__tessInitialized) return;
  window.__tessInitialized = true;
  try {
    console.log('[TESSERACT] 🚀 Inicializando sistema...');
  } catch (e) {
    console.error('[TESSERACT] Error en log inicial:', e);
  }

  // Crear panel PRIMERO (fuera de try para garantizar que siempre se ejecute)
  try {
    createMainPanel();
    createCartasModal();
    setupAllEvents();
    loadAllStates();
    initAuthFromStorage();
    if (typeof startChatWatcher === 'function') startChatWatcher();
    if (typeof startBackgroundIdCapture === 'function') startBackgroundIdCapture();
    if (typeof startProfileWatcher === 'function') startProfileWatcher();
    if (typeof createCribsOverlay === 'function') createCribsOverlay();
  } catch (e) {
    console.error('[TESSERACT] ❌ Error creando panel:', e);
  }

  // Inicializar módulos v24 (pueden fallar sin afectar el panel)
  // Auto-Answer deshabilitado por decision de producto
  try {
    if (typeof window._openSPPanel === 'function') await window._openSPPanel();
  } catch (e) {
    console.error('[TESSERACT] ⚠️ Saludo Push init falló:', e.message);
  }
  try {
    if (typeof initSmartMailing === 'function') await initSmartMailing();
  } catch (e) {
    console.error('[TESSERACT] ⚠️ initSmartMailing fallo:', e.message);
  }

  // Recargar blacklists despues de init
  if (typeof reloadMLBlacklist === 'function') reloadMLBlacklist();
  if (typeof loadAABlacklist === 'function') loadAABlacklist();
  if (typeof reloadLFPBlacklist === 'function') reloadLFPBlacklist();

  // Inicializar Mail CRIBS
  try {
    if (typeof window._initMailCribs === 'function') await window._initMailCribs();
  } catch (e) {
    console.error('[TESSERACT] ⚠️ initMailCribs falló:', e.message);
  }
  if (typeof updateMailCribsUI === 'function') updateMailCribsUI();

  // Verificar que storage funciona
  try {
    chrome.storage.local.set({ tess_heartbeat: Date.now() }, () => {
      if (chrome.runtime.lastError) {
        console.error('[TESSERACT] ❌ Error de storage:', chrome.runtime.lastError);
      } else {
        console.log('[TESSERACT] ✅ Storage OK');
      }
    });
    console.log('[TESSERACT] ✅ Sistema listo - JARVIS activo');
  } catch (e) {
    console.error('[TESSERACT] ❌ Error en storage check:', e);
  }
}

// ============ CAPTURA DE IDs EN SEGUNDO PLANO ============
function startBackgroundIdCapture() {
  console.log('[STAR-TOOLS] 👁️ Captura de IDs en segundo plano iniciada');
  
  // Escanear cada 3 segundos mientras haya barridos activos
  setInterval(() => {
    if (!isAuthenticated) return;
    if (!likesActive && !followsActive) return;
    
    const ids = scanPageForIds();
    
    ids.forEach(id => {
      if (likesActive) registerIdInStarTools(id, 'Like');
      if (followsActive) registerIdInStarTools(id, 'Follow');
    });
  }, 3000);
  
  // Solo capturar IDs si hay barridos activos y cambió la URL
  let lastUrl = location.href;
  setInterval(() => {
    if (!isAuthenticated) return;
    if (!likesActive && !followsActive) return;
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => {
        if (!isAuthenticated) return;
        if (!likesActive && !followsActive) return;
        const ids = scanPageForIds();
        ids.forEach(id => {
          if (likesActive) registerIdInStarTools(id, 'Like');
          if (followsActive) registerIdInStarTools(id, 'Follow');
        });
      }, 1500);
    }
  }, 2000);
}

// ============ PANEL PRINCIPAL HTML (CON PESTAÑAS) ============
function createMainPanel() {
  if (document.getElementById('tesseract-main-panel')) return;
  
  const p = document.createElement('div');
  p.id = 'tesseract-main-panel';
  p.innerHTML = `
<style>
@font-face { font-family: 'Orbitron'; font-style: normal; font-weight: 400; font-display: swap; src: url('https://fonts.gstatic.com/s/orbitron/v32/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1sz.woff2') format('woff2'); }
@font-face { font-family: 'Orbitron'; font-style: normal; font-weight: 700; font-display: swap; src: url('https://fonts.gstatic.com/s/orbitron/v32/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1s77g.woff2') format('woff2'); }
@font-face { font-family: 'Orbitron'; font-style: normal; font-weight: 900; font-display: swap; src: url('https://fonts.gstatic.com/s/orbitron/v32/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1s7_g.woff2') format('woff2'); }
@font-face { font-family: 'Share Tech Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url('https://fonts.gstatic.com/s/sharetechmono/v13/J7aHnp1uDWRyFFd98ABVA9PkkfN9J9aM.woff2') format('woff2'); }
#tesseract-main-panel{position:fixed;bottom:20px;right:20px;z-index:2147483647 !important;font-family:'Orbitron','Segoe UI',sans-serif;display:block !important;visibility:visible !important;font-size:13px;}
#tess-mini-icon{display:none;width:56px;height:56px;background:linear-gradient(135deg,#1e1b4b,#8b5cf6);border-radius:50%;align-items:center;justify-content:center;font-size:28px;color:#fff;position:fixed;bottom:20px;right:20px;cursor:pointer;z-index:2147483647 !important;box-shadow:0 0 20px rgba(139,92,246,0.4);}
#tess-mini-icon:hover{box-shadow:0 0 30px rgba(139,92,246,0.7);}
.tess-box{width:420px;min-width:280px;background:linear-gradient(145deg,#0a0a0a,#1a1a2e);border-radius:16px;border:2px solid #8b5cf6;box-shadow:0 0 40px rgba(139,92,246,0.3),0 10px 40px rgba(0,0,0,0.9);color:#e0e0e0;max-height:720px;overflow-y:auto;position:relative;}
.tess-resize{position:absolute;width:16px;height:16px;z-index:20;}.tess-resize.se{bottom:0;right:0;cursor:se-resize;border-right:3px solid #8b5cf6;border-bottom:3px solid #8b5cf6;border-radius:0 0 6px 0;}.tess-resize.sw{bottom:0;left:0;cursor:sw-resize;border-left:3px solid #8b5cf6;border-bottom:3px solid #8b5cf6;border-radius:0 0 0 6px;}.tess-resize.ne{top:0;right:0;cursor:ne-resize;border-right:3px solid #8b5cf6;border-top:3px solid #8b5cf6;border-radius:0 6px 0 0;}.tess-resize.nw{top:0;left:0;cursor:nw-resize;border-left:3px solid #8b5cf6;border-top:3px solid #8b5cf6;border-radius:6px 0 0 0;}
.tess-header{background:linear-gradient(135deg,#1e1b4b,#8b5cf6,#7c3aed,#8b5cf6,#1e1b4b);padding:14px 18px;display:flex;justify-content:space-between;align-items:center;font-weight:900;font-size:18px;letter-spacing:2px;border-bottom:2px solid #8b5cf6;cursor:move;text-shadow:0 0 10px #8b5cf6;text-transform:uppercase;position:sticky;top:0;z-index:10;}
.tess-header button{background:rgba(0,0,0,0.6);border:1px solid #8b5cf6;color:#8b5cf6;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;margin-left:5px;transition:all 0.3s;}
.tess-header button:hover{background:#7c3aed;color:#fff;box-shadow:0 0 15px #8b5cf6;}
.tess-header button.active-tab{background:#8b5cf6;color:#000;}
#tesseract-main-panel .profile-badge{display:none;padding:4px 14px;background:rgba(15,15,30,0.9);border-bottom:1px solid rgba(139,92,246,0.15);font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:1px;color:#8888a0;align-items:center;gap:10px;position:sticky;top:56px;z-index:9;}
.profile-badge .pb-name{color:#e0e0e0;font-weight:bold;letter-spacing:0.5px;}
.profile-badge .pb-id{color:#8b5cf6;font-size:10px;}

/* PESTAÑAS */
#tesseract-main-panel .tab-nav{display:flex;background:#0a0a0a;border-bottom:2px solid #8b5cf6;}
#tesseract-main-panel .tab-btn{flex:1;padding:10px 6px;background:rgba(30,27,75,0.5);border:none;border-right:1px solid #8b5cf6;color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;transition:all 0.3s;}
#tesseract-main-panel .tab-btn:last-child{border-right:none;}
#tesseract-main-panel .tab-btn:hover{background:rgba(139,92,246,0.2);}
#tesseract-main-panel .tab-btn.active{background:#8b5cf6;color:#fff;font-weight:bold;}
#tesseract-main-panel .tab-content{display:none;padding:14px;background:linear-gradient(180deg,#0a0a0a,#0a0a0f);}
#tesseract-main-panel .tab-content.active{display:block;}

.tess-box::-webkit-scrollbar{width:6px;}
.tess-box::-webkit-scrollbar-track{background:#0a0a0a;}
.tess-box::-webkit-scrollbar-thumb{background:#8b5cf6;border-radius:3px;}

.btn-auth{width:100%;padding:12px;border:1px solid #8b5cf6;border-radius:8px;background:linear-gradient(180deg,#1e1b4b,#0a0a0f);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:15px;font-weight:900;letter-spacing:3px;text-transform:uppercase;transition:all 0.3s;margin-top:10px;}
.btn-auth:hover{background:linear-gradient(180deg,#8b5cf6,#6d28d9);color:#000;box-shadow:0 0 30px #8b5cf6;}
.user-bar{margin-bottom:10px;padding:8px 12px;background:rgba(0,0,0,0.3);border:1px solid #8b5cf6;border-radius:6px;font-size:11px;text-align:center;color:#e0e0e0;}

/* TOGGLE SWITCH */
.aa-toggle{position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0;cursor:pointer;}
.aa-toggle input{opacity:0;width:0;height:0;}
.aa-toggle-slider{position:absolute;inset:0;background:#333;border-radius:20px;transition:0.3s;cursor:pointer;}
.aa-toggle-slider::before{content:"";position:absolute;left:3px;bottom:3px;width:14px;height:14px;background:#888;border-radius:50%;transition:0.3s;}
.aa-toggle input:checked + .aa-toggle-slider{background:#8b5cf6;}
.aa-toggle input:checked + .aa-toggle-slider::before{transform:translateX(16px);background:#fff;}

/* MAIL CRIBS TOGGLE */
.mc-toggle{position:relative;display:inline-flex;align-items:center;gap:6px;cursor:pointer;}
.mc-toggle input{opacity:0;width:0;height:0;}
.mc-toggle-slider{position:relative;display:inline-block;width:28px;height:16px;background:#333;border-radius:16px;transition:0.3s;flex-shrink:0;}
.mc-toggle-slider::before{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;background:#888;border-radius:50%;transition:0.3s;}
.mc-toggle input:checked + .mc-toggle-slider{background:#22c55e;}
.mc-toggle input:checked + .mc-toggle-slider::before{transform:translateX(12px);background:#fff;}

.bot-subnav{display:flex;gap:0;background:#0a0a0a;border:1px solid #8b5cf6;border-radius:8px;overflow:hidden;margin-bottom:10px;}
.bot-subbtn{flex:1;padding:8px 4px;background:rgba(30,27,75,0.5);border:none;border-right:1px solid rgba(139,92,246,0.3);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:8px;letter-spacing:0.5px;text-transform:uppercase;transition:all 0.3s;}
.bot-subbtn:last-child{border-right:none;}
.bot-subbtn:hover{background:rgba(139,92,246,0.3);}
.bot-subbtn.active{background:#8b5cf6;color:#fff;font-weight:bold;}
.bot-subpanel{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg,#0a0a0a,#0a0a0f);border-radius:12px;z-index:1;display:none;flex-direction:column;overflow-y:auto;padding:14px;}
.bot-subpanel.visible{display:flex;}
.bot-subpanel .win-close{position:absolute;top:8px;right:10px;background:rgba(239,68,68,0.2);border:1px solid #ef4444;color:#ef4444;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all 0.3s;}
.bot-subpanel .win-close:hover{background:#ef4444;color:#fff;}

.mod-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}
.mod-card{padding:10px;background:rgba(30,27,75,0.5);border:1px solid #8b5cf6;border-radius:10px;text-align:center;}
.mod-card h4{font-size:12px;letter-spacing:1px;margin:0 0 6px 0;text-transform:uppercase;color:#e0e0e0;}
.mod-card .st{font-size:11px;margin-bottom:6px;}
.mod-card button{width:100%;padding:8px;border:1px solid #8b5cf6;border-radius:6px;background:rgba(0,0,0,0.5);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase;transition:all 0.3s;margin:2px 0;}
.mod-card button:hover{background:#7c3aed;color:#fff;box-shadow:0 0 10px #8b5cf6;}
.mod-card button.on{background:#4CAF50;color:#fff;}
.mod-card button.cfg{background:rgba(139,92,246,0.2);}
.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0;}
.stat-mini{text-align:center;padding:8px 4px;background:rgba(0,0,0,0.5);border:1px solid #8b5cf6;border-radius:6px;font-size:11px;text-transform:uppercase;color:#e0e0e0;}
.stat-mini .val{display:block;font-size:18px;font-weight:900;color:#ffffff;text-shadow:0 0 10px #8b5cf6;}

.eater-box{margin-top:8px;padding:10px;background:#000;border:1px solid #8b5cf6;border-radius:8px;}
.eater-box h4{font-size:11px;letter-spacing:1px;margin:0 0 8px 0;text-align:center;color:#e0e0e0;}
.eater-btn{width:100%;padding:12px;border:1px solid #8b5cf6;border-radius:6px;background:linear-gradient(180deg,rgba(139,92,246,0.3),rgba(30,27,75,0.7));color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;transition:all 0.3s;}
.eater-btn.on{background:#8b5cf6;color:#000;box-shadow:0 0 30px #8b5cf6;animation:eater-glow 2s infinite;}
@keyframes eater-glow{0%,100%{box-shadow:0 0 10px #8b5cf6;}50%{box-shadow:0 0 30px #8b5cf6,0 0 60px #8b5cf6;}}
.eater-textarea{width:100%;height:80px;background:#000;border:1px solid #8b5cf6;border-radius:6px;color:#e0e0e0;font-family:'Segoe UI',sans-serif;font-size:12px;padding:10px;resize:vertical;box-sizing:border-box;line-height:1.4;outline:none;}
.eater-textarea:focus{border-color:#a78bfa;box-shadow:0 0 10px rgba(139,92,246,0.3);}
.logout-link{margin-top:10px;font-size:10px;letter-spacing:2px;color:#8b5cf6;cursor:pointer;text-align:center;text-decoration:underline;}
.logout-link:hover{color:#ffffff;}

/* STAR TOOLS DENTRO DEL PANEL */
.st-tbar{display:flex;gap:2px;padding:4px;background:#0a0a0a;border-bottom:1px solid rgba(139,92,246,0.3);flex-wrap:wrap;}
.st-fb{padding:4px 8px;border:1px solid #8b5cf6;border-radius:4px;background:rgba(30,27,75,0.5);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:7px;letter-spacing:1px;text-transform:uppercase;}
.st-fb:hover{background:#7c3aed;color:#fff;}
.st-fb.sel{background:#7c3aed;color:#fff;font-weight:bold;box-shadow:0 0 10px #8b5cf6;}
.st-fb .cnt{color:#666;font-size:7px;margin-left:3px;}
.st-out{max-height:350px;overflow-y:auto;font-size:10px;background:#000;padding:4px;border-radius:4px;}
.st-out .idhdr{display:flex;justify-content:space-between;padding:4px 6px;background:rgba(30,27,75,0.7);border-bottom:2px solid #8b5cf6;font-weight:bold;font-size:9px;position:sticky;top:0;z-index:5;text-transform:uppercase;color:#e0e0e0;}
.st-out .idrow{padding:3px 6px;border-bottom:1px solid rgba(139,92,246,0.08);display:flex;align-items:center;gap:6px;}
.st-out .idrow:hover{background:rgba(139,92,246,0.1);}
.st-out .idnum{color:#666;font-size:8px;width:25px;}
.st-out .idval{color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:2px;flex:1;font-family:'Share Tech Mono',monospace;}
.st-out .idtag{font-size:7px;padding:2px 6px;border-radius:8px;text-transform:uppercase;font-weight:bold;}
.st-out .idtag.Like{background:#ec4899;color:#fff;}
.st-out .idtag.Follow{background:#3b82f6;color:#fff;}
.st-out .idtag.LFP{background:#8b5cf6;color:#fff;}
.st-out .idtag.Cartas{background:#f59e0b;color:#000;}
.st-out .empty{text-align:center;padding:20px;color:#666;font-size:10px;letter-spacing:1px;}
.st-out::-webkit-scrollbar{width:3px;}
.st-out::-webkit-scrollbar-track{background:#000;}
.st-out::-webkit-scrollbar-thumb{background:#8b5cf6;border-radius:2px;}
.st-bar{padding:6px 8px;background:#0a0a0a;border-top:1px solid #8b5cf6;font-size:8px;display:flex;justify-content:space-between;align-items:center;}
.st-bar button{background:rgba(30,27,75,0.7);border:1px solid #8b5cf6;color:#e0e0e0;padding:4px 8px;border-radius:4px;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:7px;}
.st-bar button:hover{background:#7c3aed;color:#fff;}
</style>
<style>
/* TESSERACT LIGHT THEME OVERRIDE */
#tesseract-main-panel{font-family:'Segoe UI',system-ui,sans-serif !important;}
.tess-box{background:#fff !important;border-color:#d0d0d8 !important;box-shadow:0 4px 24px rgba(0,0,0,0.1) !important;color:#1a1a2e !important;}
.tess-header{background:linear-gradient(135deg,#7c3aed,#6d28d9) !important;text-shadow:none !important;}
.tab-nav{background:#f4f4f8 !important;border-bottom:2px solid #e0e0e8 !important;}
.tab-btn{background:transparent !important;border-color:#e0e0e8 !important;color:#888 !important;font-family:'Segoe UI',sans-serif !important;}
.tab-btn:hover{background:rgba(124,58,237,0.06) !important;color:#7c3aed !important;}
.tab-btn.active{background:#7c3aed !important;color:#fff !important;}
.tab-content{background:#fafafc !important;}
.inp-lbl{color:#555 !important;}
.t-input{background:#f8f8fc !important;border-color:#e0e0e8 !important;color:#1a1a2e !important;font-family:'Segoe UI',sans-serif !important;}
.t-input:focus{border-color:#7c3aed !important;box-shadow:0 0 0 3px rgba(124,58,237,0.1) !important;}
.t-input::placeholder{color:#aaa !important;}
.btn-auth{background:#7c3aed !important;color:#fff !important;border:none !important;font-family:'Segoe UI',sans-serif !important;}
.btn-auth:hover{background:#6d28d9 !important;box-shadow:0 4px 12px rgba(124,58,237,0.3) !important;}
.user-bar{background:#f4f4f8 !important;border-color:#e0e0e8 !important;color:#555 !important;}
.aa-toggle-slider{background:#ddd !important;}
.aa-toggle input:checked + .aa-toggle-slider{background:#7c3aed !important;}
.aa-toggle-slider::before{background:#fff !important;}
.mc-toggle-slider{background:#ddd !important;}
.mc-toggle input:checked + .mc-toggle-slider{background:#22c55e !important;}
.mc-toggle-slider::before{background:#fff !important;}
.bot-subnav{background:#f4f4f8 !important;border-color:#e0e0e8 !important;}
.bot-subbtn{background:transparent !important;border-color:#e0e0e8 !important;color:#888 !important;font-family:'Segoe UI',sans-serif !important;}
.bot-subbtn:hover{background:rgba(124,58,237,0.06) !important;color:#7c3aed !important;}
.bot-subbtn.active{background:#7c3aed !important;color:#fff !important;}
.bot-subpanel{background:#fff !important;}
.mod-card{background:#f4f4f8 !important;border-color:#e0e0e8 !important;}
.mod-card h4{color:#555 !important;}
.profile-badge{background:#f4f4f8 !important;border-color:#e0e0e8 !important;color:#555 !important;}
.profile-badge .pb-name{color:#1a1a2e !important;}
.profile-badge .pb-id{color:#7c3aed !important;}
#manualProfileName,#manualProfileId{background:#f8f8fc !important;border-color:#e0e0e8 !important;color:#1a1a2e !important;}
#btnSetProfile{background:#7c3aed !important;}
.st-bar{background:#f4f4f8 !important;border-color:#e0e0e8 !important;}
.st-bar button{background:#fff !important;border-color:#d0d0d8 !important;color:#555 !important;font-family:'Segoe UI',sans-serif !important;}
.st-bar button:hover{background:#7c3aed !important;color:#fff !important;}
.tess-header button{background:rgba(255,255,255,0.15) !important;border-color:rgba(255,255,255,0.3) !important;color:#fff !important;}
.tess-header button:hover{background:rgba(255,255,255,0.3) !important;}
.tess-header button.active-tab{background:#fff !important;color:#7c3aed !important;}
.tess-box::-webkit-scrollbar-track{background:#f4f4f8 !important;}
.tess-box::-webkit-scrollbar-thumb{background:#d0d0d8 !important;}
/* Per-window accent colors */
.bot-subpanel.visible[id="botsubLikefollow"]{border-top:3px solid #ec4899 !important;}
.bot-subpanel.visible[id="botsubEater"]{border-top:3px solid #f59e0b !important;}
.bot-subpanel.visible[id="botsubIcebreakers"]{border-top:3px solid #10b981 !important;}
.bot-subpanel.visible[id="botsubSaludo"]{border-top:3px solid #10b981 !important;}
.bot-subpanel.visible[id="botsubPhotos"]{border-top:3px solid #f59e0b !important;}
.bot-subpanel.visible[id="botsubCartas"]{border-top:3px solid #3b82f6 !important;}
.bot-subpanel.visible[id="botsubScraping"]{border-top:3px solid #ef4444 !important;}
.bot-subpanel.visible[id="botsubMailing"]{border-top:3px solid #8b5cf6 !important;}
.bot-subpanel.visible[id="botsubAutoAnswer"]{border-top:3px solid #06b6d4 !important;}
.bot-subpanel.visible[id="botsubStar"]{border-top:3px solid #7c3aed !important;}
/* Tab-content accent colors */
#tabMain.tab-content{border-left:3px solid #7c3aed !important;}
#tabStar.tab-content{border-left:3px solid #f59e0b !important;}
#tabMailing.tab-content{border-left:3px solid #8b5cf6 !important;}
#tabBlacklist.tab-content{border-left:3px solid #ef4444 !important;}
#tabSoporte.tab-content{border-left:3px solid #22c55e !important;}
</style>
<div id="tess-mini-icon">🤖</div>
<div class="tess-box">
<div class="tess-resize se"></div><div class="tess-resize sw"></div><div class="tess-resize ne"></div><div class="tess-resize nw"></div>
<div class="tess-header"><span>🤖 TESSERACT</span><div><button id="btnZoomOut" title="Reducir">-</button><span id="zoomLevel" style="color:#fff;font-size:11px;min-width:28px;text-align:center;display:inline-block;">1.0</span><button id="btnZoomIn" title="Ampliar">+</button><button id="btnMin" title="Minimizar">_</button><button id="btnClose" title="Cerrar">x</button></div></div>

<!-- PERFIL ACTIVO -->
<div class="profile-badge" id="profileBadge"><span>🎯 <span class="pb-name" id="profileName">—</span></span><span class="pb-id" id="profileId">ID: —</span> <input id="manualProfileName" placeholder="Name" style="width:60px;background:#0a0a0f;border:1px solid #333350;color:#e0e0e0;font-size:8px;padding:2px 4px;border-radius:2px;"> <input id="manualProfileId" placeholder="ID" style="width:60px;background:#0a0a0f;border:1px solid #333350;color:#e0e0e0;font-size:8px;padding:2px 4px;border-radius:2px;"> <button id="btnSetProfile" style="background:#8b5cf6;border:none;color:#fff;font-size:8px;padding:2px 6px;border-radius:2px;cursor:pointer;">SET</button></div>

<!-- PESTAÑAS -->
<div class="tab-nav">
  <button class="tab-btn active" data-tab="main">🎮 BOT</button>
  <button class="tab-btn" data-tab="star">⭐ STAR TOOLS</button>
  <button class="tab-btn" data-tab="mailing">📬 MAILING</button>
  <button class="tab-btn" data-tab="blacklist">🚫 BLACKLIST</button>
  <button class="tab-btn" data-tab="soporte">💬 MENSAJES</button>
</div>

<!-- PESTAÑA BOT -->
<div id="tabMain" class="tab-content active">
<div id="mainScreen">
<div class="user-bar">👤 <strong id="currentUserDisplay"></strong></div>

<!-- SUB-PESTAÑAS DEL BOT -->
<div class="bot-subnav">
  <button class="bot-subbtn" data-botsub="likefollow">❤️➕ LIKES & FOLLOWS</button>
  <button class="bot-subbtn" data-botsub="eater">🧠 EATER</button>
  <button class="bot-subbtn" data-botsub="icebreakers">🎯 ICEBREAKERS</button>
  <button class="bot-subbtn" data-botsub="saludo">👋 SAY HI!</button>
</div>

<!-- CONTENEDOR DE VENTANAS -->
<div class="bot-win-container" style="position:relative;min-height:200px;">

<!-- SUB: LIKE & FOLLOW + PHOTOS (Unificado) -->
<div class="bot-subpanel" id="botsubLikefollow" data-z="1">
<button class="win-close" data-close="botsubLikefollow">×</button>
<div class="mod-card" style="margin-bottom:8px;">
<h4>❤️➕📷 L+F+P UNIFICADO</h4>
<div class="st" id="lfpStatus" style="color:#ffffff;font-size:13px;font-weight:bold;margin-bottom:8px;">INACTIVO</div>
<div style="display:flex;gap:6px;justify-content:center;">
<button id="btnLFPToggle" style="flex:1;padding:12px 8px;border:2px solid #8b5cf6;border-radius:8px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;transition:all 0.3s;text-shadow:0 0 10px rgba(139,92,246,0.5);">▶ L+F+P</button>
<button id="btnLFPPause" style="width:44px;padding:12px 4px;border:1px solid #f59e0b;border-radius:8px;background:rgba(245,158,11,0.15);color:#f59e0b;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:16px;transition:all 0.3s;" title="Pausar/Reanudar">⏸</button>
</div>
<div style="margin-top:6px;">
<button id="btnLFPMessages" style="width:100%;padding:10px 8px;border:2px solid #3b82f6;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;transition:all 0.3s;text-shadow:0 0 10px rgba(59,130,246,0.5);">💬 L+F+P MENSAJES</button>
<button id="btnLFPMsgStop" style="width:100%;margin-top:6px;padding:8px;border:2px solid #ef4444;border-radius:8px;background:rgba(239,68,68,0.15);color:#ef4444;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;transition:all 0.3s;">⏹ STOP MENSAJES</button>
</div>
</div>
<div class="stats-row">
<div class="stat-mini" style="grid-column:1/-1;"><span class="val" id="vTotal" style="font-size:28px;">0</span>RESULTS</div>
</div>
</div>

<!-- SUB: EATER -->
<div class="bot-subpanel" id="botsubEater" data-z="1">
<button class="win-close" data-close="botsubEater">×</button>
<div class="eater-box">
<h4>🧠 EATER — <span id="eaterClientName" style="font-size:9px;"></span> <span id="eaterClearSelectionBtn" style="display:none;cursor:pointer;font-size:10px;color:#ef4444;margin-left:4px;padding:0 4px;border:1px solid #ef4444;border-radius:3px;background:rgba(239,68,68,0.1);" title="Limpiar selección múltiple">✕</span></h4>
<button class="eater-btn" id="btnEaterToggle">🧠 EATER: OFF</button>
<div class="eater-sugs" id="eaterSuggestions" style="margin-top:8px;">
<div style="margin-bottom:6px;font-size:10px;color:#888;letter-spacing:1px;">📝 RESPUESTA GENERADA</div>
<textarea id="eaterResponseArea" class="eater-textarea">Esperando mensaje...</textarea>
<button id="btnStopClone" style="width:100%;padding:6px;margin-top:4px;border:1px solid #ef4444;border-radius:6px;background:rgba(239,68,68,0.15);color:#ef4444;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:8px;letter-spacing:1px;">⏹ CLONACIÓN: ACTIVA</button>
<button id="btnCopyEaterResponse" style="width:100%;padding:8px;margin-top:6px;border:1px solid #8b5cf6;border-radius:6px;background:rgba(30,27,75,0.5);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;">📋 COPIAR AL CHAT</button>
<div style="display:flex;gap:6px;margin-top:6px;">
<button id="btnEaterMulti" style="padding:8px;border:1px solid #555;border-radius:6px;background:transparent;color:#aaa;cursor:pointer;font-size:8px;font-family:'Orbitron',sans-serif;letter-spacing:1px;transition:all 0.2s;" title="Activar selección múltiple de mensajes">🔗 MULTI</button>
<button id="btnRefreshEater2" style="flex:1;padding:8px;border:1px solid #8b5cf6;border-radius:6px;background:rgba(139,92,246,0.2);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:8px;letter-spacing:1px;">🔄 REGENERAR</button>
<select id="btnTranslate2" style="flex:1;padding:8px;border:1px solid #2196F3;border-radius:6px;background:rgba(33,150,243,0.2);color:#e0e0e0;cursor:pointer;font-family:'Segoe UI Emoji','Apple Color Emoji','Orbitron',sans-serif;font-size:8px;letter-spacing:1px;outline:none;appearance:auto;">
<option value="en">🇬🇧 EN</option>
<option value="fr">🇫🇷 FR</option>
<option value="pt">🇵🇹 PT</option>
<option value="de">🇩🇪 DE</option>
<option value="it">🇮🇹 IT</option>
<option value="nl">🇳🇱 NL</option>
<option value="es">🇪🇸 ES</option>
</select>
</div>
<button id="btnTranslateClient" style="width:100%;padding:8px;margin-top:6px;border:1px solid #2196F3;border-radius:6px;background:rgba(33,150,243,0.15);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;" title="Traduce la respuesta generada al mismo idioma del mensaje del cliente">🌐 TRADUCIR AL IDIOMA DEL CLIENTE</button>
</div>
</div>
</div>

<!-- SUB: ICEBREAKERS IA v2 -->
<div class="bot-subpanel" id="botsubIcebreakers" data-z="1">
<button class="win-close" data-close="botsubIcebreakers">×</button>
<div class="eater-box">
<h4 style="font-size:11px;letter-spacing:1px;margin:8px 0;text-align:center;color:#8b5cf6;">🎯 ICEBREAKERS IA</h4>
<div style="display:flex;gap:6px;margin-bottom:6px;">
<button id="btnIBGenerate" style="flex:1;padding:8px 4px;border:1px solid #8b5cf6;border-radius:6px;background:rgba(139,92,246,0.2);color:#fff;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;font-weight:700;letter-spacing:1px;">🎲 GENERAR</button>
<button id="btnIBSend" style="flex:1;padding:8px 4px;border:1px solid #10b981;border-radius:6px;background:rgba(16,185,129,0.2);color:#fff;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;font-weight:700;letter-spacing:1px;opacity:0.5;">▶ ENVIAR 5</button>
<button id="btnIBTranslate" style="flex:1;padding:8px 4px;border:1px solid #2196F3;border-radius:6px;background:rgba(33,150,243,0.2);color:#fff;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;font-weight:700;letter-spacing:1px;" title="Traduce los icebreakers generados al inglés">🌐 TRADUCIR EN</button>
</div>
<div style="font-size:9px;color:#888;margin-bottom:4px;text-align:center;" id="ibStatus">Listo</div>
<div style="font-size:9px;color:#f59e0b;margin-bottom:4px;text-align:center;font-family:'Orbitron',monospace;letter-spacing:2px;display:none;" id="ibVisionTimer">⏱ 03:00:00</div>
<button id="btnIBFreeze" style="width:100%;padding:7px 4px;margin-bottom:4px;border:1px solid #555;border-radius:6px;background:transparent;color:#888;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:9px;font-weight:700;letter-spacing:1px;transition:all 0.3s;" title="Detiene el contador de 3h hasta que lo descongeles">❄ FREEZE</button>
<div style="margin-bottom:4px;font-size:9px;color:#8b5cf6;letter-spacing:1px;">PREVIEW</div>
<div id="ibPreview" style="display:flex;flex-direction:column;gap:2px;padding:2px;max-height:340px;overflow-y:auto;">
<div style="color:#666;font-size:10px;text-align:center;padding:8px;">Genera mensajes con el botón 🎲 GENERAR</div>
</div>
</div>
<div id="ibVisionModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;justify-content:center;align-items:center;flex-direction:column;">
  <div style="background:#1a1a2e;border:2px solid #ef4444;border-radius:12px;padding:24px;max-width:360px;text-align:center;box-shadow:0 0 40px rgba(239,68,68,0.4);">
    <div style="font-size:16px;color:#ef4444;margin-bottom:18px;font-weight:700;line-height:1.5;font-family:'Orbitron',sans-serif;letter-spacing:1px;">⚠ ACTUALIZA IB MALPARID@</div>
    <button id="ibVisionModalOk" style="width:100%;padding:10px 20px;border:2px solid #f59e0b;border-radius:8px;background:rgba(245,158,11,0.2);color:#f59e0b;cursor:pointer;font-size:12px;font-weight:700;font-family:'Orbitron',sans-serif;">OK</button>
  </div>
</div>
</div>

<!-- SUB: SALUDO PUSH -->
<div class="bot-subpanel" id="botsubSaludo" data-z="1">
<button class="win-close" data-close="botsubSaludo">×</button>
<div class="mod-card" style="margin-bottom:8px;">
<h4>👋 SAY HI!</h4>
<div class="st" id="spStatus" style="color:#888;font-size:13px;font-weight:bold;margin-bottom:8px;">INACTIVO</div>

<p style="font-size:9px;color:#aaa;line-height:1.5;margin:0 0 8px;">Genera 5 mensajes con IA (saludo → intriga → remate → pre-cierre → cierre), los traduce al inglés y los envía uno a uno a cada contacto de la pestaña <strong style="color:#10b981;">Active</strong>.</p>

<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;">
<label style="display:flex;align-items:center;gap:4px;font-size:9px;color:#ccc;cursor:pointer;"><input type="checkbox" id="spTraducir" style="accent-color:#8b5cf6;" checked> Traducir a ingl\u00E9s</label>
<label style="display:flex;align-items:center;gap:4px;font-size:9px;color:#ccc;">L\u00EDmite: <input type="number" id="spMaxDaily" value="30" min="0" style="width:50px;padding:3px 4px;background:#000;border:1px solid #10b981;border-radius:4px;color:#e0e0e0;font-size:9px;"></label>
<span style="font-size:9px;color:#888;">Enviados hoy: <strong id="spSentToday" style="color:#10b981;">0</strong></span>
</div>
<button id="btnSPToggle" style="width:100%;margin-top:8px;padding:12px 8px;border:2px solid #10b981;border-radius:8px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;transition:all 0.3s;text-shadow:0 0 10px rgba(16,185,129,0.5);">SAY HI!</button>
</div>
</div>

</div>

<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 8px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);border-radius:6px;">
  <label class="mc-toggle" style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;">
    <input type="checkbox" id="btnToggleMailCribs">
    <span class="mc-toggle-slider"></span>
    <span style="font-size:10px;letter-spacing:1px;color:#ccc;">📬 MAIL CRIBS</span>
  </label>
  <span id="mcStatusInline" style="font-size:9px;color:#666;">INACTIVO</span>
</div>

<div style="display:flex;gap:8px;justify-content:center;margin-top:8px;">
<button class="logout-link" id="btnDashboardPanel" style="flex:1;">📊 DASHBOARD</button>
<button class="logout-link" id="btnAdminPanel" style="flex:1;">⚙ ADMIN PANEL</button>
</div>
</div>
</div>

<!-- PESTAÑA STAR TOOLS -->
<div id="tabStar" class="tab-content">
<div class="user-bar">⭐ STAR TOOLS — <span id="starTotalLive">0 IDs capturados</span></div>
<div class="st-tbar">
<button class="st-fb sel" data-f="all">TODOS <span class="cnt" id="cntAll">0</span></button>
<button class="st-fb" data-f="L+F">❤️➕ L+F <span class="cnt" id="cntLF">0</span></button>

<button class="st-fb" data-f="Cartas">📨 <span class="cnt" id="cntCartas">0</span></button>
</div>
<div class="st-out" id="stOutput"><div class="empty">⭐ SIN IDs RECOLECTADOS<br><small>Ejecuta un barrido para ver IDs</small></div></div>
<div class="st-bar"><span id="stCount">TOTAL: 0 IDs</span><div><button id="btnClear">🧹 LIMPIAR</button><button id="btnExport">📋 EXPORTAR</button><button id="btnCopy">📝 COPIAR</button></div></div>
</div>

<!-- PESTAÑA SMART MAILING -->
<div id="tabMailing" class="tab-content">
<div class="user-bar">📬 SMART MAILING — <span id="mlStatusInline">INACTIVO</span></div>
<div style="padding:10px;">
  <div class="stats-row">
    <div class="stat-mini"><span class="val" id="mlSentTodayInline">0</span>ENVIADOS HOY</div>
    <div class="stat-mini"><span class="val" id="mlDailyLimitInline">30</span>LÍMITE</div>
    <div class="stat-mini"><span class="val" id="mlQueueCountInline">0</span>EN COLA</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
    <div class="mod-card"><h4>⏱ Intervalo</h4><div class="st" id="mlIntervalDisplay">60 min</div></div>
    <div class="mod-card"><h4>💬 Mensaje</h4><div class="st" id="mlMsgPreview" style="font-size:8px;">—</div></div>
  </div>
  <button class="btn-auth" id="btnOpenMLConfig" style="margin-top:8px;">⚙ CONFIGURAR SMART MAILING</button>
  <button class="btn-auth" id="btnScrapeML" style="margin-top:4px;background:#7c3aed;">🔍 RASTREAR CONTACTOS</button>
  <button class="btn-auth" id="btnStartCarta" style="margin-top:4px;background:#059669;border-color:#059669;">📨 INICIAR ENVIO DE CARTAS</button>
  <div id="mlCartaProgress" style="margin-top:6px;font-size:9px;color:#888;display:none;text-align:center;"></div>
  <div id="mlContactList" style="margin-top:8px;max-height:200px;overflow-y:auto;border:1px solid #e0e0e8;border-radius:6px;background:#fafafc;display:none;"></div>
</div>
</div>

<!-- PESTAÑA BLACKLIST -->
<div id="tabBlacklist" class="tab-content">
<div class="user-bar">🚫 BLACKLIST — <span id="blCount">0 contactos</span></div>
<div style="padding:10px;">
  <div class="inp-grp"><label class="inp-lbl">AGREGAR ID A BLACKLIST</label><input type="text" id="blInput" class="t-input" placeholder="ID del contacto" /></div>
  <button class="btn-auth" id="btnBlAdd" style="margin-top:4px;">🚫 BLOQUEAR</button>
  <div style="margin-top:10px;max-height:250px;overflow-y:auto;background:#0a0a0a;padding:8px;border:1px solid #333;border-radius:4px;">
    <div id="blList" style="font-size:10px;color:#ccc;">
      <p style="color:#666;text-align:center;">Cargando...</p>
    </div>
  </div>
</div>
</div>

<!-- PESTAÑA MENSAJES (SOPORTE + CHAT PRIVADO ENTRE USUARIOS) -->
<div id="tabSoporte" class="tab-content">
<style>
#tabSoporte .wa-msgs{background:#0b141a;flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:5px;border-radius:8px;padding:10px;border:1px solid #2a2a44;}
#tabSoporte .wa-b{max-width:80%;padding:7px 9px;border-radius:11px;font-size:11px;line-height:1.35;position:relative;word-break:break-word;white-space:pre-wrap;}
#tabSoporte .wa-me{align-self:flex-end;background:#005c4b;color:#e9edef;border-bottom-right-radius:3px;}
#tabSoporte .wa-you{align-self:flex-start;background:#202c33;color:#e9edef;border-bottom-left-radius:3px;}
#tabSoporte .wa-t{font-size:8px;color:#8696a0;text-align:right;margin-top:3px;display:block;}
#tabSoporte .wa-img{max-width:180px;max-height:180px;border-radius:8px;display:block;cursor:pointer;margin-bottom:2px;background:#111;}
#tabSoporte .wa-emoji{background:transparent;border:none;font-size:16px;padding:2px 3px;cursor:pointer;line-height:1;}
#tabSoprite .x{}
</style>
<div class="user-bar">💬 MENSAJES — <span id="opChatWho">🛡 SOPORTE</span></div>
<div style="display:flex;flex-direction:column;height:360px;padding:8px;gap:6px;">  <div style="display:flex;gap:6px;">
    <select id="opChatPeer" style="flex:1;background:#12121f;border:1px solid #26263a;color:#e0e0e0;border-radius:6px;padding:6px 8px;font-size:11px;outline:none;">
      <option value="ADMIN">🛡 SOPORTE (administrador)</option>
    </select>
    <button id="btnOpChatRefresh" title="Reiniciar vista del chat" style="background:#16162a;border:1px solid #2a2a44;color:#bbb;border-radius:6px;width:32px;cursor:pointer;font-size:12px;">⟳</button>
    <button id="btnOpChatClear" title="Borrar TODO el historial de esta conversación" style="background:#16162a;border:1px solid #7f1d1d;color:#f87171;border-radius:6px;width:32px;cursor:pointer;font-size:12px;">🧹</button>
  </div>
  <div id="opChatMsgs" class="wa-msgs">
    <div style="margin:auto;color:#666;font-size:10px;text-align:center;">Selecciona un contacto arriba.<br>🛡 SOPORTE te conecta con el administrador.<br>Tus conversaciones son privadas.</div>
  </div>
  <div id="opEmojiBar" style="display:none;flex-wrap:wrap;gap:1px;background:#12121f;border:1px solid #26263a;border-radius:8px;padding:4px;max-height:74px;overflow-y:auto;"></div>
  <div style="display:flex;gap:5px;align-items:center;">
    <button id="btnOpChatAttach" title="Enviar imagen" style="background:#16162a;border:1px solid #2a2a44;color:#bbb;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:13px;">📎</button>
    <input id="opChatFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none;">
    <input type="text" id="opChatInput" maxlength="2000" placeholder="Mensaje…" style="flex:1;background:#12121f;border:1px solid #26263a;color:#e0e0e0;border-radius:6px;padding:7px 10px;font-size:11px;outline:none;">
    <button id="btnOpChatEmoji" title="Emojis" style="background:#16162a;border:1px solid #2a2a44;color:#bbb;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:13px;">😊</button>
    <button id="btnOpChatSend" style="background:#22c55e;border:none;color:#fff;border-radius:6px;width:34px;height:30px;font-size:12px;font-weight:700;cursor:pointer;">➤</button>
  </div>
</div>
  <div style="text-align:center;color:#3a3a55;font-size:8px;padding:1px 0;">Tesseract Chat v3.1</div>
</div>

</div></div>`;
  document.body.appendChild(p);
  console.log('[TESSERACT] ✅ Panel principal creado');
}

// ============ MODALES ============


function createCartasModal() {
  if (document.getElementById('cartasModal')) return;
  const m = document.createElement('div');
  m.id = 'cartasModal';
  m.innerHTML = `
<style>
#cartasModal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999999;display:none;}
.car-box{width:520px;background:#0a0a0a;border:2px solid #8b5cf6;border-radius:12px;box-shadow:0 0 40px rgba(139,92,246,0.5);color:#8b5cf6;font-family:'Orbitron',sans-serif;}
.car-hdr{background:linear-gradient(135deg,#1e1b4b,#8b5cf6,#1e1b4b);padding:12px 16px;border-radius:10px 10px 0 0;font-weight:bold;letter-spacing:2px;display:flex;justify-content:space-between;border-bottom:2px solid #8b5cf6;color:#e0e0e0;}
.car-body{padding:16px;}
.car-body textarea{width:100%;height:180px;background:#000;border:1px solid #8b5cf6;border-radius:6px;color:#e0e0e0;font-family:Arial;font-size:12px;padding:10px;resize:vertical;box-sizing:border-box;}
.car-body textarea:focus{outline:none;border-color:#ef4444;}
.car-foot{padding:12px;border-top:1px solid #8b5cf6;text-align:right;}
.car-foot button{padding:8px 16px;border:1px solid #8b5cf6;border-radius:6px;background:rgba(30,27,75,0.7);color:#e0e0e0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:10px;margin-left:8px;}
.car-foot button.save{background:#FF9800;border-color:#FF9800;color:#000;font-weight:bold;}
</style>
<div class="car-box"><div class="car-hdr"><span>📨 CONFIGURAR CARTA</span><span style="cursor:pointer;font-size:18px;" id="btnCloseCartas">×</span></div>
<div class="car-body"><textarea id="cartaText" placeholder="Escribe tu carta aquí..."></textarea></div>
<div class="car-foot"><button id="btnCancelCartas">CANCELAR</button><button class="save" id="btnSaveCartas">💾 GUARDAR</button></div></div>`;
  document.body.appendChild(m);
}

// ============ EVENTOS ============
function setupAllEvents() {
  // Pestañas
  var mainPanel = document.getElementById('tesseract-main-panel');
  mainPanel.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const clickedTab = this.dataset.tab;
      if (clickedTab === currentTab && currentTab !== 'main') {
        mainPanel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        mainPanel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        currentTab = Tesseract.set('currentTab', 'main');
        mainPanel.querySelector('[data-tab="main"]').classList.add('active');
        document.getElementById('tabMain').classList.add('active');
        return;
      }
      mainPanel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentTab = Tesseract.set('currentTab', clickedTab);
      const tabMap = { main: 'Main', star: 'Star', mailing: 'Mailing', blacklist: 'Blacklist', soporte: 'Soporte' };
      mainPanel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab' + (tabMap[currentTab] || 'Main')).classList.add('active');
      if (currentTab === 'star') renderStarIds();
      if (currentTab === 'mailing') updateMLTabUI();
      if (currentTab === 'blacklist') { /* blacklist removed */ }
      if (currentTab === 'soporte' && typeof window._startSupportChat === 'function') window._startSupportChat();
    });
  });

    // Sub-pestañas del BOT: estilo ventanas Windows
  window._tessWinZ = window._tessWinZ || 10;
  document.querySelectorAll('.bot-subbtn').forEach(btn => {
    btn.addEventListener('click', function() {
      const panelId = 'botsub' + this.dataset.botsub.charAt(0).toUpperCase() + this.dataset.botsub.slice(1);
      const panel = document.getElementById(panelId);
      window._tessWinZ++;
      panel.style.zIndex = window._tessWinZ;
      panel.classList.add('visible');
      this.classList.add('active');
    });
  });

  // Botones de cerrar ventanas
  document.querySelectorAll('.win-close').forEach(btn => {
    btn.addEventListener('click', function() {
      const panelId = this.dataset.close;
      document.getElementById(panelId).classList.remove('visible');
      const subKey = panelId.replace('botsub', '').toLowerCase();
      document.querySelector('.bot-subbtn[data-botsub="' + subKey + '"]').classList.remove('active');
    });
  });
  
  // Botones de barrido
  document.getElementById('btnLFPToggle').addEventListener('click', function() { if (typeof executeLFP === 'function') executeLFP(); });
  document.getElementById('btnLFPPause').addEventListener('click', function() { if (typeof lfpTogglePause === 'function') lfpTogglePause(); });
  document.getElementById('btnLFPMessages').addEventListener('click', function() { if (typeof executeLFPMessages === 'function') executeLFPMessages(); });
  document.getElementById('btnLFPMsgStop').addEventListener('click', function() {
    if (typeof window._stopLFPMessages === 'function') window._stopLFPMessages();
  });
  
  // Eater
  document.getElementById('btnEaterToggle').addEventListener('click', function() { if (typeof toggleEater === 'function') toggleEater(); });
  document.getElementById('btnStopClone').addEventListener('click', function() { if (typeof toggleClonacion === 'function') toggleClonacion(); });
  document.getElementById('btnCopyEaterResponse').addEventListener('click', function() { if (typeof copyEaterResponseToChat === 'function') copyEaterResponseToChat(); });
  document.getElementById('btnRefreshEater2').addEventListener('click', function() { if (typeof refreshEaterSuggestions === 'function') refreshEaterSuggestions(); });
  document.getElementById('btnEaterMulti').addEventListener('click', function() {
    if (typeof _toggleEaterMultiMode === 'function') _toggleEaterMultiMode();
  });
  document.getElementById('btnTranslate2').addEventListener('change', function () {
    selectedLangCode = Tesseract.set('selectedLangCode', this.value);
    translateEaterResponse();
  });
  document.getElementById('btnTranslateClient').addEventListener('click', function() { if (typeof translateEaterToClientLang === 'function') translateEaterToClientLang(); });

  // Saludo Push (Say Hi!)
  document.getElementById('btnSPToggle').addEventListener('click', function() {
    if (typeof window._executeSaludoPush === 'function' && typeof window._abortSaludoPush === 'function') {
      if (document.getElementById('spStatus').textContent === 'ACTIVO') {
        window._abortSaludoPush();
      } else {
        window._executeSaludoPush();
      }
    }
  });
  ['spTraducir','spMaxDaily'].forEach(function(id) {
    document.getElementById(id).addEventListener('change', function() {
      if (typeof window._saveSPPanelConfig === 'function') window._saveSPPanelConfig();
    });
  });
  var btnIBGen = document.getElementById('btnIBGenerate');
  if (btnIBGen) btnIBGen.addEventListener('click', function() {
    if (typeof window._generateIcebreakers === 'function') window._generateIcebreakers();
  });
  var btnIBSend = document.getElementById('btnIBSend');
  if (btnIBSend) btnIBSend.addEventListener('click', function() {
    if (typeof window._executeIcebreakerSweep === 'function') window._executeIcebreakerSweep();
  });
  var btnIBFreeze = document.getElementById('btnIBFreeze');
  if (btnIBFreeze) btnIBFreeze.addEventListener('click', function() {
    if (typeof window._toggleIBFreeze === 'function') window._toggleIBFreeze();
  });
  var btnIBTranslate = document.getElementById('btnIBTranslate');
  if (btnIBTranslate) btnIBTranslate.addEventListener('click', function() {
    if (typeof window._translateIcebreakersToEnglish === 'function') window._translateIcebreakersToEnglish();
  });
  const clearSelBtn = document.getElementById('eaterClearSelectionBtn');
  if (clearSelBtn) clearSelBtn.addEventListener('click', function() {
    if (typeof _clearEaterSelection === 'function') _clearEaterSelection();
    this.style.display = 'none';
  });
  
  // Panel Header Buttons (capture-phase delegation para evitar interferencia del sitio)
  function toggleMin() {
    var panel = document.getElementById('tesseract-main-panel');
    if (!panel) return;
    var box = panel.querySelector('.tess-box');
    var mini = document.getElementById('tess-mini-icon');
    var isMin = box ? box.style.display === 'none' : false;
    if (isMin) {
      if (box) box.style.display = '';
      if (mini) mini.style.display = 'none';
    } else {
      if (box) box.style.display = 'none';
      if (mini) mini.style.display = 'flex';
    }
  }
  var mainPanel = document.getElementById('tesseract-main-panel');
  if (mainPanel) {
    mainPanel.addEventListener('mousedown', function(e) {
      var id = e.target && e.target.id;
      if (id === 'btnMin' || id === 'tess-mini-icon') {
        e.stopPropagation();
        toggleMin();
      } else if (id === 'btnClose') {
        e.stopPropagation();
        document.getElementById('tesseract-main-panel').style.display = 'none';
      }
    }, true);
  }

  // Zoom (envuelto en try/catch para no bloquear la inicialización)
  try {
    var currentZoom = 1.0;
    window._tessApplyZoom = function (z) {
      currentZoom = Math.max(0.5, Math.min(2.0, z));
      var box = document.querySelector('#tesseract-main-panel .tess-box');
      if (box) box.style.zoom = currentZoom;
      var zl = document.getElementById('zoomLevel');
      if (zl) zl.textContent = currentZoom.toFixed(1);
      chrome.storage.local.set({ tess_zoom: currentZoom });
    };
    var btnZoomIn = document.getElementById('btnZoomIn');
    if (btnZoomIn) btnZoomIn.addEventListener('mousedown', function (e) { e.stopPropagation(); window._tessApplyZoom(currentZoom + 0.1); });
    var btnZoomOut = document.getElementById('btnZoomOut');
    if (btnZoomOut) btnZoomOut.addEventListener('mousedown', function (e) { e.stopPropagation(); window._tessApplyZoom(currentZoom - 0.1); });
    chrome.storage.local.get('tess_zoom', function (d) { if (d.tess_zoom && window._tessApplyZoom) window._tessApplyZoom(d.tess_zoom); });
  } catch (e) { console.warn('[ZOOM] Error:', e.message); }

  document.getElementById('btnDashboardPanel').addEventListener('click', () => {
    window.open(chrome.runtime.getURL('dist/pages/dashboard/dashboard.html'), '_blank');
  });
  document.getElementById('btnAdminPanel').addEventListener('click', async () => {
    try {
      const data = await chrome.storage.local.get(['tess_jwt']);
      const url = data.tess_jwt
        ? chrome.runtime.getURL('dist/pages/admin/admin.html') + '?token=' + encodeURIComponent(data.tess_jwt)
        : chrome.runtime.getURL('dist/pages/admin/admin.html');
      window.open(url, '_blank');
    } catch (e) {
      window.open(chrome.runtime.getURL('dist/pages/admin/admin.html'), '_blank');
    }
  });
  document.getElementById('btnSetProfile').addEventListener('click', () => {
    const n = document.getElementById('manualProfileName').value.trim();
    const id = document.getElementById('manualProfileId').value.trim();
    if (n || id) {
      document.getElementById('profileName').textContent = n || '—';
      document.getElementById('profileId').textContent = 'ID: ' + (id || '—');
      document.getElementById('profileBadge').style.display = 'flex';
    }
  });
  
  // Modales
  document.getElementById('btnCloseCartas').addEventListener('click', () => document.getElementById('cartasModal').style.display = 'none');
  document.getElementById('btnCancelCartas').addEventListener('click', () => document.getElementById('cartasModal').style.display = 'none');
  document.getElementById('btnSaveCartas').addEventListener('click', function() { if (typeof saveCartasConfig === 'function') saveCartasConfig(); });
  
  // Star Tools filtros
  document.querySelectorAll('.st-fb').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.st-fb').forEach(b => b.classList.remove('sel'));
      this.classList.add('sel');
      currentStarFilter = Tesseract.set('currentStarFilter', this.dataset.f);
      renderStarIds();
    });
  });
  
  // Star Tools acciones
  document.getElementById('btnClear').addEventListener('click', function() { if (typeof clearIDs === 'function') clearIDs(); });
  document.getElementById('btnExport').addEventListener('click', function() { if (typeof exportIDs === 'function') exportIDs(); });
  document.getElementById('btnCopy').addEventListener('click', function() { if (typeof copyIDs === 'function') copyIDs(); });

  // Mail CRIBS
  document.getElementById('btnToggleMailCribs').addEventListener('change', function() {
    if (typeof window._setMailCribsEnabled === 'function') {
      window._setMailCribsEnabled(this.checked);
    }
    setTimeout(updateMailCribsUI, 300);
  });

  // Smart Mailing
  document.getElementById('btnOpenMLConfig').addEventListener('click', () => {
    if (typeof openMLPanel === 'function') openMLPanel();
  });
  document.getElementById('btnScrapeML').addEventListener('click', () => {
    updateMLContactList();
  });
  document.getElementById('btnStartCarta').addEventListener('click', function() {
    if (this._mailingActive) {
      if (typeof window._abortMailingRound === 'function') window._abortMailingRound();
      this.textContent = '⏹ DETENIENDO...';
      this.style.background = '#dc2626';
      this._mailingActive = false;
    } else {
      startCartaMailing();
    }
  });
  
  // Eater suggestions
  // ===== EATER textarea: seleccionar texto lo copia al chat =====
  document.getElementById('eaterResponseArea').addEventListener('mouseup', function() {
    const sel = this.selectionStart !== this.selectionEnd;
    if (sel) {
      const text = this.value.substring(this.selectionStart, this.selectionEnd);
      if (text && text !== 'Esperando mensaje...') {
        copyToChatInput(text);
        this.style.borderColor = '#4CAF50';
        setTimeout(() => this.style.borderColor = '#8b5cf6', 600);
        this.selectionStart = this.selectionEnd;
      }
    }
  });
  
  makeDraggable('tesseract-main-panel', '.tess-header');

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'E') { e.preventDefault(); if(isAuthenticated) toggleEater(); }
    if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); currentTab = Tesseract.set('currentTab', 'star'); renderStarIds(); }
  });
  
  console.log('[TESSERACT] ✅ Eventos configurados');
}

// ============ AUTENTICACIÓN (auto desde storage) ============
function showSessionRequired() {
  const panel = document.getElementById('tesseract-main-panel');
  if (!panel || document.getElementById('tess-session-gate')) return;
  if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
  const gate = document.createElement('div');
  gate.id = 'tess-session-gate';
  gate.style.cssText = 'position:absolute;inset:0;z-index:50;background:rgba(5,5,12,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;border-radius:16px;text-align:center;padding:20px;';
  gate.innerHTML =
    '<div style="font-size:30px;">🔒</div>' +
    '<div style="color:#f59e0b;font-weight:700;letter-spacing:1px;font-size:12px;">SESIÓN NO INICIADA O EXPIRADA</div>' +
    '<div style="color:#888;font-size:10px;max-width:260px;">Inicia sesión para usar el panel de TESSERACT.</div>' +
    '<button id="tessGateLogin" style="background:#8b5cf6;border:none;color:#fff;font-family:inherit;font-weight:700;font-size:11px;letter-spacing:1px;padding:9px 22px;border-radius:8px;cursor:pointer;">INICIAR SESIÓN</button>';
  panel.appendChild(gate);
  document.getElementById('tessGateLogin').addEventListener('click', () => {
    window.open(chrome.runtime.getURL('dist/pages/login/login.html'), '_blank');
  });
}

async function initAuthFromStorage() {
  try {
    const data = await chrome.storage.local.get(['tess_jwt', 'tess_user', 'user_email']);
    if (data.tess_jwt) {
      isAuthenticated = Tesseract.set('isAuthenticated', true);
      currentUser = Tesseract.set('currentUser', data.tess_user || data.user_email || 'agent@tesseract.com');
      document.getElementById('currentUserDisplay').textContent = currentUser;
      if (typeof loadBlacklist === 'function') loadBlacklist();
      if (typeof reloadMLBlacklist === 'function') reloadMLBlacklist();
      if (typeof loadAABlacklist === 'function') loadAABlacklist();
      if (typeof reloadLFPBlacklist === 'function') reloadLFPBlacklist();
      if (typeof detectCurrentProfile === 'function') detectCurrentProfile();
      startPeriodicSync();
      Tesseract.broadcast('STATE_SYNC', { isAuthenticated: true, currentUser: Tesseract.get('currentUser'), eaterActive: Tesseract.get('eaterActive'), clonacionActiva: Tesseract.get('clonacionActiva'), collectedIds: Tesseract.get('collectedIds'), botStats: Tesseract.get('botStats') });
    } else {
      // Sin JWT en storage: intentar renovar con refresh token antes de bloquear el panel
      let recovered = false;
      try { if (typeof tryRefreshToken === 'function') recovered = await tryRefreshToken(); } catch (e) {}
      if (recovered) { initAuthFromStorage(); return; }
      showSessionRequired();
    }
  } catch (e) { console.error('[TESSERACT] initAuth error:', e); }
}

// Si el usuario inicia sesion en otra pestana, quitar el candado sin recargar
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.tess_jwt) return;
    if (changes.tess_jwt.newValue) {
      const gate = document.getElementById('tess-session-gate');
      if (gate) gate.remove();
      initAuthFromStorage();
    } else {
      showSessionRequired();
    }
  });
}

// ============ MÓDULOS ============
// Bridge: updateStats is called by like-follow-photos.js to refresh results counter
function updateStats() {
  var el = document.getElementById('vTotal');
  if (el) el.textContent = (window.lfpStats && window.lfpStats.processed) || 0;
}


function toggleCartas() { console.log('[TESSERACT] Cartas deshabilitado'); }

// ============ RENDER STAR IDS ============
function renderStarIds() {
  const out = document.getElementById('stOutput');
  const count = document.getElementById('stCount');
  const totalLive = document.getElementById('starTotalLive');
  if (!out || !count) return;
  
  const likesCount = (collectedIds.Like || []).length;
  const followsCount = (collectedIds.Follow || []).length;
  const lfpCount = (collectedIds.LFP || []).length;
  const lfCount = likesCount + followsCount + lfpCount;
  const cartasCount = (collectedIds.Cartas || []).length;
  const totalAll = lfCount + cartasCount;
  
  const cntAll = document.getElementById('cntAll');
  const cntLF = document.getElementById('cntLF');
  const cntCartas = document.getElementById('cntCartas');
  
  if (cntAll) cntAll.textContent = totalAll;
  if (cntLF) cntLF.textContent = lfCount;

  if (cntCartas) cntCartas.textContent = cartasCount;
  // Indicador LIVE con pulso cuando hay barrido activo
  const anyActive = likesActive || followsActive || cartasActive;
  if (totalLive) totalLive.innerHTML = anyActive
    ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#4CAF50;margin-right:5px;animation:blink 1s infinite;"></span>${totalAll} IDs capturados`
    : `${totalAll} IDs capturados`;
  
  let ids = [];
  if (currentStarFilter === 'all') {
    ['Like', 'Follow', 'LFP', 'Cartas'].forEach(t => {
      (collectedIds[t] || []).forEach(id => ids.push({ id: id, type: t }));
    });
  } else if (currentStarFilter === 'L+F') {
    ['Like', 'Follow', 'LFP'].forEach(t => {
      (collectedIds[t] || []).forEach(id => ids.push({ id: id, type: t }));
    });
  } else {
    (collectedIds[currentStarFilter] || []).forEach(id => ids.push({ id: id, type: currentStarFilter }));
  }
  
  count.textContent = 'TOTAL: ' + ids.length + ' IDs';
  
  if (ids.length === 0) {
    out.innerHTML = '<div class="idhdr"><span>#</span><span>ID CLIENTE</span><span>BARRIDO</span></div><div class="empty">⭐ SIN IDs DE "' + currentStarFilter.toUpperCase() + '"<br><small>Ejecuta un barrido para recolectar IDs</small></div>';
    return;
  }
  
  // Scroll al último si se agregó un nuevo ID (cuando estamos en la parte baja)
  const wasAtBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 10;

  out.innerHTML = '<div class="idhdr"><span>#</span><span>ID CLIENTE</span><span>BARRIDO</span></div>' +
    ids.map((item, i) => `
    <div class="idrow">
      <span class="idnum">${String(i + 1).padStart(3, '0')}</span>
      <span class="idval">${item.id}</span>
      <span class="idtag ${item.type}">${item.type}</span>
    </div>`).join('');

  // Auto-scroll al último ID si el usuario ya estaba al fondo
  if (wasAtBottom) out.scrollTop = out.scrollHeight;
}

// ============ CONFIGURACIONES ============

function openCartasConfig() {
  document.getElementById('cartaText').value = cartaMessages.join('\n---\n');
  document.getElementById('cartasModal').style.display = 'block';
}

function saveCartasConfig() {
  const raw = document.getElementById('cartaText').value.trim();
  if (raw) {
    cartaMessages = raw.split('---').map(m => m.trim()).filter(m => m.length > 0);
  }
  if (!cartaMessages.length) cartaMessages = ['Querido/a amigo/a, me encantaría conocerte mejor.'];
  document.getElementById('cartasModal').style.display = 'none';
  saveAllStates();
}

// ============ MAIL CRIBS UI ============
function updateMailCribsUI() {
  const cfg = window._getMailCribsConfig ? window._getMailCribsConfig() : null;
  if (!cfg) return;
  const toggle = document.getElementById('btnToggleMailCribs');
  const status = document.getElementById('mcStatusInline');
  if (toggle) toggle.checked = cfg.enabled || false;
  if (status) {
    status.textContent = cfg.enabled ? 'ACTIVO' : 'INACTIVO';
    status.style.color = cfg.enabled ? '#4CAF50' : '#666';
  }
}

// ============ UTILIDADES ============
function clearIDs() {
  if (!Object.values(collectedIds).some(arr => arr.length > 0)) return;
  Tesseract.clearIds();
  collectedIds = Tesseract.get('collectedIds');
  renderStarIds();
  saveAllStates();
  console.log('[STAR-TOOLS] 🧹 IDs limpiados');
}

function collectFilteredIds() {
  var ids = [];
  if (currentStarFilter === 'all') {
    ['Like', 'Follow', 'LFP', 'Cartas'].forEach(function (t) { (collectedIds[t] || []).forEach(function (id) { ids.push({id:id,t:t}); }); });
  } else if (currentStarFilter === 'L+F') {
    ['Like', 'Follow', 'LFP'].forEach(function (t) { (collectedIds[t] || []).forEach(function (id) { ids.push({id:id,t:t}); }); });
  } else {
    (collectedIds[currentStarFilter] || []).forEach(function (id) { ids.push({id:id,t:currentStarFilter}); });
  }
  return ids;
}

function exportIDs() {
  var items = collectFilteredIds();
  if (!items.length) { alert('No hay IDs para exportar.'); return; }
  var lines = items.map(function (item) { return String(item.id).replace(/^0+/, ''); });
  var now = new Date();
  var ts = now.toISOString().slice(0,19).replace('T','_').replace(/:/g,'-');
  var BOM = '\uFEFF';
  var csv = BOM + lines.join('\r\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tesseract_ids_' + ts + '.csv';
  a.click();
  console.log('[STAR-TOOLS] Exportados', items.length, 'IDs');
}

function copyIDs() {
  var items = collectFilteredIds();
  if (!items.length) return;
  var lines = items.map(function (item) { return String(item.id).replace(/^0+/, ''); });
  navigator.clipboard.writeText(lines.join('\n'));
}

// ============ SINCRONIZACIÓN PERIÓDICA CON SERVIDOR ============
let periodicSyncInterval = null;

async function tryRefreshToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['tess_refresh'], async data => {
      if (!data.tess_refresh) return resolve(false);
      try {
        var res = await fetch(`${TESSERACT_API}/api/tess/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: data.tess_refresh })
        });
        if (!res.ok) {
          chrome.storage.local.remove(['tess_jwt', 'tess_refresh']);
          if (typeof showSessionRequired === 'function') showSessionRequired();
          return resolve(false);
        }
        var json = await res.json();
        await chrome.storage.local.set({ tess_jwt: json.token, tess_refresh: json.refreshToken });
        resolve(true);
      } catch (e) { resolve(false); }
    });
  });
}

function startPeriodicSync() {
  if (periodicSyncInterval) clearInterval(periodicSyncInterval);
  periodicSyncInterval = setInterval(async () => {
    if (!isAuthenticated || !currentUser) return;
    const totalSweeps = (collectedIds.Like?.length || 0) +
                        (collectedIds.Follow?.length || 0) +
                        (collectedIds.LFP?.length || 0) +
                        (collectedIds.Cartas?.length || 0);

    // Guardar stats localmente (sin servidor)
    try {
      chrome.storage.local.set({ tess_stats: botStats, tess_ids: collectedIds, tess_lastSync: Date.now() }).catch(function () {});
    } catch (e) {}

    // Heartbeat local
    try {
      chrome.storage.local.set({ tess_heartbeat: Date.now() }).catch(function () {});
    } catch (e) {}

    // También guardar local como respaldo
    try {
      chrome.storage.local.set({
        tess_heartbeat: Date.now(),
        bot_connected_user: currentUser,
        tess_stats: botStats,
        tess_ids: collectedIds,
        bot_likesGiven: botStats.likesGiven,
        bot_followsGiven: botStats.followsGiven,
        bot_cartasSent: botStats.cartasSent,
        bot_sweepCount: totalSweeps,
      bot_repliesReceived: botStats.repliesReceived,
      bot_repliesResponded: botStats.repliesResponded,
      bot_idsLikes: collectedIds.Like?.length || 0,
      bot_idsFollows: collectedIds.Follow?.length || 0,
      bot_idsCartas: collectedIds.Cartas?.length || 0,
      user_email: currentUser
    });
    } catch (e) {};
    updateStats();
  }, 10000);
}

// ============ SMART MAILING TAB UI ============
async function startCartaMailing() {
  var btn = document.getElementById('btnStartCarta');
  var progressEl = document.getElementById('mlCartaProgress');
  if (!progressEl) return;
  progressEl.style.display = 'block';
  progressEl.textContent = 'Preparando envio de cartas...';
  progressEl.style.color = '#8b5cf6';

  if (btn) {
    btn.textContent = '⏹ DETENER ENVIO';
    btn.style.background = '#dc2626';
    btn.style.borderColor = '#dc2626';
    btn._mailingActive = true;
  }

  window._mlProgressCallback = function(text) {
    if (progressEl) progressEl.textContent = text;
  };

  var originalMaxDaily = null;
  var originalRespectQuiet = null;
  try {
    if (typeof window._loadMailingConfigDirect === 'function') await window._loadMailingConfigDirect();
    var cfg = typeof window._getMailingConfigDirect === 'function' ? window._getMailingConfigDirect() : null;
    if (!cfg) { progressEl.textContent = 'Error: config no disponible'; progressEl.style.color = '#dc2626'; window._mlProgressCallback = null; if (btn) { btn.textContent = '📨 INICIAR ENVIO DE CARTAS'; btn.style.background = '#059669'; btn.style.borderColor = '#059669'; btn._mailingActive = false; } return; }
    // Guardar y desactivar el limite diario para procesar todas las paginas
    originalMaxDaily = cfg.maxDaily;
    originalRespectQuiet = cfg.respectQuietHours;
    cfg.maxDaily = 99999;
    cfg.respectQuietHours = false;
    cfg.enabled = true;
    if (typeof window._saveMailingConfigDirect === 'function') await window._saveMailingConfigDirect();
    if (typeof window._setMailingState === 'function') await window._setMailingState(true);

    var result;
    if (typeof window._executeMailingRound === 'function') {
      result = await window._executeMailingRound();
    } else {
      progressEl.textContent = 'Error: modulo mailing no disponible';
      progressEl.style.color = '#dc2626';
      window._mlProgressCallback = null;
      if (btn) { btn.textContent = '📨 INICIAR ENVIO DE CARTAS'; btn.style.background = '#059669'; btn.style.borderColor = '#059669'; btn._mailingActive = false; }
      return;
    }
    if (result) {
      var aborted = window._getMailingAbortState ? window._getMailingAbortState() : false;
      var msg = aborted ? '🛑 Detenido por usuario. ' : 'Completado: ';
      msg += result.sent + ' cartas enviadas';
      if (result.total > 0) msg += ' (' + result.total + ' contactos escaneados';
      if (result.blacklisted > 0) msg += ', ' + result.blacklisted + ' blacklist';
      if (result.activeSkipped > 0) msg += ', ' + result.activeSkipped + ' dialogo activo';
      if (result.skipped > 0) msg += ', ' + result.skipped + ' saltados';
      if (result.total > 0) msg += ')';
      progressEl.textContent = msg;
      progressEl.style.color = result.sent > 0 ? '#4CAF50' : '#f59e0b';
    } else {
      progressEl.textContent = 'Error al ejecutar envio';
      progressEl.style.color = '#dc2626';
    }
    if (typeof updateMLTabUI === 'function') updateMLTabUI();
  } catch (e) {
    progressEl.textContent = 'Error: ' + (e.message || 'desconocido');
    progressEl.style.color = '#dc2626';
  }
  // Restaurar valores originales de configuracion
  if (typeof window._getMailingConfigDirect === 'function') {
    var restored = window._getMailingConfigDirect();
    if (restored) {
      if (originalMaxDaily !== null) restored.maxDaily = originalMaxDaily;
      if (originalRespectQuiet !== null) restored.respectQuietHours = originalRespectQuiet;
      if (typeof window._saveMailingConfigDirect === 'function') window._saveMailingConfigDirect();
    }
  }
  window._mlProgressCallback = null;
  if (btn) {
    btn.textContent = '📨 INICIAR ENVIO DE CARTAS';
    btn.style.background = '#059669';
    btn.style.borderColor = '#059669';
    btn._mailingActive = false;
  }
  setTimeout(function() {
    if (progressEl) { progressEl.style.display = 'none'; }
  }, 15000);
}

function updateMLTabUI() {
  var cfg = typeof getMailingConfig === 'function' ? getMailingConfig() : null;
  if (!cfg && typeof window._getMailingConfigDirect === 'function') {
    cfg = window._getMailingConfigDirect();
  }
  if (!cfg) return;

  document.getElementById('mlStatusInline').textContent = cfg.enabled ? 'ACTIVO' : 'INACTIVO';
  document.getElementById('mlStatusInline').style.color = cfg.enabled ? '#4CAF50' : '#666';

  document.getElementById('mlSentTodayInline').textContent = cfg.sentToday || 0;
  document.getElementById('mlDailyLimitInline').textContent = cfg.maxDaily || 30;
  document.getElementById('mlIntervalDisplay').textContent = (cfg.delay?.min ? Math.floor(cfg.delay.min / 1000) + '-' + Math.floor(cfg.delay.max / 1000) + 's' : '3-7s');

  const preview = (cfg.messageTemplate || '').slice(0, 40);
  document.getElementById('mlMsgPreview').textContent = preview + (preview.length >= 40 ? '...' : '');

  const stats = typeof window._getMailingStats === 'function' ? window._getMailingStats() : null;
  document.getElementById('mlQueueCountInline').textContent = stats?.lastScrapedCount ?? '--';
}
window._updateMLTabUI = updateMLTabUI;

function updateMLContactList() {
  const container = document.getElementById('mlContactList');
  if (!container) return;
  const scrapeFn = typeof window._scrapeActiveLimitsIds === 'function' ? window._scrapeActiveLimitsIds : null;
  if (!scrapeFn) { container.innerHTML = '<div style="padding:12px;text-align:center;color:#888;font-size:10px;">Smart Mailing no disponible</div>'; container.style.display = 'block'; return; }
  const contacts = scrapeFn();
  if (!contacts || contacts.length === 0) {
    container.innerHTML = '<div style="padding:12px;text-align:center;color:#888;font-size:10px;">Sin contactos disponibles. Asegúrate de estar en Active Limits.</div>';
    container.style.display = 'block';
    document.getElementById('mlQueueCountInline').textContent = '0';
    return;
  }
  const typeLabels = { active: '💬 ACTIVO', recurring: '🔄 RECURRENTE', new: '🆕 NUEVO' };
  const typeColors = { active: '#f59e0b', recurring: '#3b82f6', new: '#22c55e' };
  var isBlocked = typeof window._isInMLBlacklist === 'function' ? function(id) { return window._isInMLBlacklist(id); } : function(id) { return blacklist.includes(String(id)); };
  let html = '<div style="font-size:9px;color:#888;padding:6px 8px;border-bottom:1px solid #e0e0e8;font-weight:600;">CONTACTOS (' + contacts.length + ')</div>';
  contacts.forEach(function (c) {
    var blocked = isBlocked(c.id);
    var label = blocked ? '🚫 BLOQUEADO' : (typeLabels[c.contactType] || '🆕 NUEVO');
    var color = blocked ? '#dc2626' : (typeColors[c.contactType] || '#22c55e');
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-bottom:1px solid #f0f0f5;font-size:10px;' + (blocked ? 'opacity:0.5;text-decoration:line-through;' : '') + '">';
    html += '<span style="color:#1a1a2e;font-weight:500;">#' + c.id + '</span>';
    html += '<span style="font-size:8px;padding:2px 6px;border-radius:4px;background:' + color + '20;color:' + color + ';font-weight:600;">' + label + '</span>';
    html += '</div>';
  });
  container.innerHTML = html;
  container.style.display = 'block';
  document.getElementById('mlQueueCountInline').textContent = contacts.length;
}

// ============ STORAGE ============
async function saveAllStates() {
  await chrome.storage.local.set({
    tess_auth: isAuthenticated, tess_user: currentUser,
    tess_eater: eaterActive, tess_likes: likesActive, tess_follows: followsActive,
    tess_cartas: cartasActive,
    tess_stats: botStats, tess_ids: collectedIds,
    bot_likesGiven: botStats.likesGiven,
    bot_followsGiven: botStats.followsGiven,
    bot_sweepCount: (collectedIds.Like?.length || 0) + (collectedIds.Follow?.length || 0) + (collectedIds.LFP?.length || 0),
    bot_idsLikes: collectedIds.Like?.length || 0,
    bot_idsFollows: collectedIds.Follow?.length || 0
  });
}

async function loadAllStates() {
  try {
    const r = await chrome.storage.local.get([
      'tess_auth', 'tess_user', 'tess_jwt', 'user_email', 'tess_eater', 'tess_likes', 'tess_follows',
      'tess_cartas', 'tess_stats', 'tess_ids'
    ]);
    if (r.tess_jwt) {
      isAuthenticated = Tesseract.set('isAuthenticated', true);
      currentUser = Tesseract.set('currentUser', r.tess_user || r.user_email || 'agent@tesseract.com');
      document.getElementById('currentUserDisplay').textContent = currentUser;
    }
    if (r.tess_eater) {
      eaterActive = Tesseract.set('eaterActive', true);
      const btn = document.getElementById('btnEaterToggle');
      if (btn) { btn.textContent = '🧠 EATER: ON'; btn.className = 'eater-btn on'; }
      document.getElementById('eaterSuggestions').style.display = 'block';
    }
    if (r.tess_ids) { collectedIds = Tesseract.get('collectedIds'); Object.keys(collectedIds).forEach(function (k) { delete collectedIds[k]; }); Object.assign(collectedIds, r.tess_ids); }
    if (r.tess_stats) { Object.assign(botStats, r.tess_stats); }

    if (r.tess_carta_msg) {
      if (typeof r.tess_carta_msg === 'string') {
        cartaMessages.length = 0; cartaMessages.push(r.tess_carta_msg);
      } else if (Array.isArray(r.tess_carta_msg)) {
        cartaMessages.length = 0; r.tess_carta_msg.forEach(function (m) { cartaMessages.push(m); });
      }
    }
    updateStats();
    renderStarIds();
  } catch (e) { console.error('[TESSERACT] Error cargando:', e); }
}

// ============ SINC MÉTRICAS CON SERVIDOR ============
async function syncMetricsToStorage(action, count) {
  try {
    console.log('[TESSERACT] syncMetricsToStorage:', action, count);

    // Obtener la oficina del usuario
    const userData = await new Promise(r => chrome.storage.local.get(['user_office', 'tess_user'], d => r(d)));
    const userOffice = userData.user_office || null;

    // Enviar al servidor
    try {
      const token = await new Promise(r => chrome.storage.local.get('tess_jwt', d => r(d.tess_jwt)));
      if (token) {
        const res = await fetch(`${TESSERACT_API}/api/tess/metrics/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            stats: botStats,
            collectedIds: collectedIds,
            action: action,
            count: count || 1,
            office: userOffice
          })
        });
        if (res.status === 401) {
          console.warn('[TESS] Token expirado en syncMetricsToStorage');
          var refreshed = await tryRefreshToken();
          if (!refreshed) chrome.storage.local.remove(['tess_jwt', 'tess_refresh']);
        } else if (!res.ok) {
          console.warn('[TESS] syncMetricsToStorage server error:', res.status);
        }
      } else {
        console.warn('[TESS] No hay token para sync');
      }
    } catch (e) {
      console.warn('[TESSERACT] Server sync failed (offline?):', e.message);
    }

    // También guardar local como respaldo
    const totalSweeps = (collectedIds.Like?.length || 0) +
                        (collectedIds.Follow?.length || 0) +
                        (collectedIds.LFP?.length || 0) +
                        (collectedIds.Cartas?.length || 0);

    const botLog = {
      action: action + (count ? ': ' + count + ' procesados' : ' completado'),
      timestamp: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      email: currentUser || 'unknown'
    };

    const botData = await chrome.storage.local.get(['bot_activity_log']);
    const botLogArr = botData.bot_activity_log || [];
    botLogArr.push(botLog);
    if (botLogArr.length > 5000) botLogArr.splice(0, botLogArr.length - 5000);

    if (typeof window._tessServerSync !== 'undefined') window._tessServerSync.activityLog(botLog);

    await chrome.storage.local.set({
      bot_activity_log: botLogArr,
      tess_stats: botStats,
      tess_ids: collectedIds,
      bot_likesGiven: botStats.likesGiven,
      bot_followsGiven: botStats.followsGiven,
      bot_cartasSent: botStats.cartasSent,
      bot_sweepCount: totalSweeps,
      tess_last_action: { action, count, timestamp: Date.now(), email: currentUser }
    });

    console.log('[TESSERACT] sync OK:', action, count);
  } catch (e) {
    console.error('[TESSERACT] sync error:', e);
  }
}

// ============ INICIAR ============
console.log('[TESSERACT] 🚀 Script cargado, iniciando en 1s...');

var _safeInitRetries = 0;
var SAFE_INIT_MAX_RETRIES = 20;

function safeInit() {
  if (document.body) {
    console.log('[TESSERACT] 📄 Body disponible, ejecutando...');
    setTimeout(initTesseract, 1000);
  } else {
    _safeInitRetries++;
    if (_safeInitRetries >= SAFE_INIT_MAX_RETRIES) {
      console.error('[TESSERACT] ❌ Body no disponible tras ' + SAFE_INIT_MAX_RETRIES + ' intentos');
      return;
    }
    console.log('[TESSERACT] ⏳ Esperando body... (intento ' + _safeInitRetries + '/' + SAFE_INIT_MAX_RETRIES + ')');
    setTimeout(safeInit, 500);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    safeInit();
  });
} else {
  safeInit();
}

// ============ MENSAJES v3: ESTILO WHATSAPP (SOPORTE + CHAT PRIVADO) ============
(function initSupportChat() {
  const TAPI = 'https://tesseract-v3-production.up.railway.app';
  const ADMIN_PEER = 'ADMIN';
  const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😜','😎','🤩','😏','🙂','🙃','😉','😇','🥰','😭','😅','🥺','😢','😡','🤔','🤗','🤫','🙌','👏','👍','👎','💪','🙏','💯','🔥','✨','⭐','❤️','💔','🌹','🌸','🍀','🎉','☕','🍕','⚽','🚀','💤','🤑','👀'];
  let myEmail = '';
  let activePeer = ADMIN_PEER;
  let lastTsBy = {};
  let fails = 0;
  let unreadTotal = 0;
  let contactsCache = [];
  const mediaCache = {};

  function els() {
    return {
      msgs: document.getElementById('opChatMsgs'),
      input: document.getElementById('opChatInput'),
      sendBtn: document.getElementById('btnOpChatSend'),
      peerSel: document.getElementById('opChatPeer'),
      refreshBtn: document.getElementById('btnOpChatRefresh'),
      clearBtn: document.getElementById('btnOpChatClear'),
      attachBtn: document.getElementById('btnOpChatAttach'),
      fileInput: document.getElementById('opChatFile'),
      emojiBtn: document.getElementById('btnOpChatEmoji'),
      emojiBar: document.getElementById('opEmojiBar'),
      who: document.getElementById('opChatWho'),
      tabBtn: document.querySelector('.tab-btn[data-tab="soporte"]')
    };
  }

  async function stGet(keys) { return new Promise(r => chrome.storage.local.get(keys, d => r(d))); }
  async function jwt() { try { return (await stGet(['tess_jwt'])).tess_jwt || ''; } catch (e) { return ''; } }
  async function ensureToken() {
    let t = await jwt();
    if (t) return t;
    if (typeof tryRefreshToken === 'function') { if (await tryRefreshToken()) t = await jwt(); }
    return t;
  }
  function updateBadge() {
    const t = els().tabBtn;
    if (!t) return;
    t.textContent = unreadTotal > 0 ? '💬 MENSAJES (' + unreadTotal + ')' : '💬 MENSAJES';
  }
  function qs(peer, after) {
    const p = [];
    if (peer !== ADMIN_PEER) p.push('with=' + encodeURIComponent(peer));
    if (after) p.push('after=' + after);
    return '/api/tess/chat/messages' + (p.length ? '?' + p.join('&') : '');
  }
  async function api(path) {
    const token = await ensureToken();
    if (!token) throw new Error('sin-sesion');
    const res = await fetch(TAPI + path, { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.status === 401 && typeof tryRefreshToken === 'function') {
      if (await tryRefreshToken()) return api(path);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  function labelFor(email, name, online, unread) {
    let l = email === ADMIN_PEER ? '🛡 SOPORTE' : ((name || email.split('@')[0]) + (online ? ' ●' : ''));
    if (unread > 0) l += ' (' + unread + ')';
    return l;
  }
  function escAttr(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function clearEmpty(box) { const e = box.querySelector('.wa-empty'); if (e) e.remove(); }
  function ticks(m, mine) {
    if (!mine) return '';
    return m.read ? '<span style="color:#53bdeb;">✓✓</span>' : '<span style="color:#8696a0;">✓</span>';
  }


  function appendMediaImg(div, m) {
    const img = document.createElement('img');
    img.className = 'wa-img';
    div.appendChild(img);
    const mid = String(m.mediaId);
    if (mediaCache[mid]) { img.src = mediaCache[mid]; wireOpen(img); return; }
    api('/api/tess/chat/media/' + mid).then(d => {
      const url = 'data:' + d.mime + ';base64,' + d.data;
      mediaCache[mid] = url;
      img.src = url;
      wireOpen(img);
    }).catch(() => { img.alt = 'imagen no disponible'; });
    function wireOpen(i) {
      i.onclick = () => {
        const w = window.open();
        if (w && i.src) w.document.write('<img src="' + i.src + '" style="max-width:100%">');
      };
    }
  }

  function renderMsg(m) {
    const box = els().msgs;
    if (!box) return;
    clearEmpty(box);
    const mine = m.from === myEmail;
    const div = document.createElement('div');
    div.className = 'wa-b ' + (mine ? 'wa-me' : 'wa-you');
    if (m.kind === 'image' && m.mediaId) {
      appendMediaImg(div, m);
      if (m.text) { const c = document.createElement('div'); c.textContent = m.text; div.appendChild(c); }
    } else {
      div.textContent = (activePeer === ADMIN_PEER && !mine ? '🛡 ' : '') + (m.text || '');
    }
    const meta = document.createElement('span');
    meta.className = 'wa-t';
    meta.innerHTML = new Date(m.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) + ' ' + ticks(m, mine);
    div.appendChild(meta);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function sessionNotice() {
    const box = els().msgs;
    if (!box) return;
    box.innerHTML = '<div class="wa-empty" style="margin:auto;color:#f59e0b;font-size:11px;text-align:center;padding:10px;">Tu sesión expiró.<br>Vuelve a iniciar sesión.<br><button id="opChatRelog" style="margin-top:8px;background:#f59e0b;border:none;color:#000;font-weight:700;font-size:11px;padding:6px 14px;border-radius:6px;cursor:pointer;">INICIAR SESIÓN</button></div>';
    const b = document.getElementById('opChatRelog');
    if (b) b.addEventListener('click', () => {
      window.open(chrome.runtime.getURL('dist/pages/login/login.html'), '_blank');
      showTessToast('Inicia sesión y recarga la página de Talkytimes', 'info');
    });
  }

  async function openPeer(peer) {
    activePeer = peer || ADMIN_PEER;
    lastTsBy[activePeer] = 0;
    fails = 0;
    const box = els().msgs;
    if (box) box.innerHTML = '<div class="wa-empty" style="margin:auto;color:#555;font-size:10px;">Cargando…</div>';
    updateWho();
    await pollActive(true);
  }

  async function pollActive(full) {
    let data;
    try { data = await api(qs(activePeer, full ? 0 : (lastTsBy[activePeer] || 0))); fails = 0; }
    catch (e) {
      if (e.message === 'sin-sesion' && full) sessionNotice();
      else {
        fails++;
        if (fails >= 3 && !full) { lastTsBy[activePeer] = 0; fails = 0; return pollActive(true); }
      }
      return;
    }
    const msgs = data.messages || [];
    const box = els().msgs;
    if (full && box) box.innerHTML = '';
    if (!msgs.length && full && box) {
      box.innerHTML = '<div class="wa-empty" style="margin:auto;color:#666;font-size:10px;text-align:center;">Aún no hay mensajes. Escribe el primero 👋</div>';
      return;
    }
    for (const m of msgs) {
      try { renderMsg(m); } catch (e) {
        if (full && box) { const d = document.createElement('div'); d.style.cssText = 'color:#f87171;font-size:10px;text-align:center;'; d.textContent = '⚠ Error al pintar mensaje: ' + e.message; box.appendChild(d); }
      }
      lastTsBy[activePeer] = Math.max(lastTsBy[activePeer] || 0, m.ts);
    }
    if (msgs.length && !full) loadMyThreads();
  }

  async function post(payload, image) {
    const token = await ensureToken();
    if (!token) { sessionNotice(); showTessToast('Sesión expirada — inicia sesión de nuevo', 'error'); return null; }
    try {
      const res = await fetch(TAPI + '/api/tess/chat/' + (image ? 'send-image' : 'send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showTessToast('⚠ Mensajes: ' + (data.error || ('Error ' + res.status)), 'error'); return null; }
      return data.message;
    } catch (e) { showTessToast('⚠ Sin conexión con el servidor', 'error'); return null; }
  }

  async function sendText() {
    const input = els().input;
    const text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    const payload = activePeer === ADMIN_PEER ? { text } : { to: activePeer, text };
    const msg = await post(payload, false);
    if (msg) { renderMsg(msg); lastTsBy[activePeer] = Math.max(lastTsBy[activePeer] || 0, msg.ts); }
    else input.value = text;
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (file.type === 'image/gif' && file.size <= 1500000) {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(file);
        return;
      }
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const max = 1280;
          let w = im.width, h = im.height;
          if (w > max || h > max) { const k = Math.min(max / w, max / h); w = Math.round(w * k); h = Math.round(h * k); }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(im, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.82));
        };
        im.onerror = reject;
        im.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function sendImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { showTessToast('Solo se permiten imágenes', 'error'); return; }
    showTessToast('Enviando imagen…', 'info');
    let dataUrl;
    try { dataUrl = await compressImage(file); } catch (e) { showTessToast('No se pudo procesar la imagen', 'error'); return; }
    const payload = activePeer === ADMIN_PEER ? { dataUrl } : { to: activePeer, dataUrl };
    const msg = await post(payload, true);
    if (msg) { renderMsg(msg); lastTsBy[activePeer] = Math.max(lastTsBy[activePeer] || 0, msg.ts); }
  }

  function buildEmojiBar() {
    const bar = els().emojiBar;
    if (!bar || bar.dataset.built) return;
    EMOJIS.forEach(em => {
      const b = document.createElement('button');
      b.className = 'wa-emoji';
      b.type = 'button';
      b.textContent = em;
      b.addEventListener('click', () => { els().input.value += em; els().input.focus(); });
      bar.appendChild(b);
    });
    bar.dataset.built = '1';
  }

  let unreadBy = {};

  function updateWho() {
    const w = els().who;
    if (!w) return;
    const c = contactsCache.find(x => x.email === activePeer);
    const name = activePeer === ADMIN_PEER ? '🛡 SOPORTE' : (c ? (c.name || c.email.split('@')[0]) : activePeer.split('@')[0]);
    w.textContent = name + (c && c.online ? ' ●' : '');
  }

  function renderPeerSelect() {
    const sel = els().peerSel;
    if (!sel) return;
    const prev = sel.value;
    const opts = [{ v: ADMIN_PEER, l: labelFor(ADMIN_PEER, null, true, unreadBy[ADMIN_PEER] || 0) }]
      .concat(contactsCache.map(c => ({
        v: c.email,
        l: labelFor(c.email, (c.name || c.email.split('@')[0]) + (c.pending ? ' (pendiente)' : ''), c.online, unreadBy[c.email] || 0)
      })));
    sel.innerHTML = opts.map(o => '<option value="' + escAttr(o.v) + '">' + escAttr(o.l) + '</option>').join('');
    for (const o of sel.options) { if (o.value === prev) { sel.value = prev; break; } }
    updateWho();
  }

  async function loadContacts() {
    const d = await api('/api/tess/chat/contacts');
    contactsCache = d.contacts || [];
    renderPeerSelect();
  }

  async function loadMyThreads() {
    const d = await api('/api/tess/chat/my-threads');
    const list = d.threads || [];
    unreadBy = {};
    let total = 0;
    for (const t of list) { unreadBy[t.email] = t.unread || 0; total += t.unread || 0; }
    unreadTotal = total;
    updateBadge();
    renderPeerSelect();
  }

  window._startSupportChat = function () {
    loadContacts();
    loadMyThreads();
    pollActive(true);
  };

  const bootTimer = setInterval(() => {
    const e = els();
    if (!(e.input && e.sendBtn && e.peerSel)) return;
    e.sendBtn.addEventListener('click', sendText);
    e.input.addEventListener('keypress', ev => { if (ev.key === 'Enter') sendText(); });
    e.peerSel.addEventListener('change', () => openPeer(e.peerSel.value));
    e.refreshBtn.addEventListener('click', async () => {
      e.refreshBtn.textContent = '⋯';
      try { await loadContacts(); await loadMyThreads(); await openPeer(activePeer); }
      finally { e.refreshBtn.textContent = '⟳'; }
    });
    e.attachBtn.addEventListener('click', () => e.fileInput.click());
    e.fileInput.addEventListener('change', () => { if (e.fileInput.files[0]) sendImage(e.fileInput.files[0]); e.fileInput.value = ''; });
    e.emojiBtn.addEventListener('click', () => { buildEmojiBar(); e.emojiBar.style.display = e.emojiBar.style.display === 'none' ? 'flex' : 'none'; });
    clearInterval(bootTimer);
  }, 1500);

  setInterval(() => { if (document.getElementById('tesseract-main-panel')) pollActive(false).catch(() => {}); }, 5000);
  setInterval(() => {
    if (!document.getElementById('tesseract-main-panel')) return;
    loadMyThreads().catch(() => {});
    if (Math.floor(Date.now() / 60000) % 3 === 0) loadContacts().catch(() => {});
  }, 15000);

  // LIMPIAR CHAT: delegacion a nivel documento, inmune a recreacion del panel y al timing de boot
  let clearArmed = 0;
  document.addEventListener('click', async ev => {
    const t = ev.target;
    const b = t && t.closest ? t.closest('#btnOpChatClear') : null;
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    console.debug('[TESSERACT] limpiar chat click');
    if (Date.now() - clearArmed > 3500) {
      clearArmed = Date.now();
      b.textContent = '⚠';
      b.style.background = '#7f1d1d';
      b.title = 'Haz clic de nuevo para CONFIRMAR el borrado total';
      setTimeout(() => { if (Date.now() - clearArmed >= 3400) { clearArmed = 0; b.textContent = '🧹'; b.style.background = '#16162a'; b.title = 'Borrar TODO el historial de esta conversación'; } }, 3600);
      return;
    }
    clearArmed = 0;
    b.textContent = '🧹';
    b.style.background = '#16162a';
    const token = await ensureToken();
    if (!token) { sessionNotice(); return; }
    try {
      const res = await fetch(TAPI + '/api/tess/chat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ with: activePeer === ADMIN_PEER ? '' : activePeer })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showTessToast('No se pudo eliminar (' + res.status + ')', 'error'); return; }
      lastTsBy[activePeer] = 0;
      const box = els().msgs;
      if (box) box.innerHTML = '<div class="wa-empty" style="margin:auto;color:#666;font-size:10px;text-align:center;">Historial eliminado 🧹</div>';
      loadMyThreads().catch(() => {});
      showTessToast('Conversación eliminada (' + (data.deleted || 0) + ' mensajes)', 'info');
      console.debug('[TESSERACT] historial borrado:', data.deleted, 'media:', data.media);
    } catch (err) { showTessToast('Sin conexión al eliminar', 'error'); }
  });

  stGet(['user_email', 'tess_user']).then(d => {
    myEmail = (d.user_email && String(d.user_email).includes('@')) ? d.user_email : (d.tess_user && String(d.tess_user).includes('@') ? d.tess_user : '');
  });
})();
