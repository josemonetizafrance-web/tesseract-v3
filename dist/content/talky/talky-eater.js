// TESSERACT - Módulo EATER (IA + Chat Watcher + Timer + Perfil Activo)

// Shared state from state-manager
var isAuthenticated = Tesseract.get('isAuthenticated');
var eaterActive = Tesseract.get('eaterActive');
var clonacionActiva = Tesseract.get('clonacionActiva');
var eaterResponse = Tesseract.get('eaterResponse');
var isUsingAI = Tesseract.get('isUsingAI');
var _processedTexts = Tesseract.get('_processedTexts');
var _responseTimers = Tesseract.get('_responseTimers');
var currentClientName = Tesseract.get('currentClientName');
var currentUser = Tesseract.get('currentUser');
var clientDetectedLang = Tesseract.get('clientDetectedLang');
var selectedLangCode = Tesseract.get('selectedLangCode');
var translateLanguages = Tesseract.get('translateLanguages');
var botStats = Tesseract.get('botStats');
var TESSERACT_API = Tesseract.API;

// ============ TOGGLE EATER ============
function toggleEater() {
  if (typeof isAuthenticated !== 'undefined' && !isAuthenticated) return;
  eaterActive = Tesseract.set('eaterActive', !eaterActive);
  var btn = document.getElementById('btnEaterToggle');
  if (!btn) return;
  btn.textContent = '🧠 EATER: ' + (eaterActive ? 'ON' : 'OFF');
  btn.className = 'eater-btn' + (eaterActive ? ' on' : '');
  document.getElementById('eaterSuggestions').style.display = eaterActive ? 'block' : 'none';
  if (eaterActive) { _processedTexts.clear(); setTimeout(scanAllIncomingMessages, 500); }
  Tesseract.broadcast('STATE_SYNC', { eaterActive: Tesseract.get('eaterActive'), clonacionActiva: Tesseract.get('clonacionActiva') });
}

function toggleClonacion() {
  if (typeof isAuthenticated !== 'undefined' && !isAuthenticated) return;
  clonacionActiva = Tesseract.set('clonacionActiva', !clonacionActiva);
  var btn = document.getElementById('btnStopClone');
  if (!btn) return;
  if (clonacionActiva) {
    btn.innerHTML = '⏹ CLONACIÓN: ACTIVA';
    btn.style.borderColor = '#ef4444';
    btn.style.background = 'rgba(239,68,68,0.15)';
    btn.style.color = '#ef4444';
    showTessToast('🎭 Captura de estilo ACTIVADA', 'success');
  } else {
    btn.innerHTML = '▶ CLONACIÓN: DETENIDA';
    btn.style.borderColor = '#22c55e';
    btn.style.background = 'rgba(34,197,94,0.15)';
    btn.style.color = '#22c55e';
    showTessToast('⏸ Captura de estilo DETENIDA', 'warning');
  }
  Tesseract.broadcast('STATE_SYNC', { clonacionActiva: Tesseract.get('clonacionActiva') });
}

function copyEaterResponseToChat() {
  if (typeof isAuthenticated !== 'undefined' && !isAuthenticated) return;
  if (typeof eaterActive !== 'undefined' && !eaterActive) return;
  // MULTI: copiar el cuadro enfocado, o el primero no vacio
  var mFocus = (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('tess-multi-box')) ? document.activeElement : null;
  if (mFocus && mFocus.value && mFocus.value !== '🤖 Generando...') {
    copyToChatInput(mFocus.value);
    mFocus.style.borderColor = '#4CAF50';
    setTimeout(function () { mFocus.style.borderColor = '#2a2a44'; }, 800);
    return;
  }
  var mBoxes = document.querySelectorAll('#eaterMultiBoxes .tess-multi-box');
  if (mBoxes.length) {
    for (var mb = 0; mb < mBoxes.length; mb++) {
      if (mBoxes[mb].value && mBoxes[mb].value !== '🤖 Generando...') {
        copyToChatInput(mBoxes[mb].value);
        mBoxes[mb].style.borderColor = '#4CAF50';
        (function (b) { setTimeout(function () { b.style.borderColor = '#2a2a44'; }, 800); })(mBoxes[mb]);
        break;
      }
    }
    return;
  }
  const area = document.getElementById('eaterResponseArea');
  if (!area || !area.value || area.value === 'Esperando mensaje...') return;
  copyToChatInput(area.value);
  area.style.borderColor = '#4CAF50';
  setTimeout(() => area.style.borderColor = '#8b5cf6', 600);
}

// ============ RESPONSE TIMER (alerta tasa de respuesta) ============
function createTimerElement() {
  const el = document.createElement('span');
  el.className = 'tess-resp-timer';
  Object.assign(el.style, {
    fontSize: '10px',
    color: '#f59e0b',
    fontFamily: "'Orbitron',sans-serif",
    letterSpacing: '1px',
    marginLeft: '6px',
    display: 'inline-block'
  });
  return el;
}

function insertTimerInItem(convEl, timerDisplay) {
  const nameArea = convEl.querySelector(TALK_Y.DIALOG_NAME_WRAPPER);
  if (nameArea) {
    nameArea.appendChild(timerDisplay);
  } else {
    convEl.appendChild(timerDisplay);
  }
}

function startResponseTimer(convEl, clientName, afterEl) {
  if (!convEl || !clientName) return;

  stopResponseTimer(clientName);

  const startTime = Date.now();
  let _alertTriggered = false;

  const tick = () => {
    const elapsed = (Date.now() - startTime) / 1000;
    const remaining = Math.max(0, TIMER_DISPLAY_SECONDS - elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    const text = '⏱ ' + mins + ':' + (secs < 10 ? '0' : '') + secs;
    const color = remaining < 30 ? '#ef4444' : '#f59e0b';

    const item = findConversationItem(clientName);
    if (item) {
      let td = item.querySelector(TALK_Y.TIMER_ELEMENT);
      if (!td) {
        td = createTimerElement();
        insertTimerInItem(item, td);
      }
      td.textContent = text;
      td.style.color = color;
    }

    if (remaining <= 0) {
      clearInterval(timerId);
    }
  };

  const timerId = setInterval(tick, 1000);
  tick();

  _responseTimers.set(clientName, { timerId, startTime });
  bumpRespStat('repliesReceived');
}

function bumpRespStat(field) {
  try {
    const s = Tesseract.get('botStats') || {};
    s[field] = (s[field] || 0) + 1;
    Tesseract.set('botStats', s);
  } catch (e) {}
}

// Al enviar el operador un mensaje: resuelve los temporizadores pendientes como respondidas
function resolvePendingResponses() {
  if (_responseTimers.size === 0) return;
  const RESPONSE_WINDOW_MS = 120000; // dos minutos
  let changed = false;
  for (const [name, entry] of _responseTimers) {
    clearInterval(entry.timerId);
    const delta = Date.now() - entry.startTime;
    bumpRespStat('repliesResponded');
    bumpRespStat(delta <= RESPONSE_WINDOW_MS ? 'respOnTime' : 'respLate');
    _responseTimers.delete(name);
    changed = true;
  }
  document.querySelectorAll(TALK_Y.TIMER_ELEMENT).forEach(el => el.remove());
  if (changed && typeof syncMetricsToStorage === 'function') {
    try { syncMetricsToStorage('RESPONSE_TRACKED'); } catch (e) {}
  }
}

function stopResponseTimer(clientName) {
  if (clientName) {
    const entry = _responseTimers.get(clientName);
    if (entry) {
      clearInterval(entry.timerId);
      const items = document.querySelectorAll(TALK_Y.DIALOG_ITEMS);
      for (const item of items) {
        const td = item.querySelector(TALK_Y.TIMER_ELEMENT);
        if (td) td.remove();
      }
      _responseTimers.delete(clientName);
    }
    return;
  }
  for (const [name, entry] of _responseTimers) {
    clearInterval(entry.timerId);
  }
  document.querySelectorAll(TALK_Y.TIMER_ELEMENT).forEach(el => el.remove());
  _responseTimers.clear();
}

function checkForSentMessages() {
  const sentSelectors = [
    '[class*="message-sent"]', '[class*="my-message"]', '[class*="own"]',
    '[class*="bubble-right"]', '[class*="msg--sent"]', '[class*="message--own"]',
    '[class*="right-bubble"]', '.text-message.own', '[class*="msg my"]',
    '[data-test-id*="msg--sent"]'
  ];
  for (const sel of sentSelectors) {
    const sent = document.querySelectorAll(sel + ':not(.tess-checked-sent)');
    if (sent.length > 0) {
      for (const el of sent) {
        el.classList.add('tess-checked-sent');
      }
      resolvePendingResponses();
      return;
    }
  }
}

// ============ CHAT WATCHER ============
var chatWatcherObserver = null;
var msgPollInterval = null;
var titleObserver = null;
var loginObserver = null;
var urlPollInterval = null;

function startChatWatcher() {
  if (chatWatcherObserver) chatWatcherObserver.disconnect();
  if (msgPollInterval) clearInterval(msgPollInterval);
  
  chatWatcherObserver = new MutationObserver((mutations) => {
    if (!eaterActive || !isAuthenticated) return;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) checkForIncomingMessages(node);
        }
      }
    }
  });
  
  const chatContainer = document.querySelector(TALK_Y.PAGE_MESSAGES) || document.body;
  chatWatcherObserver.observe(chatContainer, { childList: true, subtree: true, characterData: true });
  
  msgPollInterval = setInterval(() => {
    if (!eaterActive || !isAuthenticated) return;
    scanAllIncomingMessages();
    scanAllOutgoingMessages();
  }, 2000);
  
  setInterval(() => {
    if (_responseTimers.size === 0) return;
    checkForSentMessages();
  }, 2000);
  
  document.addEventListener('click', (e) => {
    if (!eaterActive || !isAuthenticated) return;
    const convItem = e.target.closest('[class*="conversation"], [class*="contact-item"], [class*="user-item"], [class*="dialog-item"], [class*="chat-item"], [class*="thread"]');
    if (convItem) {
      _processedTexts.clear();
      setTimeout(scanAllIncomingMessages, 800);
    }
  }, true);
}

