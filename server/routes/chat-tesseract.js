/**
 * ROUTES/CHAT-TESSERACT - Chat en vivo Admin <-> Operadores (MongoDB, polling)
 */
const { Router } = require('express');
const { saveChatMessage, getChatMessages, markChatRead, getAdminThreads } = require('../db/tesseract.js');
const { validateToken, requireTesseractAdmin } = require('../middleware/auth-tesseract.js');

const router = Router();
const ADMIN_ID = 'ADMIN';

// Enviar mensaje. Operadores siempre escriben al ADMIN; el admin elige destinatario.
router.post('/api/tess/chat/send', validateToken, async (req, res) => {
  try {
    const { to, text } = req.body;
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'Mensaje vacío' });
    let target;
    if (req.user.is_admin || req.user.is_developer) {
      target = String(to || '').trim().toLowerCase();
      if (!target || target === ADMIN_ID) return res.status(400).json({ error: 'Destinatario requerido' });
    } else {
      target = ADMIN_ID;
    }
    const msg = await saveChatMessage(req.user.email, target, String(text).trim());
    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[CHAT] send error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// Mensajes de un hilo. Admin usa ?with=email; operador recibe su hilo con ADMIN.
router.get('/api/tess/chat/messages', validateToken, async (req, res) => {
  try {
    const isAdmin = !!(req.user.is_admin || req.user.is_developer);
    const after = Number(req.query.after) || 0;
    let a, b;
    if (isAdmin) {
      b = String(req.query.with || '').trim().toLowerCase();
      if (!b) return res.status(400).json({ error: 'Parámetro "with" requerido' });
      a = ADMIN_ID;
    } else {
      a = req.user.email;
      b = ADMIN_ID;
    }
    const messages = await getChatMessages(a, b, after);
    if (!after && messages.length >= 0) await markChatRead(a, b);
    res.json({ messages });
  } catch (err) {
    console.error('[CHAT] messages error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// Lista de hilos para el panel admin
router.get('/api/tess/chat/threads', validateToken, requireTesseractAdmin, async (req, res) => {
  try {
    res.json({ threads: await getAdminThreads() });
  } catch (err) {
    console.error('[CHAT] threads error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

module.exports = router;
