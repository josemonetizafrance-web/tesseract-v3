const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_IMAGE_API = 'https://openrouter.ai/api/v1/images/generations';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_MODEL_FALLBACK = process.env.GROQ_MODEL_FALLBACK || 'qwen/qwen3.6-27b';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_MODEL_FALLBACKS = (process.env.GEMINI_MODEL_FALLBACK || 'gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash').split(',').map((s) => s.trim()).filter(Boolean);
const VENICE_API = 'https://api.venice.ai/api/v1/chat/completions';
const VENICE_MODEL = process.env.VENICE_MODEL || 'venice-uncensored';
const VENICE_MODEL_FALLBACK = process.env.VENICE_MODEL_FALLBACK || 'most_uncensored';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const OPENAI_MODEL_FALLBACKS = (process.env.OPENAI_MODEL_FALLBACK || '').split(',').map((s) => s.trim()).filter(Boolean);
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'google/gemini-3.1-flash-lite-image';

// Modelos de imagen validos en OpenRouter (verificados contra GET /api/v1/models).
// OpenRouter responde 404 {"error":"No model found for X"} si el id no existe, y una
// env var mal escrita rompe TODAS las imagenes. Se valida y se cae al siguiente.
const OR_IMAGE_PRO_DEFAULT = 'google/gemini-3-pro-image';
const OR_IMAGE_LITE_DEFAULT = 'google/gemini-3.1-flash-lite-image';
const OR_IMAGE_MODELS_VALID = [
  OR_IMAGE_PRO_DEFAULT,
  OR_IMAGE_LITE_DEFAULT,
  'google/gemini-2.5-flash-image'
];

// Devuelve la cadena de modelos a intentar: el de la env si es valido, el default
// del preset y despues el resto de validos (degradacion elegante).
function imageModelChain(envValue, defaultModel, requestModel) {
  const explicit = String(requestModel || '').trim();
  if (explicit) {
    if (OR_IMAGE_MODELS_VALID.indexOf(explicit) !== -1) return [explicit];
    console.warn(`[AI-PROXY][IMG] modelo solicitado "${explicit}" no existe en OpenRouter; se ignora`);
  }
  const out = [];
  const envM = String(envValue || '').trim();
  if (envM) {
    if (OR_IMAGE_MODELS_VALID.indexOf(envM) !== -1) out.push(envM);
    else console.warn(`[AI-PROXY][IMG] IMAGE_MODEL="${envM}" no es un modelo de imagen valido en OpenRouter; se ignora`);
  }
  if (out.indexOf(defaultModel) === -1) out.push(defaultModel);
  for (const m of OR_IMAGE_MODELS_VALID) if (out.indexOf(m) === -1) out.push(m);
  return out;
}

// Reintenta con modelo alternativo si el primario no existe (404)
async function tryGroqWithFallback(messages, model, maxTokens) {
  let result = await tryGroq(messages, model, maxTokens);
  if ((!result.ok || !extractContent(result.data)) && result.status === 404 && model !== GROQ_MODEL_FALLBACK) {
    console.warn('[AI-PROXY] Modelo Groq 404 (' + model + '), reintentando con fallback:', GROQ_MODEL_FALLBACK);
    result = await tryGroq(messages, GROQ_MODEL_FALLBACK, maxTokens);
  }
  return result;
}

async function callAI(apiUrl, apiKey, model, messages, maxTokens) {
  const body = { model, messages, max_tokens: Math.max(maxTokens || 500, 300) };
  if (apiUrl === GROQ_API && String(model).indexOf('gpt-oss') !== -1) body.reasoning_effort = 'low';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

// 1) OpenRouter (principal)
function tryOpenRouter(messages, model, maxTokens) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return Promise.resolve({ ok: false, status: 0, data: { error: 'OPENROUTER_API_KEY no configurada' } });
  return callAI(OPENROUTER_API, key, model || OPENROUTER_MODEL, messages, maxTokens);
}

// 2) Gemini directo (respaldo gratuito)
function geminiToContents(messages) {
  const sys = [];
  const contents = [];
  (messages || []).forEach((m) => {
    if (m.role === 'system') sys.push(m.content);
    else contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content == null ? '' : m.content) }] });
  });
  const body = { contents };
  if (sys.length) body.systemInstruction = { parts: [{ text: sys.join('\n\n') }] };
  return body;
}