// ============ SCANNERS ============
function scanAllIncomingMessages() {
  const selectors = [
    '.text-message',
    '[data-test-id*="text-msg"]',
    '[data-test-id*="message"]:not([class*="my"])',
    '[class*="message-in"]', '[class*="message-received"]', '[class*="incoming"]',
    '[class*="other-message"]', '[class*="contact-message"]', '[class*="msg-other"]',
    '[class*="bubble-other"]', '[class*="dialog-item"]:not([class*="own"])',
    '[class*="chat-message"]:not([class*="sent"])', 'div[class*="message"]:not([class*="my"])',
    '[class*="msg"]:not([class*="my"])', '[class*="message"]:not([class*="self"])',
    '[class*="conv-msg"]:not([class*="own"])', '[class*="bubble"]:not([class*="right"])',
    '[class*="left-bubble"]', '[class*="replies"] [class*="msg"]',
    '[class*="conversacion"] [class*="texto"]', '[class*="chat-content"] [class*="other"]',
    '[data-test-uid] [class*="text"]:not([class*="my"])',
    '[class*="message"]:not([class*="my"])'
  ];
  
  for (const sel of selectors) {
    const messages = document.querySelectorAll(sel);
    if (messages.length === 0) continue;
    console.log('[TESSERACT] scanner selector', sel, 'matched', messages.length, 'messages');
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.classList.contains('tess-checked-outgoing')) continue;
      if (msg.matches && msg.matches('[class*="my-text-message"], [class*="my-message"], [class*="own"], [class*="sent"]')) continue;
      if (msg.closest && msg.closest('[class*="my-text-message"], [class*="my-message"], [class*="own"]')) continue;
      const text = (msg.textContent || '').trim();
      if (!text || text.length < 3) continue;
      const hash = text.substring(0, 80);
      if (_processedTexts.has(hash)) continue;
      if (eaterResponse && (text === eaterResponse || text.startsWith(eaterResponse.substring(0, 40)))) continue;
      _processedTexts.add(hash);
      if (_processedTexts.size > 30) {
        const first = _processedTexts.values().next().value;
        _processedTexts.delete(first);
      }
      injectEaterTrigger(msg, text);
      return;
    }
  }
}

function scanAllOutgoingMessages() {
  if (!clonacionActiva) return;
  const sentSelectors = [
    '[class*="my-text-message"]', '.text-message.own', '[class*="message-sent"]',
    '[class*="bubble-right"]', '[data-test-id*="msg--sent"]'
  ];
  const chatContainer = document.querySelector(TALK_Y.PAGE_CHAT_BODY);
  if (!chatContainer) return;
  for (const sel of sentSelectors) {
    const messages = document.querySelectorAll(sel + ':not(.tess-checked-outgoing)');
    if (messages.length === 0) continue;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!chatContainer.contains(msg)) continue;
      msg.classList.add('tess-checked-outgoing');
      const text = (msg.textContent || '').trim();
      if (!text || text.length < 3) continue;
      directInjectCaptureButton(msg, text);
    }
  }
}

function directInjectCaptureButton(msgEl, messageText) {
  if (msgEl.querySelector('.tess-capture-trigger')) return;
  var clientName = 'Cliente';
  var nameEl = msgEl.querySelector('[class*="name"], [class*="sender"], [class*="author"]');
  if (nameEl && nameEl.textContent.trim()) clientName = nameEl.textContent.trim();
  var trigger = document.createElement('span');
  trigger.className = 'tess-capture-trigger';
  trigger.textContent = '🎭';
  trigger.title = 'Capturar estilo del operador para este perfil';
  Object.assign(trigger.style, {
    cursor: 'pointer',
    fontSize: '14px',
    marginLeft: '4px',
    display: 'inline-block',
    opacity: '0.5',
    transition: 'opacity 0.2s',
    verticalAlign: 'middle'
  });
  trigger.onmouseenter = function () { this.style.opacity = '1'; };
  trigger.onmouseleave = function () { this.style.opacity = '0.5'; };
  var msgText = messageText || msgEl.textContent || '';
  trigger.onclick = function (e) {
    e.stopPropagation();
    captureOperatorStyle(msgText.trim());
  };
  var contentEl = msgEl.querySelector('.content, [class*="content"], p') || msgEl;
  contentEl.appendChild(trigger);
}

function checkForIncomingMessages(node) {
  const selectors = [
    '.text-message',
    '[data-test-id*="text-msg"]',
    '[data-test-id*="message"]:not([class*="my"])',
    '[class*="message-in"]', '[class*="message-received"]', '[class*="incoming"]',
    '[class*="other-message"]', '[class*="contact-message"]', '[class*="msg-other"]',
    '[class*="bubble-other"]', '[class*="dialog-item"]:not([class*="own"])',
    '[class*="chat-message"]:not([class*="sent"])', 'div[class*="message"]:not([class*="my"])',
    '[class*="msg"]:not([class*="my"])', '[class*="message"]:not([class*="self"])',
    '[class*="conv-msg"]:not([class*="own"])', '[class*="bubble"]:not([class*="right"])',
    '[class*="left-bubble"]', '[class*="replies"] [class*="msg"]',
    '[class*="conversacion"] [class*="texto"]', '[class*="chat-content"] [class*="other"]',
    '[class*="message"]:not([class*="my"])'
  ];
  
  const nodes = node.nodeType === 1 ? [node, ...node.querySelectorAll('*')] : [];
  for (const el of nodes) {
    if (el.nodeType !== 1) continue;
    if (el.classList.contains('tess-checked-outgoing')) continue;
    if (el.matches && el.matches('[class*="my-text-message"], [class*="my-message"], [class*="own"]')) continue;
    if (el.closest && el.closest('[class*="my-text-message"], [class*="my-message"], [class*="own"]')) continue;
    for (const sel of selectors) {
      if (!el.matches || !el.matches(sel)) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length < 3) continue;
      const hash = text.substring(0, 80);
      if (_processedTexts.has(hash)) continue;
      if (eaterResponse && (text === eaterResponse || text.startsWith(eaterResponse.substring(0, 40)))) continue;
      _processedTexts.add(hash);
      if (_processedTexts.size > 30) {
        const first = _processedTexts.values().next().value;
        _processedTexts.delete(first);
      }
      injectEaterTrigger(el, text);
      return;
    }
  }
}

function isOutgoingMessage(el) {
  const outgoingClasses = ['own', 'sent', 'outgoing', 'self', 'my-text-message', 'my-message', 'right', 'msg--outgoing', 'message--sent', 'msg--right', 'bubble--right'];
  let current = el;
  while (current && current !== document.body) {
    const cls = typeof current.className === 'string' ? current.className : '';
    for (const oc of outgoingClasses) {
      if (cls.includes(oc)) return true;
    }
    if (current.getAttribute && current.getAttribute('data-test-id')?.includes('msg--sent')) return true;
    current = current.parentElement;
  }
  return false;
}

// Almacén de mensajes seleccionados + modo multi-select
let _selectedEaterMessages = [];
let _eaterMultiMode = false;

function _toggleEaterMultiMode() {
  _eaterMultiMode = !_eaterMultiMode;
  if (!_eaterMultiMode) _clearEaterSelection();
  const btn = document.getElementById('btnEaterMulti');
  if (btn) {
    btn.textContent = _eaterMultiMode ? '🔗 MULTI: ON' : '🔗 MULTI';
    btn.style.borderColor = _eaterMultiMode ? '#8b5cf6' : '#555';
    btn.style.background = _eaterMultiMode ? 'rgba(139,92,246,0.25)' : 'transparent';
  }
}

