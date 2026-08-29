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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'google/gemini-3.1-flash-lite-image';

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
  try {
    const r = await fetch(`${GEMINI_API}/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) return { ok: false, status: r.status, data: j };
    const parts = (j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || '').join('');
    if (!text) return { ok: false, status: r.status, data: { error: 'Gemini devolvió respuesta vacía' } };
    return { ok: true, status: 200, data: { choices: [{ message: { role: 'assistant', content: text } }] } };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
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
  return callAI(OPENAI_API, key, model || 'gpt-3.5-turbo', messages, maxTokens);
}

function extractContent(data) {
  return data?.choices?.[0]?.message?.content || null;
}

// Cascada completa: OpenRouter -> Gemini -> Groq -> OpenAI
async function aiCascade(messages, requestedModel, maxTokens) {
  const attempts = [
    ['OpenRouter', () => {
      // Solo respetar el modelo pedido si es familia gemini/google; si no, usar el default de OR
      const m = requestedModel && /gemini|google/i.test(requestedModel) ? requestedModel : undefined;
      return tryOpenRouter(messages, m, maxTokens);
    }],
    ['Gemini', () => tryGemini(messages, maxTokens)],
    ['Groq', () => tryGroqWithFallback(messages, GROQ_MODEL, maxTokens)],
    ['OpenAI', () => tryOpenAI(messages, undefined, maxTokens)]
  ];
  for (const [name, fn] of attempts) {
    let r;
    try { r = await fn(); } catch (e) { r = { ok: false, status: 0, data: { error: e.message } }; }
    if (r.ok && extractContent(r.data)) return { provider: name, data: r.data };
    console.error(`[AI-PROXY] ${name} falló:`, JSON.stringify({ status: r.status, error: r.data?.error?.message || r.data?.error || r.data }));
  }
  return null;
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
    const { messages, model, max_tokens } = req.body;

    const winner = await aiCascade(messages, model, max_tokens);
    if (winner) {
      if (winner.provider !== 'OpenRouter') console.log('[AI-PROXY] respondió via', winner.provider);
      return res.json(winner.data);
    }

    res.status(503).json({
      error: 'Todos los proveedores AI fallaron',
      fallback: true
    });
  } catch (err) {
    console.error('[AI-PROXY] chat error:', err.message);
    res.status(500).json({ error: err.message, fallback: true });
  }
});

// POST /api/chatgpt/image - Generación de imágenes (OpenRouter: Nano Banana 2 Lite)
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
    let imageKey, imageModel;
    if (useAlt) {
      imageKey = process.env.OPENROUTER_IMAGE_API_KEY_2 || process.env.OPENROUTER_IMAGE_API_KEY || process.env.OPENROUTER_API_KEY;
      imageModel = (model && String(model).trim()) || process.env.IMAGE_MODEL_2_2 || process.env.IMAGE_MODEL_2 || 'google/gemini-3.1-flash-lite-image';
    } else {
      imageKey = process.env.OPENROUTER_IMAGE_API_KEY || process.env.OPENROUTER_API_KEY;
      imageModel = (model && String(model).trim()) || process.env.IMAGE_MODEL || 'google/gemini-3-pro-image';
    }
    if (!imageKey) return res.status(500).json({ error: 'OPENROUTER_IMAGE_API_KEY/OPENROUTER_API_KEY no configurada' });

    const targetModel = imageModel;
    // Nota: los modelos Gemini-image NO aceptan {size} ('330x330' -> 400 "Request contains an invalid argument").
    // Se usa resolution (tier normalizado) + aspect_ratio. Por defecto 1K cuadrado (~1024x1024).
    const payload = { model: targetModel, prompt: String(prompt).trim(), n: 1, output_format: 'png', resolution: String(req.body.resolution || process.env.IMAGE_RESOLUTION || (useAlt ? '512' : '1K')), aspect_ratio: String(req.body.aspect_ratio || '1:1') };
    if (refs.length) payload.input_references = refs;

    async function attempt(opts) {
      const resp = await fetch(OPENROUTER_IMAGE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${imageKey}` },
        body: JSON.stringify(opts)
      });
      const j = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, j };
    }

    let out = await attempt(payload);
    if (!out.ok && /output_format|input_references|size|aspect|resolution|invalid argument|not supported|unknown field|parameter/i.test(JSON.stringify(out.j))) {
      delete payload.output_format;
      delete payload.input_references;
      delete payload.resolution;
      delete payload.aspect_ratio;
      out = await attempt(payload);
    }
    if (!out.ok) {
      return res.status(out.status || 502).json({ error: (out.j && (out.j.error?.message || out.j.error)) || 'Error generando imagen' });
    }

    const item = out.j?.data?.[0];
    if (!item) return res.status(502).json({ error: 'OpenRouter no devolvió imagen' });

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
    if (!b64) return res.status(502).json({ error: 'Respuesta de imagen vacía' });

    res.json({ success: true, provider: 'OpenRouter', model: targetModel, format, base64: b64 });
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

    const content2 = winnerT ? extractContent(winnerT.data) : null;
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

    const content4 = winnerD ? extractContent(winnerD.data) : null;
    if (content4) {
      return res.json({ translatedText: content4.trim() });
    }

    res.json({ translatedText: text });
  } catch (err) {
    res.json({ translatedText: req.body.text });
  }
});

module.exports = router;
