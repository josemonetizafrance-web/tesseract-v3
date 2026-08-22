// background.js - TESSERACT v24.0 (Backend Integrado)
// API URL: defined in dist/modules/config.js, loaded via service worker registration
var TESSERACT_API = (typeof TESSERACT_API_OVERRIDE !== 'undefined') ? TESSERACT_API_OVERRIDE : 'https://tesseract-v3-production.up.railway.app';

// Toda la IA pasa por el proxy del servidor (cascada OpenRouter -> Gemini -> Groq -> OpenAI).
// Las claves viven como variables de entorno en Railway; la extension no guarda ninguna.

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
      try {
        const stored = await chrome.storage.local.get(['tess_jwt']);
        if (!stored.tess_jwt) {
          sendResponse({ error: 'Inicia sesión para usar la IA.' });
          return;
        }
        const res = await fetch(TESSERACT_API + '/api/chatgpt/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + stored.tess_jwt },
          body: JSON.stringify({ messages: message.messages, max_tokens: message.maxTokens || 500 })
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
            model: message.model || 'openai/gpt-oss-120b',
            max_tokens: message.maxTokens || 500
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