// Añade badge de selección al panel EATER si no existe
function _ensureSelectionBadge() {
  if (!document.getElementById('tessEaterSelectionBadge')) {
    const area = document.getElementById('eaterResponseArea');
    if (!area) return;
    const badge = document.createElement('span');
    badge.id = 'tessEaterSelectionBadge';
    badge.textContent = '';
    Object.assign(badge.style, {
      position: 'absolute',
      top: '-6px',
      right: '-6px',
      background: '#8b5cf6',
      color: '#fff',
      fontSize: '10px',
      fontWeight: 'bold',
      borderRadius: '50%',
      minWidth: '18px',
      height: '18px',
      lineHeight: '18px',
      textAlign: 'center',
      padding: '0 4px',
      zIndex: '10',
      display: 'none',
      fontFamily: 'sans-serif',
      boxShadow: '0 0 6px rgba(139,92,246,0.6)'
    });
    const wrapper = area.parentElement;
    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.appendChild(badge);
    }
  }
  const badge = document.getElementById('tessEaterSelectionBadge');
  if (badge) badge.style.display = _selectedEaterMessages.length > 0 ? 'inline-block' : 'none';
}

function _updateEaterSelectionUI() {
  _ensureSelectionBadge();
  const count = _selectedEaterMessages.length;
  const badge = document.getElementById('tessEaterSelectionBadge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
  const clearBtn = document.getElementById('eaterClearSelectionBtn');
  if (clearBtn) clearBtn.style.display = count > 0 ? 'inline' : 'none';
}

function _clearEaterSelection() {
  document.querySelectorAll('.tess-eater-trigger.sel').forEach(el => {
    el.classList.remove('sel');
    el.style.border = '';
    el.style.borderRadius = '';
    el.style.padding = '';
    el.style.opacity = '0.5';
  });
  _selectedEaterMessages = [];
  _updateEaterSelectionUI();
}

function extractSenderFromNode(el) {
  if (!el) return null;
  var id = el.getAttribute('data-id') || el.getAttribute('data-user-id') || el.getAttribute('data-profile-id') || el.getAttribute('data-member-id') || el.getAttribute('data-uid');
  if (id && /^\d{5,15}$/.test(id)) return id.replace(/^0+/, '');
  var links = el.querySelectorAll('a[href*="/user/"], a[href*="/profile/"], a[href*="/member/"]');
  for (var i = 0; i < links.length; i++) {
    var m = (links[i].href || '').match(/\/(\d{5,15})(?:[/?#]|$)/);
    if (m) return m[1].replace(/^0+/, '');
  }
  var imgs = el.querySelectorAll('img[src]');
  for (var i = 0; i < imgs.length; i++) {
    var m2 = (imgs[i].getAttribute('src') || '').match(/[./](\d{5,15})[./]/);
    if (m2) return m2[1].replace(/^0+/, '');
  }
  var onclickEl = el.querySelector('[onclick*="profile"], [onclick*="openProfile"]');
  if (onclickEl) {
    var m3 = (onclickEl.getAttribute('onclick') || '').match(/\b(\d{5,15})\b/);
    if (m3) return m3[1].replace(/^0+/, '');
  }
  return null;
}

function injectEaterTrigger(msgEl, messageText) {
  if (msgEl.querySelector('.tess-eater-trigger, .tess-capture-trigger')) return;
  if (msgEl.classList.contains('tess-checked-outgoing')) return;
  if (msgEl.matches && msgEl.matches('[class*="my-text-message"]')) return;
  
  var eaterSenderId = extractSenderFromNode(msgEl);
  if (eaterSenderId && typeof isInAABlacklist === 'function' && isInAABlacklist(eaterSenderId)) return;
  if (eaterSenderId && typeof window._isInMLBlacklist === 'function' && window._isInMLBlacklist(eaterSenderId)) return;
  
  const nameSelectors = ['[class*="name"]', '[class*="sender"]', '[class*="author"]', '[class*="username"]', '[class*="contact-name"]'];
  let clientName = 'Cliente';
  for (const sel of nameSelectors) {
    const nameEl = msgEl.querySelector(sel);
    if (nameEl && nameEl.textContent.trim()) { clientName = nameEl.textContent.trim(); break; }
  }
  if (clientName && clientName !== currentClientName) currentClientName = Tesseract.set('currentClientName', clientName);
  
  const trigger = document.createElement('span');
  trigger.className = 'tess-eater-trigger';
  trigger.textContent = '🤖';
  trigger.title = 'Click: responder | 🔗 MULTI activo: seleccionar';
  Object.assign(trigger.style, {
    cursor: 'pointer',
    fontSize: '14px',
    marginLeft: '4px',
    display: 'inline-block',
    opacity: '0.5',
    transition: 'opacity 0.2s',
    verticalAlign: 'middle'
  });
  trigger.onmouseenter = () => trigger.style.opacity = '1';
  trigger.onmouseleave = () => trigger.style.opacity = trigger.classList.contains('sel') ? '1' : '0.5';
  
  const msgText = messageText || msgEl.textContent || '';
  trigger.onclick = (e) => {
    e.stopPropagation();
    if (_eaterMultiMode) {
      const idx = _selectedEaterMessages.indexOf(msgText.trim());
      if (idx === -1) {
        _selectedEaterMessages.push(msgText.trim());
        trigger.classList.add('sel');
        trigger.style.opacity = '1';
        trigger.style.border = '1px solid #8b5cf6';
        trigger.style.borderRadius = '3px';
        trigger.style.padding = '0 2px';
      } else {
        _selectedEaterMessages.splice(idx, 1);
        trigger.classList.remove('sel');
        trigger.style.border = '';
        trigger.style.borderRadius = '';
        trigger.style.padding = '';
        trigger.style.opacity = '0.5';
      }
      _updateEaterSelectionUI();
    } else {
      if (_selectedEaterMessages.length > 0) {
        _selectedEaterMessages.push(msgText.trim());
        const list = _selectedEaterMessages.slice();
        _clearEaterSelection();
        generateMultiFromSelection(list);
      } else {
        generateFromMessage(msgText.trim());
      }
    }
  };
  
  const contentEl = msgEl.querySelector('.content, [class*="content"], p') || msgEl;
  contentEl.appendChild(trigger);

  let convEl = msgEl.closest('[class*="dialog-item-content"], [class*="dialog-item"], [class*="conversation-item"]');
  if (!convEl && clientName) {
    const items = document.querySelectorAll(TALK_Y.DIALOG_ITEMS);
    for (const item of items) {
      const nameEl = item.querySelector(TALK_Y.DIALOG_ITEM_NAME);
      if (nameEl && nameEl.textContent.trim() === clientName) {
        convEl = item;
        break;
      }
    }
  }
  if (convEl) startResponseTimer(convEl, clientName, trigger);
}

// ============ CAPTURA DE ESTILO ============
async function captureOperatorStyle(text) {
  if (!clonacionActiva) { showTessToast('⏸ Clonación está detenida', 'warning'); return; }
  var rawId = '';
  if (window._lastCribsPid) {
    var isOperator = window._cribsChatIds && window._cribsChatIds[0] && String(window._cribsChatIds[0]).replace(/^0+/, '') === String(window._lastCribsPid).replace(/^0+/, '');
    if (!isOperator) rawId = window._lastCribsPid;
  }
  if (!rawId && window._cribsChatIds && window._cribsChatIds.length > 1) {
    rawId = String(window._cribsChatIds[1]).replace(/^0+/, '');
  }
  if (!rawId) {
    var chatM = location.href.match(/\/chat\/(\d{6,15})_(\d{6,15})/);
    if (chatM) rawId = chatM[2].replace(/^0+/, '');
  }
  if (!rawId) {
    showTessToast('⚠ No hay perfil detectado para capturar estilo', 'warning');
    return;
  }
  await cribLoadOrRefresh(false);
  var entry = cribFindEntry(rawId);
  if (!entry || !entry._id) {
    showTessToast('⚠ Perfil no encontrado en CRIBS. Agrégalo desde el dashboard.', 'warning');
    return;
  }
  var existing = entry.voice_style || '';
  var lines = existing ? existing.split('\n').filter(function (l) { return l.trim(); }) : [];
  lines.push(text.trim());
  if (lines.length > 50) lines = lines.slice(-50);
  var newStyle = lines.join('\n');
  try {
    entry.voice_style = newStyle;
    if (typeof _cribsSaveToLocal === 'function') {
      chrome.storage.local.get('tess_cribs', function (st) {
        var all = st.tess_cribs || [];
        for (var ci = 0; ci < all.length; ci++) {
          if (all[ci]._id === entry._id || all[ci].profile_id === entry.profile_id) {
            all[ci].voice_style = newStyle;
            break;
          }
        }
        chrome.storage.local.set({ tess_cribs: all });
      });
    }
    if (cribsOverlayData && (cribsOverlayData._id === entry._id || cribsOverlayData.profile_id === entry.profile_id)) {
      cribsOverlayData.voice_style = newStyle;
    }
    if (cribsOverlayData) renderCribsOverlay(cribsOverlayData);
    showTessToast('🎭 Estilo capturado (' + lines.length + '/50)', 'success');
  } catch (e) {
    console.log('[CAPTURE] Error:', e.message);
    showTessToast('⚠ Error de conexión al guardar estilo', 'error');
  }
}

// ============ AUTO-EXPAND PANEL ============
function ensurePanelVisible() {
  const panel = document.getElementById('tesseract-main-panel');
  if (!panel) return;
  const box = panel.querySelector('.tess-box');
  const mini = document.getElementById('tess-mini-icon');
  if (box && box.style.display === 'none') {
    box.style.display = '';
  }
  if (mini) mini.style.display = 'none';
  const sub = document.getElementById('botsubEater');
  if (sub && !sub.classList.contains('visible')) {
    window._tessWinZ = (window._tessWinZ || 10) + 1;
    sub.style.zIndex = window._tessWinZ;
    sub.classList.add('visible');
    const btn = document.querySelector('.bot-subbtn[data-botsub="eater"]');
    if (btn) btn.classList.add('active');
  }
}

// ============ GENERACIÓN DE RESPUESTAS ============
var _eaterLastGenTime = 0;
var _eaterGenCount = 0;
var _eaterGenDate = '';

function generateFromMessage(msgText) {
  if (!msgText || msgText.length < 3) return;
  var today = new Date().toISOString().slice(0, 10);
  if (_eaterGenDate !== today) { _eaterGenDate = today; _eaterGenCount = 0; }
  if (_eaterGenCount >= 20) { showTessToast('Límite diario de IA alcanzado (20)', 'warning'); return; }
  var now = Date.now();
  if (now - _eaterLastGenTime < 3000) { showTessToast('Espera 3s entre generaciones', 'warning'); return; }
  _eaterLastGenTime = now;
  _eaterGenCount++;
  ensurePanelVisible();
  _eaterRemoveMultiBoxes();
  
  const clientName = currentClientName || 'Cliente';
  var _clientMsgFull = _selectedEaterMessages.length > 0 ? _selectedEaterMessages.join(' | ') : msgText;
  window._eaterClientMsgText = _clientMsgFull;
  var _detectedLang = typeof detectLanguage === 'function' ? detectLanguage(_clientMsgFull) : null;
  window._eaterClientMsgLang = _detectedLang;
  if (_detectedLang && _detectedLang !== 'es') clientDetectedLang = Tesseract.set('clientDetectedLang', _detectedLang);

  if (!window._lastClientProfile) {
    const profileEl = document.querySelector(TALK_Y.PROFILE_DETAIL) || document.body;
    window._lastClientProfile = {
      name: clientName,
      interests: extractInterests(profileEl),
      location: extractLocation(profileEl),
      bio: extractBio(profileEl),
      age: extractAge(profileEl),
      hasPhoto: checkPhoto(profileEl),
      hobbies: extractHobbies(profileEl)
    };
  }
  
  const area = document.getElementById('eaterResponseArea');
  if (area) { area.value = '🤖 Generando...'; area.style.color = '#888'; }

  const btn2 = document.getElementById('btnRefreshEater2');
  if (btn2) btn2.textContent = '🤖 IA...';
  
  const profile = window._lastClientProfile || { name: clientName, interests: [], location: null, bio: '', age: null, hasPhoto: false, hobbies: null };
  
  generateWithAI(clientName, profile, msgText).then(response => {
    eaterResponse = Tesseract.set('eaterResponse', response || generateLocalResponse(clientName, profile));
    if (eaterResponse) _processedTexts.add(eaterResponse.substring(0, 80));
    isUsingAI = Tesseract.set('isUsingAI', !!response);
    if (btn2) btn2.textContent = isUsingAI ? '🤖 IA' : '🔄 FRASES';
    displaySuggestions(clientName);
  }).catch(() => {
    eaterResponse = Tesseract.set('eaterResponse', generateLocalResponse(clientName, profile));
    if (eaterResponse) _processedTexts.add(eaterResponse.substring(0, 80));
    isUsingAI = Tesseract.set('isUsingAI', false);
    if (btn2) btn2.textContent = '🔄 FRASES';
    displaySuggestions(clientName);
  });
}

// ============ GENERACIÓN MULTI: una respuesta por mensaje seleccionado, cada una en su cuadro ============
function _eaterRemoveMultiBoxes() {
  var cont = document.getElementById('eaterMultiBoxes');
  if (cont) cont.remove();
  var area = document.getElementById('eaterResponseArea');
  if (area) area.style.display = '';
}

async function generateMultiFromSelection(list) {
  if (!list || !list.length) return;
  var today = new Date().toISOString().slice(0, 10);
  if (_eaterGenDate !== today) { _eaterGenDate = today; _eaterGenCount = 0; }
  if (_eaterGenCount >= 20) { showTessToast('Límite diario de IA alcanzado (20)', 'warning'); return; }
  _eaterLastGenTime = Date.now();
  ensurePanelVisible();

  var clientName = currentClientName || 'Cliente';
  window._eaterClientMsgText = list.join(' | ');
  var profile = window._lastClientProfile || { name: clientName, interests: [], location: null, bio: '', age: null, hasPhoto: false, hobbies: null };

  var area = document.getElementById('eaterResponseArea');
  if (!area) return;
  _eaterRemoveMultiBoxes();

  // Contenedor con un cuadro por mensaje seleccionado, en orden
  var cont = document.createElement('div');
  cont.id = 'eaterMultiBoxes';
  cont.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin:4px 0;';
  var boxes = [];
  for (var bi = 0; bi < list.length; bi++) {
    var wrapEl = document.createElement('div');
    var lbl = document.createElement('div');
    lbl.textContent = '→ Respuesta ' + (bi + 1) + '/' + list.length + ': "' + String(list[bi]).substring(0, 40) + (list[bi].length > 40 ? '…' : '') + '"';
    lbl.style.cssText = 'font-size:8px;color:#8b5cf6;font-weight:bold;margin-bottom:1px;word-break:break-word;';
    var ta = document.createElement('textarea');
    ta.className = 'tess-multi-box';
    ta.rows = 2;
    ta.setAttribute('data-idx', bi);
    ta.value = '🤖 Generando...';
    ta.style.cssText = 'width:100%;background:#12121f;border:1px solid #2a2a44;color:#888;border-radius:6px;padding:6px;font-size:11px;box-sizing:border-box;resize:vertical;min-height:34px;';
    wrapEl.appendChild(lbl);
    wrapEl.appendChild(ta);
    cont.appendChild(wrapEl);
    boxes.push(ta);
  }
  area.parentElement.insertBefore(cont, area);
  area.style.display = 'none';

  var btn2 = document.getElementById('btnRefreshEater2');
  if (btn2) btn2.textContent = '🤖 IA x' + list.length;

  var responses = [];
  for (var gi = 0; gi < list.length; gi++) {
    var resp = null;
    try { resp = await generateWithAI(clientName, profile, list[gi]); } catch (_ge) { resp = null; }
    if (!resp) resp = generateLocalResponse(clientName, profile);
    resp = _eaterCap120(resp);
    responses.push(resp);
    boxes[gi].value = resp;
    boxes[gi].style.color = '#e0e0e0';
    console.log('[EATER MULTI] Respuesta ' + (gi + 1) + '/' + list.length + ' (' + resp.length + ' chars)');
    if (gi < list.length - 1) await sleep(300);
  }

  _eaterGenCount++;
  eaterResponse = Tesseract.set('eaterResponse', responses.join('\n\n'));
  window._eaterMultiResponses = responses;
  if (eaterResponse) _processedTexts.add(eaterResponse.substring(0, 80));
  isUsingAI = Tesseract.set('isUsingAI', true);
  if (btn2) btn2.textContent = '🤖 IA';
}

// ============ EXTRACCIÓN DE PERFIL ============
function checkPhoto(el) {
  const imgs = el.querySelectorAll('img[class*="photo"], img[class*="avatar"], img[src]');
  for (const img of imgs) {
    if (img.src && !img.src.includes('default') && !img.src.includes('placeholder') && !img.src.includes('no-photo') && img.naturalWidth > 10) return true;
  }
  return false;
}

function extractInterests(el) {
  const t = (el.textContent || '').toLowerCase();
  const interests = [];
  const kw = {
    'viajes': ['viaje', 'viajar', 'travel', 'playa'],
    'música': ['música', 'music', 'bailar', 'cantar'],
    'deportes': ['deporte', 'gym', 'gimnasio', 'fútbol'],
    'lectura': ['libro', 'leer', 'lectura'],
    'cine': ['película', 'cine', 'movie', 'series'],
    'cocina': ['cocina', 'cocinar', 'food', 'comida']
  };
  for (const [k, v] of Object.entries(kw)) {
    if (v.some(w => t.includes(w))) interests.push(k);
  }
  return interests;
}

function extractLocation(el) {
  const text = el.textContent || '';
  const m = text.match(/(?:de|from|vive en|lives in)[:\s]*([A-ZÁÉÍÓÚ][a-záéíóú]+)/i);
  return m ? m[1].trim() : null;
}

function extractBio(el) {
  const bioEl = el.querySelector(TALK_Y.PROFILE_BIO);
  return (bioEl && bioEl.textContent.trim().length > 10) ? bioEl.textContent.trim() : '';
}

function extractAge(el) {
  const text = el.textContent || '';
  const m = text.match(/(\d{2})\s*(?:años|years|age|edad)/i);
  return m ? parseInt(m[1]) : null;
}

function extractHobbies(el) {
  const t = (el.textContent || '').toLowerCase();
  const h = [];
  if (t.includes('bailar') || t.includes('dance')) h.push('bailar');
  if (t.includes('cocinar') || t.includes('cooking')) h.push('cocinar');
  if (t.includes('viajar') || t.includes('travel')) h.push('viajar');
  return h.length > 0 ? h : null;
}

// ============ IA GENERATION ============
// PROMPT MAESTRO - CONVERSACIONES MAGNETICAS, HUMANAS Y CON PROPOSITO (VERSION FINAL)
// System prompt permanente para la generacion de respuestas IA (icono de robot en mensajes).
// TESS_MASTER_PROMPT ahora es global: definido en dist/modules/state-manager.js

// Recolecta los ultimos N turnos del chat visible (mios vs cliente) para dar contexto a la IA
function collectRecentConversation(maxTurns) {
  try {
    var selectors = ['.text-message', '[data-test-id*="text-msg"]', '[data-test-id*="message"]:not([class*="my"])'];
    var best = [];
    for (var s = 0; s < selectors.length; s++) {
      try {
        var nodes = document.querySelectorAll(selectors[s]);
        if (nodes.length > best.length) best = Array.prototype.slice.call(nodes);
      } catch (e2) {}
    }
    var turns = [];
    var seen = {};
    for (var i = 0; i < best.length; i++) {
      var el = best[i];
      // Extraer SOLO el texto del mensaje (p.content), no la hora ni metadatos
      var textEl = el.querySelector('p.content') || el.querySelector('[class*="content"] p') || null;
      var text = ((textEl ? textEl.textContent : el.textContent) || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 2 || seen[text]) continue;
      seen[text] = 1;
      var mine = false;
      try {
        mine = !!(el.matches && el.matches('[class*="own"], [class*="my"], [class*="sent"]')) ||
               !!(el.closest && el.closest('[class*="my-text-message"], [class*="own"], [class*="sent"]'));
      } catch (e3) {}
      turns.push({ mine: mine, content: text.substring(0, 300) });
    }
    return turns.slice(-(maxTurns || 10));
  } catch (e) { return []; }
}

// Corte inteligente a 120 caracteres (frase/coma/espacio)
function _eaterCap120(t) {
  t = String(t || '').replace(/^["'\u201c\u201d\s]+/, '').replace(/["'\u201c\u201d\s]+$/, '');
  if (t.length <= 120) return t;
  var cut = t.substring(0, 120);
  var p = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf(', '), cut.lastIndexOf('; '));
  if (p >= 60) return cut.substring(0, p + 1).trim();
  var sp = cut.lastIndexOf(' ');
  if (sp >= 60) return cut.substring(0, sp).trim();
  return cut.trim();
}

async function generateWithAI(name, profile, accumulatedMsg) {
  try {
    if (!accumulatedMsg || accumulatedMsg.trim().length < 3) {
      return generateLocalResponse(name, profile);
    }
    
    const isMultiple = accumulatedMsg.includes(' | ');
    const contextNote = isMultiple
      ? 'El cliente ha enviado VARIOS mensajes seguidos. Toma en cuenta TODOS para generar una respuesta coherente y completa. Responde con una extensión PROPORCIONAL a la cantidad de mensajes que recibiste: si son 2-3 mensajes, responde con 1-2 párrafos; si son más, usa el espacio necesario para cubrir cada punto que mencionó.'
      : '';
    
    var confianza = 'nueva';
    if (/\b(amor|cariño|bebé|mi vida|corazón|querido)\b/i.test(accumulatedMsg)) confianza = 'alta';
    else if (/\b(gracias|encanta|gusta|divertido|interesante|bonito|lindo)\b/i.test(accumulatedMsg)) confianza = 'media';
    var confianzaHint = confianza === 'alta' ? 'RELACIÓN DE PAREJA: responde como su pareja real. Usa "mi vida", "mi reina", "corazón" de forma natural. Habla con posesión suave ("te tengo", "estoy contigo"), protección ("descansá, que yo sigo aquí") y deseo real ("me encantaría tenerte cerca"). Sé cálido, cercano, con confianza en la intimidad.' :
      confianza === 'media' ? 'BUENA VIBRA: sé cálido pero sin exagerar la confianza. Coqueteo sutil, juguetón y seguro. Genera atracción con tensión positiva sin apodos ni posesión. Sigue el tono positivo.' :
      'RECIÉN CONOCIENDO: sé serio, seguro, respetuoso y juguetón. Nada de apodos ni palabras de cariño. Construye rapport natural con coqueteo sutil que genere tensión atractiva sin presión.';

    var styleInjection = '';
    var cribsEntry = cribFindEntry(window._lastCribsPid);
    if (!(cribsEntry && cribsEntry.voice_style)) {
      // Fallback: usar el estilo del operador mas reciente disponible en CRIBS
      try {
        if (typeof _cribsLocalCache !== 'undefined' && _cribsLocalCache && _cribsLocalCache.length) {
          for (var si = _cribsLocalCache.length - 1; si >= 0; si--) {
            if (_cribsLocalCache[si].voice_style && String(_cribsLocalCache[si].voice_style).trim().length > 5) { cribsEntry = _cribsLocalCache[si]; break; }
          }
        }
      } catch (se) {}
    }
    if (cribsEntry && cribsEntry.voice_style) {
      var examples = cribsEntry.voice_style.split('\n')
        .filter(function (l) { return l.trim().length > 5; })
        .map(function (l) { return '- "' + l.trim() + '"'; })
        .join('\n');
      console.log('[EATER AI] Estilo del operador cargado (perfil ' + (cribsEntry.profile_id || '?') + ') -', cribsEntry.voice_style.split('\n').length, 'lineas');
      if (examples) {
        styleInjection = '\n\n=== ESTILO DEL OPERADOR ===\nMensajes reales escritos por el operador:\n' + examples + '\nIMITA EXACTAMENTE esta forma de escribir: tono, vocabulario, uso de emojis, longitud y ritmo de las frases. Tus respuestas deben ser indistinguibles de estos ejemplos.\n=== FIN ESTILO ===\n';
      }
    } else {
      console.log('[EATER AI] Sin estilo capturado en CRIBS para perfil', window._lastCribsPid);
    }

    const maxLen = isMultiple ? 2000 : 500;
    const prompt = 'Último mensaje del cliente:\n\n"' + accumulatedMsg.substring(0, maxLen) + '"\n\n' +
      contextNote +
      'Nivel de confianza: ' + confianza + '. ' + confianzaHint + '\n\n' +
      'Escribe UNA respuesta natural, humana y magnetica. Sigue estas reglas:\n' +
      '- TRATO HUMANO REAL: habla como un amigo con ventaja, no como chat bot. Usa humor callejero, referencias cotidianas, silencios narrados. Si ella cuenta algo personal, reacciona con empatia masculina, no con analisis frio. Se genuino.\n' +
      '- PUSH-PULL INTELIGENTE: alterna calidez con distancia calculada. Un cumplido seguido de un quite. Interes genuino seguido de indiferencia juguetona. Nunca valides sin quitar algo primero. La tension se construye con contrastes, no con rectas.\n' +
      '- PSICOLOGIA OSCURA DOSIFICADA: misterio controlado, validacion con giro, tension implicita. Provoca curiosidad, no la resuelvas. Insinua sin mostrar.\n' +
      '- TERMOMETRO EMOCIONAL: refleja EXACTAMENTE el tono del cliente. Si es romántico → romántico. Si es serio → serio. Si es jugueton → jugueton. Si discute → misma intensidad. Si usa cariño → mismo nivel de afecto.\n' +
      '- MARCO Y DOMINIO: tu guias. Si ella se queja: entiendo pero... + redirige. Si ella se distancia: cuando quieras retomamos + silencio. Nunca ruegues, nunca insistas, nunca te disculpes de mas.\n' +
      '- TRATO SEGUN VINCULO: si usa palabras de carino, responde como pareja real con posesion suave y deseo. Si es nueva, nada de apodos, se serio, seguro y jugueton.\n' +
      '- NO uses metaforas, lenguaje poetico ni florido. Se directo, conciso y natural.\n' +
      '- NO pongas descripciones de tono al final ni en ningun lugar del mensaje (nada de *sonrie*, *risas*, *en serio*, etc.). Responde solo texto plano, sin metadatos ni acotaciones.\n' +
      '- NO empieces con Me alegra que..., Que bien que..., Me gusta que... ni variantes.\n' +
      '- NO saludes a menos que el cliente haya saludado.\n' +
      '- NO preguntes hora, fecha, ni en que piensas?.\n' +
      '- NO uses frases hechas ni halagos vacios.\n' +
      '- LONGITUD: tu respuesta completa debe tener MAXIMO 120 caracteres. Sin excepciones. Breve y directo.\n' +
      '- IDIOMA: responde en el MISMO idioma en que escribe el cliente. Si escribe en ingles, responde en ingles natural; si en espanol, en espanol. NUNCA mezcles idiomas ni respondas en otro idioma.\n' +
      '- NO termines cada respuesta con pregunta. Solo pregunta si es necesario.\n' +
      '- NO lleves todo al terreno romantico. Puede ser divertida, intelectual, cotidiana.\n' +
      '- Si el cliente usa carino, responde con el mismo nivel de afecto reflejando su tono.\n' +
      '- Si pide irse a WhatsApp, Instagram, otra app o red social: RECHAZO firme y convincente. Di que no usas redes sociales, que tu telefono es solo para trabajo/familia, o que te robaron el celular y estas esperando reposicion. NO des tu numero ni redes JAMAS. Redirige amable pero firmemente al chat diciendo que prefieres hablar ahi, es mas intimo/seguro/privado, o que te gusta mas escribirle por ahi. La meta es que ELLA se sienta comoda QUEDANDOSE en el sitio.\n      - Si pide fotos/video fuera del sitio: niegate con que aqui estas mas comodo, que no te gusta compartir tu telefono, o mejor asi mas misterio. Manten el interes dentro de la pagina.\n      - Si pide numero de telefono o email: di que no lo das a desconocidos, que te hackearon el celular, o que prefieres mantener la conversacion en el chat porque es donde mejor conectas con ella. Nunca cedas.\n' +
      '- NUNCA uses el nombre del cliente como si fuera tuyo ni lo corrijas.\n' +
      'Varia tu forma de iniciar: a veces directo, a veces con observacion. ' +
      'Sigue el tono del cliente: si bromea, sigue humor; si es directo, se directo; si es profundo, conectate. ' +
      'DETECTA DISCUSION: si el cliente discute, rete o cuestiona, responde con la misma intensidad defiende tu punto con firmeza, no te doblegues. ' +
      'Habla como WhatsApp, no como carta. ' +
      (isMultiple ? 'Cubre todos los mensajes recibidos con la extension necesaria para cada uno, sin exceder JAMAS los 120 caracteres en total.' : 'Se concreto, MAXIMO 120 caracteres.') + ' Responde SOLO el texto de mi respuesta.';

    console.log('[EATER AI] Llamando a IA vía proxy');

    const aiMessages = [
      {
        role: 'system',
        content: TESS_MASTER_PROMPT + styleInjection,
      }
    ];

    const history = collectRecentConversation(10);
    // Evitar duplicar el ultimo mensaje: si el historial ya lo trae, quitarlo del final
    if (history.length) {
      var lastH = history[history.length - 1];
      if (!lastH.mine && accumulatedMsg.trim().toLowerCase().indexOf(lastH.content.toLowerCase().substring(0, 40)) === 0) {
        history.pop();
      }
      console.log('[EATER AI] Historial incluido:', history.length, 'turnos');
      for (var hi = 0; hi < history.length; hi++) {
        aiMessages.push(history[hi].mine ? { role: 'assistant', content: history[hi].content } : { role: 'user', content: history[hi].content });
      }
    } else {
      console.log('[EATER AI] Sin historial visible, solo ultimo mensaje');
    }

    aiMessages.push({ role: 'user', content: prompt });

    const aiData = await Tesseract.callAI(aiMessages, isMultiple ? 900 : 600);

    if (aiData && aiData.usage) {
      console.log('[EATER AI] usage:', JSON.stringify(aiData.usage), '| finish:', aiData.choices && aiData.choices[0] && aiData.choices[0].finish_reason);
    }
    
    console.log('[EATER AI] AI response:', aiData);
    
    if (aiData && aiData.choices && aiData.choices[0]?.message?.content) {
      const text = _eaterCap120(aiData.choices[0].message.content.trim());
      console.log('[EATER AI] Respuesta generada (' + text.length + ' chars):', text);
      return text;
    }
    return null;
  } catch (e) {
    console.warn('[EATER AI] Error:', e.message);
    return null;
  }
}

// ============ RESPUESTA LOCAL (FALLBACK) ============
function generateLocalResponse(name, profile) {
  const { interests, location, hobbies } = profile;
  const hasRealInterests = interests && interests.length > 0;
  const hasRealHobbies = hobbies && hobbies.length > 0;
  const hasRealLocation = location && location.length > 0;
  
  const candidates = [
    'Me gustas, pero no sé si me vas a responder...',
    'Tu perfil me tiene curioso... ¿serás interesante?',
    'Tengo una corazonada sobre ti...',
    'Algo me dice que deberíamos conversar...',
    'No puedo dejar de pensar en ti...',
    '¿Y si esta vez sí funciona?',
    'Me atraes... y quiero saber más de ti.',
    'Veo tu perfil y pienso que podrías ser especial...',
    'Algo en ti me llama la atención...',
    'Oye, ¿qué tal si nos conocemos mejor?',
    location && hasRealLocation ? `Vivo cerca de ${location}, ¿y tú?` : null,
    interests && hasRealInterests ? `Veo que te gusta ${interests[0]}... a mí también!` : null,
    hobbies && hasRealHobbies ? `${hobbies[0]}! Yo también hago eso :D` : null,
  ].filter(s => s);
  
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled[0] || 'Cuéntame más de ti...';
}

// ============ DISPLAY SUGGESTIONS ============
function displaySuggestions(name) {
  const cnEl = document.getElementById('eaterClientName');
  if (cnEl) cnEl.textContent = name;
  
  const area = document.getElementById('eaterResponseArea');
  if (!area) return;
  
  if (eaterResponse) {
    var displayText = _eaterCap120(eaterResponse);
    var ta = document.querySelector('textarea#form-textarea');
    if (ta) {
      var ml = parseInt(ta.getAttribute('maxlength'));
      if (ml && displayText.length > ml) displayText = displayText.substring(0, ml);
    }
    area.value = displayText;
    area.style.color = '#e0e0e0';
  }
  
  if (clientDetectedLang && clientDetectedLang !== 'es') {
    const sel = document.getElementById('btnTranslate2');
    if (sel && sel.querySelector('option[value="' + clientDetectedLang + '"]')) {
      sel.value = clientDetectedLang;
      selectedLangCode = Tesseract.set('selectedLangCode', clientDetectedLang);
    }
  }
}

// ============ TRADUCCIÓN ============
async function translateEaterText(text) {
  var code = selectedLangCode;
  if (code === 'es') { copyToChatInput(text); return; }
  var targetLang = translateLanguages.find(function (l) { return l.code === code; }) || translateLanguages[0];
  try {
    var sysMsg = (typeof TESS_TRANSLATOR_POLICY!=='undefined'?TESS_TRANSLATOR_POLICY+' ':'') + 'Traduce el siguiente texto del español al ' + targetLang.name + ' (' + targetLang.code + '). Responde SOLO con la traducción, sin explicaciones ni notas.';
    var groqData = await Tesseract.callGroq(
      [{ role: 'system', content: sysMsg }, { role: 'user', content: text }],
      'openai/gpt-oss-120b',
      300
    );
    var translated = groqData?.choices?.[0]?.message?.content;
    if (translated && translated.trim()) {
      var trimmed = translated.trim();
      var ta = document.querySelector('textarea#form-textarea');
      var ml = ta ? parseInt(ta.getAttribute('maxlength')) : 300;
      if (ml && trimmed.length > ml) trimmed = trimmed.substring(0, ml);
      copyToChatInput(trimmed);
      console.log('[TRANSLATE] ES → ' + targetLang.name + ':', trimmed.substring(0, 50));
    }
  } catch(e) {
    console.warn('[TRANSLATE] Error:', e.message);
  }
}

async function translateEaterResponse() {
  const area = document.getElementById('eaterResponseArea');
  if (!area || !area.value || area.value === 'Esperando mensaje...') return;

  var code = selectedLangCode;
  if (code === 'es') return;
  var targetLang = translateLanguages.find(function (l) { return l.code === code; }) || translateLanguages[0];

  var sourceText = window._eaterOriginalResponse || area.value;
  if (!sourceText || sourceText === 'Esperando mensaje...') return;

  try {
    var sysMsg = (typeof TESS_TRANSLATOR_POLICY!=='undefined'?TESS_TRANSLATOR_POLICY+' ':'') + 'Traduce el siguiente texto del español al ' + targetLang.name + ' (' + targetLang.code + '). Responde SOLO con la traducción, sin explicaciones ni notas.';
    var groqData = await Tesseract.callGroq(
      [{ role: 'system', content: sysMsg }, { role: 'user', content: sourceText }],
      'openai/gpt-oss-120b',
      300
    );
    var translated = groqData?.choices?.[0]?.message?.content;

    console.log('[TRANSLATE] Solicitando traducción → ' + targetLang.name + ':', sourceText.substring(0, 50));
    
    if (translated && translated.trim()) {
      area.value = translated.trim();
      eaterResponse = Tesseract.set('eaterResponse', translated.trim());
      window._eaterTranslated = true;
      console.log('[TRANSLATE] Respuesta:', translated.trim().substring(0, 50));
    } else {
      console.warn('[TRANSLATE] No se obtuvo traducción');
    }
  } catch(e) {
    console.warn('[TRANSLATE] Error:', e.message);
  }
}

// ============ TRADUCIR AL IDIOMA DEL CLIENTE (GROQ detecta y traduce) ============
async function translateEaterToClientLang() {
  const area = document.getElementById('eaterResponseArea');
  if (!area || !area.value || area.value === 'Esperando mensaje...') return;
  const sourceText = window._eaterOriginalResponse || area.value;
  if (!sourceText || sourceText === 'Esperando mensaje...') return;
  const clientMsg = window._eaterClientMsgText || '';
  if (!clientMsg || clientMsg.trim().length < 3) {
    showTessToast('No hay mensaje del cliente para detectar el idioma', 'warning');
    return;
  }
  if (window._eaterClientMsgLang === 'es') {
    showTessToast('El cliente escribe en español, no hace falta traducir', 'info');
    return;
  }
  area.value = '🌐 Traduciendo al idioma del cliente...';
  try {
    var sysMsg = (typeof TESS_TRANSLATOR_POLICY!=='undefined'?TESS_TRANSLATOR_POLICY+' ':'') + 'Eres un traductor profesional. Detecta el idioma del mensaje del cliente que se te indica y traduce el texto de respuesta a ESE mismo idioma. Responde SOLO con la traducción, sin explicaciones ni notas.';
    var userMsg = 'Mensaje del cliente:\n\n"' + clientMsg.substring(0, 1200) + '"\n\n' +
      'Texto de respuesta a traducir:\n\n"' + sourceText.substring(0, 1800) + '"';
    var groqData = await Tesseract.callGroq(
      [{ role: 'system', content: sysMsg }, { role: 'user', content: userMsg }],
      'openai/gpt-oss-120b',
      400
    );
    var translated = groqData?.choices?.[0]?.message?.content;
    if (translated && translated.trim()) {
      var trimmed = translated.trim();
      var ta = document.querySelector('textarea#form-textarea');
      var ml = ta ? parseInt(ta.getAttribute('maxlength')) : 300;
      if (ml && trimmed.length > ml) trimmed = trimmed.substring(0, ml);
      area.value = trimmed;
      eaterResponse = Tesseract.set('eaterResponse', trimmed);
      window._eaterTranslated = true;
      console.log('[TRANSLATE] Traducido al idioma del cliente:', trimmed.substring(0, 50));
      showTessToast('🌐 Respuesta traducida al idioma del cliente', 'success');
    } else {
      area.value = sourceText;
      showTessToast('⚠ Error de traducción', 'error');
    }
  } catch (e) {
    console.warn('[TRANSLATE] Error:', e.message);
    area.value = sourceText;
    showTessToast('⚠ Error de traducción', 'error');
  }
}

// ============ REFRESH EATER ============
function refreshEaterSuggestions() {
  const clientName = currentClientName || 'Cliente';
  const profileEl = document.querySelector(TALK_Y.PROFILE_DETAIL) || document.body;
  const profile = {
    name: clientName,
    interests: extractInterests(profileEl),
    location: extractLocation(profileEl),
    bio: extractBio(profileEl),
    age: extractAge(profileEl),
    hasPhoto: checkPhoto(profileEl),
    hobbies: extractHobbies(profileEl)
  };
  
  const area = document.getElementById('eaterResponseArea');
  if (area) { area.value = '🤖 Generando...'; area.style.color = '#888'; }

  const btn2 = document.getElementById('btnRefreshEater2');
  if (btn2) {
    btn2.textContent = '🤖 IA...';
    btn2.style.background = 'rgba(139,92,246,0.5)';
  }

  window._eaterTranslated = false;
  window._eaterOriginalResponse = '';
  let currentText = eaterResponse || '';
  if (_selectedEaterMessages.length > 0) {
    currentText = _selectedEaterMessages.join(' | ');
    _clearEaterSelection();
  }
  if (!currentText || currentText.length < 3) {
    currentText = eaterResponse || '';
  }
  if (!window._eaterClientMsgText) {
    window._eaterClientMsgText = currentText;
    var _detectedLang2 = typeof detectLanguage === 'function' ? detectLanguage(currentText) : null;
    window._eaterClientMsgLang = _detectedLang2;
  }
  generateWithAI(clientName, profile, currentText).then(response => {
    eaterResponse = Tesseract.set('eaterResponse', response || generateLocalResponse(clientName, profile));
    window._eaterOriginalResponse = eaterResponse;
    if (eaterResponse) _processedTexts.add(eaterResponse.substring(0, 80));
    isUsingAI = Tesseract.set('isUsingAI', !!response);
    if (btn2) {
      btn2.textContent = isUsingAI ? '🤖 IA' : '🔄 FRASES';
      btn2.style.background = isUsingAI ? 'rgba(139,92,246,0.3)' : 'rgba(30,27,75,0.7)';
    }
    displaySuggestions(clientName);
  }).catch(() => {
    eaterResponse = Tesseract.set('eaterResponse', generateLocalResponse(clientName, profile));
    window._eaterOriginalResponse = eaterResponse;
    if (eaterResponse) _processedTexts.add(eaterResponse.substring(0, 80));
    isUsingAI = Tesseract.set('isUsingAI', false);
    if (btn2) { btn2.textContent = '🔄 FRASES'; btn2.style.background = 'rgba(30,27,75,0.7)'; }
    displaySuggestions(clientName);
  });
}

// ============ TRADUCCIÓN (ES → EN / FR / PT) ============
async function translateText(text, targetCode, targetName) {
  var defaultLang = translateLanguages.find(function (l) { return l.code === selectedLangCode; }) || translateLanguages[0];
  const code = targetCode || defaultLang.code;
  const name = targetName || defaultLang.name;
  if (code === 'es') return text;
  try {
    var sysMsg = (typeof TESS_TRANSLATOR_POLICY!=='undefined'?TESS_TRANSLATOR_POLICY+' ':'') + 'Traduce el siguiente texto del español al ' + name + ' (' + code + '). Responde SOLO con la traducción, sin explicaciones ni notas.';
    var groqData = await Tesseract.callGroq(
      [{ role: 'system', content: sysMsg }, { role: 'user', content: text }],
      'openai/gpt-oss-120b',
      300
    );
    var translated = groqData?.choices?.[0]?.message?.content;
    if (translated && translated.trim()) return translated.trim();
  } catch (e) {
    console.warn('[TESSERACT] Translate error:', e.message);
  }
  return text;
}

// Load my profile ID from storage on init
(function loadMyProfileId() {
  chrome.storage.local.get('tess_my_profile_id', function(d) {
    if (d.tess_my_profile_id) window._tessMyProfileId = d.tess_my_profile_id;
  });
})();

// ============ PERFIL ACTIVO ============
function detectCurrentProfile() {
  const badge = document.getElementById('profileBadge');
  const nameEl = document.getElementById('profileName');
  const idEl = document.getElementById('profileId');
  if (!badge || !nameEl || !idEl) return;

  let profileName = '';
  let profileId = '';

  // Detect own profile from my-profile page (dashboard)
  const myProfilePage = document.querySelector('.my-profile-page');
  if (myProfilePage) {
    const nameHeader = myProfilePage.querySelector('[class*="user-info-header"] [class*="name"] p, [class*="user-info-header__name"] p');
    if (nameHeader) {
      var nameText = nameHeader.textContent.trim().replace(/,?\s*\d{1,3}$/, '').trim();
      if (nameText && nameText.length < 40) profileName = nameText;
    }
    const idTextEl = Array.from(myProfilePage.querySelectorAll('p, span, div')).find(function(el) {
      return el.textContent && /Profile ID:\s*\d{6,15}/.test(el.textContent);
    });
    if (idTextEl) {
      var match = idTextEl.textContent.match(/Profile ID:\s*(\d{6,15})/);
      if (match) {
        profileId = match[1];
        window._tessMyProfileId = match[1];
        chrome.storage.local.set({ tess_my_profile_id: match[1] });
        console.log('[TESSERACT] My profile ID saved:', window._tessMyProfileId);
      }
    }
  }
  // Fallback: use operator ID from chat URL if available
  if (window._tessOperatorId && !window._tessMyProfileId) {
    window._tessMyProfileId = window._tessOperatorId;
  }

  const urlMatch = location.pathname.match(/\/(?:profile|user|member|u|id)\/([^/?#]+)/i);
  if (urlMatch) {
    const val = urlMatch[1];
    if (/^\d{6,15}$/.test(val)) profileId = val;
    else if (!profileName && val.length < 40) profileName = val;
  }

  const title = document.title;
  const titleClean = title.replace(/[|-].*$/, '').trim();
  if (titleClean && titleClean.toLowerCase() !== 'talkytimes' && titleClean.length < 40) {
    profileName = profileName || titleClean;
  }

  // Try sidebar accordion name first (more reliable on chat page)
  if (!profileName) {
    var sidebarName = document.querySelector('.accordion.profile-info [data-test-id="sidebar-about-interlocutor"] .name, .accordion.profile-info .title-wrapper .name, .accordion.profile-info .name-wrapper .name');
    if (sidebarName) {
      var sn = sidebarName.textContent.trim();
      if (sn && sn.length < 50 && !sn.includes('@') && !sn.includes('http')) profileName = sn;
    }
  }

  const nameSelectors = [
    '[class*="username"]', '[class*="display-name"]', '[class*="profile-name"]',
    '[class*="user-name"]', '[class*="member-name"]', '[class*="nickname"]',
    '[class*="logged-name"]', '[class*="header-user"]', '[class*="my-name"]',
    '[class*="current-user"]', '[class*="user-info"]', '[class*="nav-user"]',
    '[class*="top-user"]', '[class*="logged-in"]', '[class*="welcome"]',
    '[class*="greeting"]', '[class*="user-menu"]', '[class*="account-name"]',
    '[class*="header-name"]', '[class*="user-label"]', '[class*="member-label"]',
    '[id*="username"]', '[id*="displayname"]', '[id*="profile-name"]',
    '[id*="user-name"]', '[aria-label*="profile"]', '[aria-label*="user"]'
  ];
  for (const sel of nameSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const t = el.textContent.trim();
      if (t && t.length < 50 && !t.includes('@') && !t.includes('http')) {
        profileName = t;
        break;
      }
    }
  }

  // Clean profileName: strip "Profile ID:", button text, etc.
  if (profileName) {
    profileName = profileName.replace(/\s*Profile\s*ID:.*$/i, '').replace(/\s*Edit\s+\w+.*$/i, '').trim();
  }

  // Try to get ID from selected dialog item (messages page with chat open)
  if (!profileId) {
    const selectedDialog = document.querySelector('.dialog-item[data-isselected="true"]');
    if (selectedDialog) {
      const avatar = selectedDialog.querySelector('.ui-avatar[id]');
      if (avatar) {
        const avatarId = avatar.getAttribute('id').trim();
        if (/^\d{6,15}$/.test(avatarId)) {
          profileId = avatarId;
          const nameEl = selectedDialog.querySelector('.dialog-item__name');
          if (nameEl) profileName = nameEl.textContent.trim();
        }
      }
    }
  }

  if (!profileId) {
    const attrs = ['data-user-id', 'data-profile-id', 'data-member-id', 'data-id', 'data-uid', 'data-user', 'data-profile'];
    for (const a of attrs) {
      const v = document.body.getAttribute(a) || document.documentElement.getAttribute(a);
      if (v && /^\d{6,15}$/.test(v)) { profileId = v; break; }
    }
  }

  if (!profileName) {
    const imgs = document.querySelectorAll('img[class*="avatar"], img[class*="profile"], img[class*="photo"], img[alt]:not([alt=""])');
    for (const img of imgs) {
      const alt = (img.alt || '').trim();
      if (alt && alt.length < 40 && !/photo|avatar|profile|imagen|user/i.test(alt)) {
        profileName = alt; break;
      }
    }
  }

  if (!profileId) {
    const m = location.href.match(/\/(\d{6,15})(?:[/?#]|$)/);
    if (m) profileId = m[1];
  }
  const chatM = location.href.match(/\/chat\/(\d{6,15})_(\d{6,15})/);
  if (chatM) {
    window._cribsChatIds = [chatM[1], chatM[2]];
    window._tessOperatorId = chatM[1];
    chrome.storage.local.set({ tess_operator_id: chatM[1] });
    // Determine which ID is the contact vs our own profile
    if (window._tessMyProfileId) {
      var myRawId = String(window._tessMyProfileId).replace(/^0+/, '');
      var id1 = String(chatM[1]).replace(/^0+/, '');
      var id2 = String(chatM[2]).replace(/^0+/, '');
      profileId = id1 === myRawId ? chatM[2] : chatM[1]; // pick the non-user ID
    } else {
      profileId = chatM[2]; // fallback: old behavior
    }
  } else {
    window._cribsChatIds = null;
  }

  if (!profileName) {
    const links = document.querySelectorAll('a[href*="profile"], a[href*="perfil"], a[href*="my-"], a[href*="account"]');
    for (const link of links) {
      const t = (link.textContent || '').trim();
      if (t && t.length < 40 && !/profile|perfil|account|my\s/i.test(t) && !t.includes('@')) {
        profileName = t; break;
      }
    }
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      try {
        const val = JSON.parse(localStorage.getItem(key));
        if (val && typeof val === 'object') {
          if (val.userId || val.id || val.user_id) {
            const id = String(val.userId || val.id || val.user_id);
            if (/^\d{6,15}$/.test(id) && !profileId) profileId = id;
          }
          if ((val.name || val.username || val.displayName) && !profileName) {
            profileName = val.name || val.username || val.displayName;
          }
        }
      } catch (e) {}
      if (profileName && profileId) break;
    }
  } catch (e) {}

  if (!profileName || !profileId) {
    try {
      const globalKeys = ['__INITIAL_STATE__', '__DATA__', '__USER__', '__PROFILE__', '__NEXT_DATA__'];
      for (const gk of globalKeys) {
        const data = window[gk];
        if (data && typeof data === 'object') {
          const str = JSON.stringify(data);
          const idM = str.match(/"id"\s*:\s*"(\d{6,15})"/) || str.match(/"userId"\s*:\s*"(\d{6,15})"/);
          if (idM && !profileId) profileId = idM[1];
          const nM = str.match(/"name"\s*:\s*"([^"]{2,40})"/) || str.match(/"username"\s*:\s*"([^"]{2,40})"/);
          if (nM && !profileName) profileName = nM[1];
        }
      }
    } catch (e) {}
  }

  console.log('[TESSERACT] Profile detection:', profileId, '| name:', profileName, '| url:', location.href);

  if (profileName || profileId) {
    nameEl.textContent = profileName || '—';
    idEl.textContent = 'ID: ' + (profileId || '—');
    badge.style.display = 'flex';
    var rawId = profileId ? profileId.replace(/^0+/, '') : '';
    if (rawId) {
      // Skip if this is our own profile
      if (window._tessMyProfileId && rawId === String(window._tessMyProfileId).replace(/^0+/, '')) {
        console.log('[CRIBS] Es mi propio perfil, saltando CRIBS:', rawId);
      } else {
        var isSame = window._lastCribsPid === rawId;
        var hasAlternates = window._cribsChatIds && window._cribsChatIds.length > 1 && window._cribsChatIds.some(function (id) { return String(id).replace(/^0+/, '') !== rawId; });
        if (!isSame || hasAlternates) {
          console.log('[CRIBS] Detectado:', rawId, '| anterior:', window._lastCribsPid, '| alternates:', window._cribsChatIds ? JSON.stringify(window._cribsChatIds) : 'ninguno');
          window._lastCribsPid = rawId;
          if (window._cribsDetectTimer) { clearTimeout(window._cribsDetectTimer); window._cribsDetectTimer = null; }
          window._cribsDetectTimer = setTimeout(function () { window._cribsDetectTimer = null; fetchCribsForProfile(rawId); }, 150);
        } else {
          console.log('[CRIBS] Mismo perfil sin alternates, saltando:', rawId);
        }
      }
    }
  } else {
    badge.style.display = 'none';
    window._lastCribsPid = '';
  }
}

function stopProfileWatcher() {
  if (titleObserver) { titleObserver.disconnect(); titleObserver = null; }
  if (loginObserver) { loginObserver.disconnect(); loginObserver = null; }
  if (urlPollInterval) { clearInterval(urlPollInterval); urlPollInterval = null; }
}

function startProfileWatcher() {
  stopProfileWatcher();
  detectCurrentProfile();
  var titleEl = document.querySelector(TALK_Y.PAGE_TITLE);
  if (titleEl) {
    var lastTitle = titleEl.textContent;
    titleObserver = new MutationObserver(function () {
      if (titleEl.textContent !== lastTitle) {
        lastTitle = titleEl.textContent;
        setTimeout(detectCurrentProfile, 400);
      }
    });
    titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }
  let lastUrl = location.href;
  urlPollInterval = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(detectCurrentProfile, 600);
    }
  }, 1500);
  window.addEventListener('popstate', function () {
    setTimeout(detectCurrentProfile, 600);
  });
  loginObserver = new MutationObserver(() => {
    if (isAuthenticated) detectCurrentProfile();
  });
  loginObserver.observe(document.getElementById('mainScreen') || document.body, { attributes: true, childList: true, subtree: true });
}
