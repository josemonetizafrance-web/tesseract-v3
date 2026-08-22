// background.js - TESSERACT v24.0 (Backend Integrado)
// API URL: defined in dist/modules/config.js, loaded via service worker registration
var TESSERACT_API = (typeof TESSERACT_API_OVERRIDE !== 'undefined') ? TESSERACT_API_OVERRIDE : 'https://tesseract-v3-production.up.railway.app';

// ── Proveedores IA: OpenRouter (PRINCIPAL) -> Gemini directo -> proxy railway ──
// Las claves viven en dist/modules/keys.local.js (fuera del control de versiones)
try { importScripts('../modules/keys.local.js'); } catch (e) {}
var KEYS = (typeof TESS_KEYS !== 'undefined') ? TESS_KEYS : {};
var OPENROUTER_KEY = KEYS.OPENROUTER_KEY || '';
var OPENROUTER_MODEL = KEYS.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
var GEMINI_KEY = KEYS.GEMINI_KEY || '';
var GEMINI_MODEL = KEYS.GEMINI_MODEL || 'gemini-3.7-flash';

function toChoicesShape(text, model) {
  return { choices: [{ message: { role: 'assistant', content: text } }], model: model || 'provider' };
}

async function callGeminiDirect(messages, maxTokens) {
  var sys = [];
  var contents = [];
  (messages || []).forEach(function (m) {
    if (m.role === 'system') sys.push(m.content);
    else contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content == null ? '' : m.content) }] });
  });
  var body = { contents: contents };
  if (sys.length) body.systemInstruction = { parts: [{ text: sys.join('\n\n') }] };
  if (maxTokens) body.generationConfig = { maxOutputTokens: maxTokens };
  var ctrl = new AbortController();
  var to = setTimeout(function () { ctrl.abort(); }, 30000);
  try {
    var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + GEMINI_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    var json = await res.json();
    if (!res.ok) throw new Error((json.error && json.error.message) || ('Gemini ' + res.status));
    var parts = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
    var text = (parts || []).map(function (p) { return p.text || ''; }).join('');
    if (!text) throw new Error('Gemini devolvio respuesta vacia');
    return toChoicesShape(text, GEMINI_MODEL);
  } finally { clearTimeout(to); }
}

async function callOpenRouter(messages, model, maxTokens) {
  var ctrl = new AbortController();
  var to = setTimeout(function () { ctrl.abort(); }, 30000);
  try {
    var res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENROUTER_KEY },
      body: JSON.stringify({ model: model || OPENROUTER_MODEL, messages: messages, max_tokens: maxTokens || 500 }),
      signal: ctrl.signal
    });
    var json = await res.json();
    if (!res.ok) throw new Error((json.error && json.error.message) || ('OpenRouter ' + res.status));
    if (!(json.choices && json.choices[0] && json.choices[0].message)) throw new Error('OpenRouter devolvio respuesta vacia');
    return json;
  } finally { clearTimeout(to); }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('TESSERACT v24.0 installed');
});