async function tryGemini(messages, maxTokens) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, status: 0, data: { error: 'GEMINI_API_KEY no configurada' } };
  const body = geminiToContents(messages);
  if (maxTokens) body.generationConfig = { maxOutputTokens: Math.max(maxTokens, 300) };
  const models = [GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS].filter((m, i, arr) => arr.indexOf(m) === i);
  let last = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`${GEMINI_API}/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const j = await r.json();
        last = { ok: r.ok, status: r.status, model, data: j };
        if (!r.ok) {
          const transient = r.status === 429 || r.status === 503;
          const gErr = (j && j.error && (j.error.message || j.error.status)) || (typeof j === 'string' ? j.slice(0, 160) : 'sin detalle');
          console.warn(`[AI-PROXY] Gemini ${model} falló (${r.status}${transient ? ', reintentando' : ''}): ${String(gErr).slice(0, 180)} -> probando siguiente modelo`);
          if (transient && attempt === 0) { await new Promise((res) => setTimeout(res, 1200)); continue; }
          break;
        }
        const parts = (j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        const text = parts.map((p) => p.text || '').join('');
        if (!text) {
          console.warn(`[AI-PROXY] Gemini ${model} respuesta vacía, probando siguiente modelo`);
          break;
        }
        return { ok: true, status: 200, model, data: { choices: [{ message: { role: 'assistant', content: text } }] } };
      } catch (e) {
        last = { ok: false, status: 0, model, data: { error: e.message } };
        break;
      }
    }
  }
  return last || { ok: false, status: 0, data: { error: 'GEMINI_API_KEY no configurada' } };
}

// 3) Groq
function tryGroq(messages, model, maxTokens) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return Promise.resolve({ ok: false, status: 0, data: { error: 'GROQ_API_KEY no configurada' } });
  return callAI(GROQ_API, key, model || GROQ_MODEL, messages, maxTokens);
}

// 4) OpenAI (último recurso)
function tryOpenAI(messages, model, maxTokens) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Promise.resolve({ ok: false, status: 0, data: { error: 'OPENAI_API_KEY no configurada' } });
  return callAI(OPENAI_API, key, model || OPENAI_MODEL, messages, maxTokens);
}

// OpenAI es el ÚLTIMO proveedor de la cascada: si su modelo no existe o se ha
// retirado (404/400), no queda nadie detrás. Reintenta con OPENAI_MODEL_FALLBACK
// (lista separada por comas) antes de rendirse.
async function tryOpenAIWithFallback(messages, model, maxTokens) {
  const primary = model || OPENAI_MODEL;
  const result = await tryOpenAI(messages, primary, maxTokens);
  if (result.ok || !OPENAI_MODEL_FALLBACKS.length) {
    if (!result.ok && result.status === 404) {
      console.warn(`[AI-PROXY] OpenAI no reconoce el modelo "${primary}"; revisa OPENAI_MODEL en Render`);
    }
    return result;
  }
  if (result.status !== 404 && result.status !== 400 && result.status !== 403) return result;
  console.warn(`[AI-PROXY] OpenAI falló con "${primary}" (${result.status}); probando modelo de respaldo`);
  let last = result;
  for (const fb of OPENAI_MODEL_FALLBACKS) {
    const r = await tryOpenAI(messages, fb, maxTokens);
    if (r.ok) {
      console.log(`[AI-PROXY] OpenAI respondió con el modelo de respaldo "${fb}"`);
      return r;
    }
    last = r;
  }
  return last;
}

// 5) Venice.ai (uncensored, opcional: se usa con provider:'venice' o como último respaldo).
function veniceKeys() {
  const out = [];
  if (process.env.VENICE_API_KEY) out.push(process.env.VENICE_API_KEY);
  for (let i = 2; i <= 30; i++) {
    const k = process.env['VENICE_API_KEY_' + i];
    if (k) out.push(k);
  }
  return out;
}

async function tryVenice(messages, model, maxTokens) {
  const keys = veniceKeys();
  if (!keys.length) return { ok: false, status: 0, data: { error: 'VENICE_API_KEY no configurada' } };
  const body = {
    model: model || VENICE_MODEL,
    messages,
    max_tokens: Math.max(maxTokens || 500, 300),
    venice_parameters: { include_venice_system_prompt: false }
  };
  let last = null;
  for (const key of keys) {
    try {
      const resp = await fetch(VENICE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify(body)
      });
      const j = await resp.json().catch(() => ({}));
      last = { ok: resp.ok, status: resp.status, data: j };
      if (!resp.ok) {
        console.warn(`[AI-PROXY] Venice (${keys.indexOf(key) + 1}/${keys.length}) falló (${resp.status}), rotando clave`);
        continue;
      }
      if (!extractContent(j)) {
        console.warn('[AI-PROXY] Venice devolvió respuesta vacía, rotando clave');
        continue;
      }
      return { ok: true, status: 200, data: j };
    } catch (e) {
      last = { ok: false, status: 0, data: { error: e.message } };
    }
  }
  return last || { ok: false, status: 0, data: { error: 'VENICE_API_KEY no configurada' } };
}

async function tryVeniceWithFallback(messages, model, maxTokens) {
  let result = await tryVenice(messages, model, maxTokens);
  if ((!result.ok || !extractContent(result.data)) && result.status === 404 && model === VENICE_MODEL) {
    console.warn('[AI-PROXY] Modelo Venice 404 (' + model + '), reintentando con:', VENICE_MODEL_FALLBACK);
    result = await tryVenice(messages, VENICE_MODEL_FALLBACK, maxTokens);
  }
  return result;
}

function extractContent(data) {
  return data?.choices?.[0]?.message?.content || null;
}

// Detección de rechazo por política de contenido (OpenAI content_policy, Gemini SAFETY, etc.)
function isContentRefusal(status, data) {
  const text = JSON.stringify(data || {}).toLowerCase();
  if (/404|not found|invalid_api_key|authentication|unauthorized|quota|rate.?limit|high demand|internal/.test(text)) return false;
  return /content_policy|content policy|does not (allow|comply)|not allowed to|safety|moderation|responsible ai|sensitive content|sexual|erotic|explicit|policy violation|reject|refus|block.?reason|blockreason|safety_rating|harmcat/i.test(text);
}

// Cascada completa: OpenRouter -> Gemini -> Groq -> Venice -> OpenAI
// Si llega preferProvider:'venice', Venice va primero (tono sin censura).
async function aiCascade(messages, requestedModel, maxTokens, preferProvider) {
  const attempts = [];
  const venice = ['Venice', () => tryVeniceWithFallback(messages, requestedModel && /venice/i.test(requestedModel) ? requestedModel : undefined, maxTokens)];
  const openrouter = ['OpenRouter', () => {
    // Solo respetar el modelo pedido si es familia gemini/google; si no, usar el default de OR
    const m = requestedModel && /gemini|google/i.test(requestedModel) ? requestedModel : undefined;
    if (preferProvider === 'venice' && /venice/i.test(requestedModel || '')) return { ok: false, status: 0, data: { error: 'Modelo Venice no aplica a OpenRouter' } };
    return tryOpenRouter(messages, m, maxTokens);
  }];
  const gemini = ['Gemini', () => tryGemini(messages, maxTokens)];
  const groq = ['Groq', () => tryGroqWithFallback(messages, GROQ_MODEL, maxTokens)];
  const openai = ['OpenAI', () => tryOpenAIWithFallback(messages, undefined, maxTokens)];

  if (preferProvider === 'venice') attempts.push(venice, openrouter, gemini, groq, openai);
  else attempts.push(openrouter, gemini, groq, venice, openai);

  const details = [];
  let contentRefused = false;
  for (const [name, fn] of attempts) {
    let r;
    try { r = await fn(); } catch (e) { r = { ok: false, status: 0, data: { error: e.message } }; }
    const reason = r.data?.error?.message || r.data?.error || (typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data).slice(0, 160) : 'sin respuesta'));
    details.push({ provider: name, status: r.status, reason: String(reason) });
    if (r.ok && extractContent(r.data)) return { ok: true, provider: name, data: r.data };
    if (!r.ok && isContentRefusal(r.status, r.data)) {
      contentRefused = true;
      console.warn(`[AI-PROXY] "${name}" rechazó el contenido (política):`, String(reason).slice(0, 140));
    }
    console.error(`[AI-PROXY] ${name} falló:`, JSON.stringify({ status: r.status, error: reason }));
  }

  // Si algún proveedor rechazó el contenido (ej. OpenAI/Gemini con mensaje sexual),
  // reintentar UNA vez con Venice adaptando la respuesta al tono del cliente.
  if (contentRefused && veniceKeys().length) {
    const toneNote = { role: 'system', content: 'El proveedor anterior rechazó el mensaje por política de contenido. Responde al cliente respetando EXACTAMENTE el tono que él usa: si su mensaje es picante, atrevido o con carga sensual, acompáñalo con el MISMO nivel de temperatura, natural y sin censura ni moralismo, SIN escalar más que él. Nunca subas el clima por encima de lo que el cliente puso. Usa el idioma del cliente y responde SOLO el texto de la respuesta.' };
    console.log('[AI-PROXY] Reintento de generación con Venice (tono reflejado)');
    let rv = null;
    try { rv = await tryVeniceWithFallback(messages.concat([toneNote]), requestedModel && /venice/i.test(requestedModel) ? requestedModel : undefined, maxTokens); } catch (e) { rv = null; }
    if (rv && rv.ok && extractContent(rv.data)) {
      details.push({ provider: 'Venice (retry por política)', status: 200, reason: 'tono reflejado OK' });
      return { ok: true, provider: 'Venice', data: rv.data };
    }
  }

  return { ok: false, details };
}

// GET /api/chatgpt/models - lista de modelos Groq disponibles (diagnostico)
router.get('/api/chatgpt/models', validateToken, async (req, res) => {
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) return res.status(500).json({ error: 'GROQ_API_KEY no configurada' });
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json({ models: (data.data || []).map(m => m.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chatgpt/chat - EATER AI (OpenRouter -> Gemini -> Groq -> OpenAI)
router.post('/api/chatgpt/chat', validateToken, async (req, res) => {
  try {
    const { messages, model, max_tokens, provider } = req.body;

    const winner = await aiCascade(messages, model, max_tokens, provider);
    if (winner && winner.ok) {
      if (winner.provider !== 'OpenRouter') console.log('[AI-PROXY] respondió via', winner.provider);
      return res.json(winner.data);
    }

    res.status(503).json({
      error: 'Todos los proveedores AI fallaron',
      details: winner && winner.details ? winner.details : [],
      fallback: true
    });
  } catch (err) {
    console.error('[AI-PROXY] chat error:', err.message);
    res.status(500).json({ error: err.message, fallback: true });
  }
});

// Fallback directo a Gemini (gratis, sin OpenRouter) para generación de imágenes.
async function geminiImageFallback(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const candidates = [
    String(process.env.GEMINI_IMAGE_MODEL || '').trim() || 'gemini-3.1-flash-lite-image',
    'gemini-3.1-flash-image'
  ];
  const seen = new Set();
  for (const m of candidates) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: String(prompt).trim() }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
        })
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) continue;
      const parts = (j.candidates || []).flatMap(c => (c.content && c.content.parts) || []);
      const img = parts.find(p => p.inlineData && p.inlineData.data);
      if (!img) continue;
      let gformat = 'png';
      const gmt = String(img.inlineData.mimeType || '').toLowerCase();
      if (gmt.includes('jpeg') || gmt.includes('jpg')) gformat = 'jpeg';
      else if (gmt.includes('webp')) gformat = 'webp';
      return { base64: img.inlineData.data, format: gformat, model: m };
    } catch (e) { /* probar siguiente modelo */ }
  }
  console.log('[AI-PROXY][IMG] fallback Gemini no devolvió imagen');
  return null;
}

// POST /api/chatgpt/image - Generación de imágenes (OpenRouter: Nano Banana 2 Lite, con fallback gratis a Gemini)
router.post('/api/chatgpt/image', validateToken, async (req, res) => {
  try {
    const { prompt, model, size, preset, references } = req.body || {};
    if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: 'Prompt requerido' });
    if (String(prompt).trim().length > 2000) return res.status(400).json({ error: 'Prompt demasiado largo' });

    // Imágenes de referencia opcionales (imagen-a-imagen). Data URLs o URLs HTTP(S), máx. 14 (límite Gemini).
    let refs = [];
    if (Array.isArray(references)) {
      refs = references
        .filter(r => typeof r === 'string' && /^(data:image\/[a-z0-9.+-]+;base64,|https?:\/\/)/i.test(String(r).trim()))
        .slice(0, 14)
        .map(r => ({ type: 'image_url', image_url: { url: String(r).trim() } }));
    }

    // Preset 1 (default): Nano Banana Pro. Preset 2: Nano Banana 2 Lite (más barato).
    const useAlt = String(preset || '').toLowerCase() === '2';
    const envImageModel = useAlt
      ? (process.env.IMAGE_MODEL_2_2 || process.env.IMAGE_MODEL_2)
      : process.env.IMAGE_MODEL;
    const modelChain = imageModelChain(envImageModel, useAlt ? OR_IMAGE_LITE_DEFAULT : OR_IMAGE_PRO_DEFAULT, model);

    // Rotación: N claves del tipo (PRO o LITE) + claves legacy de respaldo.
    function collectImageKeys(prefix) {
      const out = [];
      for (let i = 1; i <= 60; i++) {
        const k = process.env[prefix + String(i).padStart(2, '0')] || process.env[prefix + String(i)];
        if (k) out.push(k);
      }
      return out;
    }
    const legacyKeys = useAlt
      ? [process.env.OPENROUTER_IMAGE_API_KEY_2, process.env.OPENROUTER_IMAGE_API_KEY, process.env.OPENROUTER_API_KEY]
      : [process.env.OPENROUTER_IMAGE_API_KEY, process.env.OPENROUTER_API_KEY];
    const imageKeys = collectImageKeys(useAlt ? 'OPENROUTER_IMAGE_LITE_KEY_' : 'OPENROUTER_IMAGE_PRO_KEY_')
      .concat(legacyKeys.filter(Boolean))
      .filter((v, i, a) => a.indexOf(v) === i);
    if (!imageKeys.length) {
      const g = await geminiImageFallback(String(prompt).trim());
      if (g) return res.json({ success: true, provider: 'Gemini', model: g.model, format: g.format, base64: g.base64 });
      return res.status(500).json({ error: 'Sin claves OpenRouter de imagen y sin GEMINI_API_KEY para imágenes' });
    }

    // Nota: los modelos Gemini-image NO aceptan {size} ('330x330' -> 400 "Request contains an invalid argument").
    // Se usa resolution (tier normalizado) + aspect_ratio. Por defecto 1K cuadrado (~1024x1024).
    const basePayload = { prompt: String(prompt).trim(), n: 1, output_format: 'png', resolution: String(req.body.resolution || process.env.IMAGE_RESOLUTION || (useAlt ? '512' : '1K')), aspect_ratio: String(req.body.aspect_ratio || '1:1') };
    if (refs.length) basePayload.input_references = refs;

    async function attemptKey(apiKey, opts) {
      const resp = await fetch(OPENROUTER_IMAGE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(opts)
      });
      const j = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, j };
    }

    let out = null;
    let lastStatus = null;
    let lastErr = '';
    let creditFailures = 0;
    outer:
    for (const targetModel of modelChain) {
    for (const imageKey of imageKeys) {
      let opts = Object.assign({ model: targetModel }, basePayload);
      let r = await attemptKey(imageKey, opts);
      if (!r.ok && /output_format|input_references|size|aspect|resolution|invalid argument|not supported|unknown field|parameter/i.test(JSON.stringify(r.j))) {
        const stripped = {};
        Object.keys(opts).forEach(function (k) {
          if (typeof opts[k] === 'undefined') return;
          if (/output_format|input_references|resolution|aspect_ratio|size/i.test(k)) return;
          stripped[k] = opts[k];
        });
        opts = stripped;
        r = await attemptKey(imageKey, opts);
      }
      out = r;
      lastStatus = r.status;
      lastErr = (r.j && (r.j.error?.message || r.j.error)) || 'Error generando imagen';
      console.log(`[AI-PROXY] imagen modelo ${targetModel} clave ${imageKeys.indexOf(imageKey) + 1}/${imageKeys.length} (${r.status})${r.ok ? '' : ', rotando'}`);
      if (!r.ok) {
        // El modelo no existe (404 / "No model found"): inservible para TODAS las claves -> siguiente modelo.
        if (r.status === 404 || /no model found|model not found/i.test(lastErr)) {
          console.warn(`[AI-PROXY][IMG] OpenRouter no reconoce "${targetModel}"; probando siguiente modelo`);
          continue outer;
        }
        // Sin saldo / límite de tasa: es problema de la CUENTA de la clave, no del modelo.
        if (r.status === 402 || r.status === 429 || /insufficient credits|insufficient_quota|rate limit|too many requests/i.test(lastErr)) {
          creditFailures++;
          console.warn(`[AI-PROXY][IMG] clave ${imageKeys.indexOf(imageKey) + 1}/${imageKeys.length} sin saldo/limite (${r.status}): ${String(lastErr).slice(0, 120)}`);
        }
        continue;
      }
      const item = r.j?.data?.[0];
      if (!item) { lastErr = 'OpenRouter no devolvió imagen'; continue; }

      let b64 = item.b64_json;
      let format = 'png';
      const mt = String(item.media_type || '').toLowerCase();
      if (mt.includes('jpeg') || mt.includes('jpg')) format = 'jpeg';
      else if (mt.includes('webp')) format = 'webp';
      else if (mt.includes('svg')) format = 'svg';
      if (!b64 && item.url) {
        const imgResp = await fetch(item.url);
        if (!imgResp.ok) return res.status(502).json({ error: 'No se pudo descargar la imagen generada' });
        b64 = Buffer.from(await imgResp.arrayBuffer()).toString('base64');
        const ct = (imgResp.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('jpeg')) format = 'jpeg';
        else if (ct.includes('webp')) format = 'webp';
      }
      if (!b64) { lastErr = 'Respuesta de imagen vacía'; continue; }

      return res.json({ success: true, provider: 'OpenRouter', model: targetModel, format, base64: b64 });
    }
    // Todas las claves fallaron por saldo/limite -> probar otro modelo con las MISMAS claves
    // no va a funcionar. Salir al fallback gratis de Gemini.
    if (creditFailures >= imageKeys.length) {
      console.warn(`[AI-PROXY][IMG] las ${imageKeys.length} clave(s) de imagen fallaron por saldo/limite; no pruebo mas modelos`);
      break outer;
    }
    }

    // Ninguna clave funcionó -> fallback gratis a Gemini (imágenes).
    const g = await geminiImageFallback(String(prompt).trim());
    if (g) return res.json({ success: true, provider: 'Gemini', model: g.model, format: g.format, base64: g.base64 });
    const allOutOfCredits = creditFailures >= imageKeys.length && imageKeys.length > 0;
    if (allOutOfCredits) {
      return res.status(402).json({
        error: `OpenRouter: sin credito en las ${imageKeys.length} clave(s) de imagen. Anade creditos en https://openrouter.ai/settings/credits o configura GEMINI_API_KEY para el fallback gratis.`,
        detail: lastErr,
        outOfCredits: true
      });
    }
    return res.status(lastStatus || 502).json({ error: lastErr || 'Error generando imagen' });
  } catch (err) {
    console.error('[AI-PROXY] image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/openai/translate - Traducción
router.post('/api/openai/translate', validateToken, async (req, res) => {
  try {
    const { text, targetLang, targetName, forceSpanish } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto requerido' });

    // Soporte para multi-idioma (targetLang: en, fr, pt) o legacy (forceSpanish)
    let langCode, langName;
    if (targetLang && targetName) {
      langCode = targetLang;
      langName = targetName;
    } else if (forceSpanish) {
      langCode = 'es';
      langName = 'español';
    } else {
      langCode = 'en';
      langName = 'inglés';
    }

    const systemMsg = `Traduce el siguiente texto del español al ${langName} (${langCode}). Responde SOLO con la traducción, sin explicaciones ni notas.`;

    const winnerT = await aiCascade([
      { role: 'system', content: systemMsg },
      { role: 'user', content: text }
    ], null, 500);

    const content2 = winnerT && winnerT.ok ? extractContent(winnerT.data) : null;
    if (content2) {
      return res.json({ success: true, data: { translations: [{ text: content2.trim() }] } });
    }

    res.json({ success: false, data: { translations: [{ text }] } });
  } catch (err) {
    res.json({ success: false, data: { translations: [{ text: req.body.text }] } });
  }
});

// POST /api/deepl/translate - DeepL-style translate
router.post('/api/deepl/translate', validateToken, async (req, res) => {
  try {
    const { text, target } = req.body;

    const systemMsg = `Traduce al ${target || 'español'}. Solo responde con el texto traducido.`;

    const winnerD = await aiCascade([
      { role: 'system', content: systemMsg },
      { role: 'user', content: text }
    ], null, 500);

    const content4 = winnerD && winnerD.ok ? extractContent(winnerD.data) : null;
    if (content4) {
      return res.json({ translatedText: content4.trim() });
    }

    res.json({ translatedText: text });
  } catch (err) {
    res.json({ translatedText: req.body.text });
  }
});

module.exports = router;
