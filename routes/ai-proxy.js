const { Router } = require('express');
const { validateToken } = require('../middleware/auth-tesseract.js');

const router = Router();

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_MODEL_FALLBACK = process.env.GROQ_MODEL_FALLBACK || 'qwen/qwen3.6-27b';

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
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens || 500 })
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

function tryGroq(messages, model, maxTokens) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return Promise.resolve({ ok: false, status: 0, data: { error: 'GROQ_API_KEY no configurada' } });
  return callAI(GROQ_API, key, model || GROQ_MODEL, messages, maxTokens);
}

function tryOpenAI(messages, model, maxTokens) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Promise.resolve({ ok: false, status: 0, data: { error: 'OPENAI_API_KEY no configurada' } });
  return callAI(OPENAI_API, key, model || 'gpt-3.5-turbo', messages, maxTokens);
}

function extractContent(data) {
  return data?.choices?.[0]?.message?.content || null;
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

// POST /api/chatgpt/chat - EATER AI (Groq gratis -> OpenAI fallback)
router.post('/api/chatgpt/chat', validateToken, async (req, res) => {
  try {
    const { messages, model, max_tokens } = req.body;
    const payload = { messages, model, max_tokens };

    const groqResult = await tryGroqWithFallback(payload.messages, GROQ_MODEL, payload.max_tokens);
    if (groqResult.ok && extractContent(groqResult.data)) {
      return res.json(groqResult.data);
    }
    console.error('[AI-PROXY] Groq fallÃ³:', JSON.stringify({ status: groqResult.status, error: groqResult.data?.error || groqResult.data }));

    const openaiResult = await tryOpenAI(payload.messages, 'gpt-3.5-turbo', payload.max_tokens);
    if (openaiResult.ok && extractContent(openaiResult.data)) {
      return res.json(openaiResult.data);
    }
    console.error('[AI-PROXY] OpenAI fallÃ³:', JSON.stringify({ status: openaiResult.status, error: openaiResult.data?.error || openaiResult.data }));

    const groqError = groqResult.data?.error?.message || groqResult.data?.error || 'desconocido';
    const openaiError = openaiResult.data?.error?.message || openaiResult.data?.error || 'no configurado';
    res.status(503).json({
      error: 'Ambos proveedores AI fallaron',
      groq: { status: groqResult.status, error: groqError },
      openai: { status: openaiResult.status, error: openaiError },
      fallback: true
    });
  } catch (err) {
    console.error('[AI-PROXY] chat error:', err.message);
    res.status(500).json({ error: err.message, fallback: true });
  }
});

// POST /api/openai/translate - TraducciÃ³n
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
      langName = 'espaÃ±ol';
    } else {
      langCode = 'en';
      langName = 'inglÃ©s';
    }

    const systemMsg = `Traduce el siguiente texto del espaÃ±ol al ${langName} (${langCode}). Responde SOLO con la traducciÃ³n, sin explicaciones ni notas.`;

    var groqResult2 = await tryGroqWithFallback([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], GROQ_MODEL, 500);
    var content2 = groqResult2.ok ? extractContent(groqResult2.data) : null;
    if (content2) {
      return res.json({ success: true, data: { translations: [{ text: content2.trim() }] } });
    }

    var openaiResult2 = await tryOpenAI([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'gpt-3.5-turbo', 500);
    var content3 = openaiResult2.ok ? extractContent(openaiResult2.data) : null;
    if (content3) {
      return res.json({ success: true, data: { translations: [{ text: content3.trim() }] } });
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
    if (!text) return res.status(400).json({ error: 'Texto requerido' });

    const systemMsg = `Traduce al ${target || 'espaÃ±ol'}. Solo responde con el texto traducido.`;

    var groqResult3 = await tryGroqWithFallback([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], GROQ_MODEL, 500);
    var content4 = groqResult3.ok ? extractContent(groqResult3.data) : null;
    if (content4) {
      return res.json({ translatedText: content4.trim() });
    }

    var openaiResult3 = await tryOpenAI([{ role: 'system', content: systemMsg }, { role: 'user', content: text }], 'gpt-3.5-turbo', 500);
    var content5 = openaiResult3.ok ? extractContent(openaiResult3.data) : null;
    if (content5) {
      return res.json({ translatedText: content5.trim() });
    }

    res.json({ translatedText: text });
  } catch (err) {
    res.json({ translatedText: req.body.text });
  }
});

module.exports = router;