chrome.runtime.onStartup.addListener(() => {
  checkAuthStatus();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'LOGIN_SUCCESS') {
    console.log('[BG] Login:', message.email);
    sendResponse({ success: true });
  } else if (message.action === 'LOGOUT') {
    chrome.storage.local.clear();
    sendResponse({ success: true });
  } else if (message.action === 'CHECK_AUTH') {
    (async () => { sendResponse(await checkAuthStatus()); })();
    return true;
  } else if (message.action === 'GET_SUBSCRIPTION') {
    (async () => { sendResponse(await getSubscriptionInfo()); })();
    return true;
  } else if (message.action === 'CRIBS_REFRESH') {
    // Reenviar a todas las extension pages (dashboard)
    chrome.runtime.sendMessage({ action: 'CRIBS_REFRESH' }, function () { if (chrome.runtime.lastError) { /* no hay pginas abiertas */ } });
    sendResponse({ success: true });
  } else if (message.action === 'AI_REQUEST') {
    (async () => {
      const msgs = message.messages;
      const mt = message.maxTokens || 500;
      // 1) OpenRouter (principal)
      try {
        sendResponse({ data: await callOpenRouter(msgs, OPENROUTER_MODEL, mt) });
        return;
      } catch (e1) { console.warn('[BG] OpenRouter fallo:', e1.message); }
      // 2) Gemini directo (respaldo gratuito)
      try {
        sendResponse({ data: await callGeminiDirect(msgs, mt) });
        return;
      } catch (e2) { console.warn('[BG] Gemini fallo:', e2.message); }
      // 3) Proxy railway (ultimo recurso, requiere sesion)
      try {
        const stored = await chrome.storage.local.get(['tess_jwt']);
        if (!stored.tess_jwt) {
          sendResponse({ error: 'Inicia sesión para usar la IA.' });
          return;
        }
        const res = await fetch(TESSERACT_API + '/api/chatgpt/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + stored.tess_jwt },
          body: JSON.stringify({ messages: msgs, max_tokens: mt })
        });
        const json = await res.json();
        if (res.ok && json.choices) {
          sendResponse({ data: json });
          return;
        }
        const errMsg = json.error?.message || json.error || ('Error ' + res.status);
        console.warn('[BG] AI proxy falló:', res.status, errMsg);
        sendResponse({ error: errMsg });
      } catch (e) {
        console.warn('[BG] Error en fetch AI:', e.message);
        sendResponse({ error: e.message || 'Error de red al contactar el servidor AI' });
      }
    })();
    return true;
  } else if (message.action === 'GROQ_REQUEST') {
    (async () => {
      const model = message.model || 'openai/gpt-oss-120b';
      const mt = message.maxTokens || 500;
      // Modelos Gemini: OpenRouter primero, luego Gemini directo
      if (/gemini|google/i.test(model)) {
        try {
          sendResponse({ data: await callOpenRouter(message.messages, model, mt) });
          return;
        } catch (e1) { console.warn('[BG] OpenRouter fallo:', e1.message); }
        try {
          sendResponse({ data: await callGeminiDirect(message.messages, mt) });
          return;
        } catch (e2) { console.warn('[BG] Gemini fallo:', e2.message); }
      }
      // Resto de modelos: proxy railway como siempre
      try {
        const auth = await chrome.storage.local.get('tess_jwt');
        if (!auth.tess_jwt) {
          sendResponse({ error: 'Inicia sesión para usar la IA.' });
          return;
        }
        const res = await fetch(TESSERACT_API + '/api/chatgpt/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + auth.tess_jwt
          },
          body: JSON.stringify({
            messages: message.messages,
            model: model,
            max_tokens: mt
          })
        });
        const json = await res.json();
        if (res.ok && json.choices) {
          sendResponse({ data: json });
          return;
        }
        const errMsg = json.error?.message || json.error || ('Error ' + res.status);
        console.warn('[BG] Proxy falló:', res.status, errMsg);
        sendResponse({ error: errMsg });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }
  return true;
});

async function checkAuthStatus() {
  try {
    const data = await chrome.storage.local.get(['tess_jwt', 'user_email']);
    if (!data.tess_jwt || !data.user_email) return { loggedIn: false };

    return {
      loggedIn: true,
      status: 'active',
      isPremium: true,
      timeRemaining: Infinity,
      isApproved: true
    };
  } catch (e) {
    return { loggedIn: false, error: e.message };
  }
}

async function getSubscriptionInfo() {
  try {
    const data = await chrome.storage.local.get(['tess_jwt']);
    if (!data.tess_jwt) return { status: 'none', isPremium: false, timeRemaining: 0 };
    return { status: 'active', isPremium: true, timeRemaining: Infinity };
  } catch (e) {
    return { status: 'none', isPremium: false, timeRemaining: 0 };
  }
}

chrome.webNavigation?.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const dashboardUrl = chrome.runtime.getURL('dist/pages/dashboard/dashboard.html');
  if (details.url.includes(dashboardUrl)) {
    const auth = await checkAuthStatus();
    if (!auth.loggedIn) {
      chrome.tabs.update(details.tabId, {
        url: chrome.runtime.getURL('dist/pages/login/login.html')
      });
    }
  }
});

