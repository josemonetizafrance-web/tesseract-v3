/**
 * ROUTES/CHAT-TESSERACT - Mensajeria interna entre usuarios de Tesseract + Soporte (ADMIN)
 * PRIVACIDAD: cada usuario solo ve los hilos donde participa. Nadie mas puede leerlos.
 */
const { Router } = require('express');
const { saveChatMessage, getChatMessages, markChatRead, getAdminThreads, getMyThreads, getChatContacts, findUserByEmail, saveChatMedia, getChatMedia, clearChatThread } = require('../db/tesseract.js');
const { validateToken, requireTesseractAdmin, requireRootMaster } = require('../middleware/auth-tesseract.js');

const router = Router();
const ADMIN_ID = 'ADMIN';
const ONLINE_MS = 5 * 60 * 1000;

function isStaffUser(u) { return !!(u.is_admin || u.user_is_developer || u.is_developer); }

// Enviar mensaje.
//  - sin "to" (o to=ADMIN): hilo de SOPORTE con el administrador.
//  - con "to"=email: conversacion privada entre dos usuarios registrados.
// MASTER/ADMIN/OPERADOR: todos envían con su email real.
// Si destino es ADMIN_ID, se resuelve al email real del admin principal.
router.post('/api/tess/chat/send', validateToken, async (req, res) => {
  try {
    const { to, text } = req.body;
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'Mensaje vacío' });
    const rawTo = String(to || '').trim().toLowerCase();
    const rootAdmin = (process.env.TESS_ADMIN_EMAIL || 'ChevyAdmin@tesseract.com').toLowerCase();
    let fromId, target;

    if (!rawTo || rawTo === ADMIN_ID.toLowerCase()) {
      fromId = req.user.email;
      target = rootAdmin;
    } else {
      const dest = await findUserByEmail(rawTo);
      if (!dest) return res.status(404).json({ error: 'Usuario destino no encontrado' });
      if (String(dest.email).toLowerCase() === String(req.user.email).toLowerCase()) {
        return res.status(400).json({ error: 'No puedes escribirte a ti mismo' });
      }
      target = String(dest.email).toLowerCase();
      fromId = req.user.email;
    }
    const msg = await saveChatMessage(fromId, target, String(text).trim());
    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[CHAT] send error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// Mensajes de un hilo. PRIVACIDAD: el par siempre incluye a req.user.email,
// por lo que un usuario jamas puede leer hilos de terceros.
//  - sin ?with=: hilo de soporte con ADMIN (resuelve al email real)
//  - con ?with=email: hilo privado con ese usuario
// Todos los roles (master, admin, operador) usan la misma logica.
router.get('/api/tess/chat/messages', validateToken, async (req, res) => {
  try {
    const after = Number(req.query.after) || 0;
    const withQ = String(req.query.with || '').trim().toLowerCase();
    const rootAdmin = (process.env.TESS_ADMIN_EMAIL || 'ChevyAdmin@tesseract.com').toLowerCase();
    let a, b;
    if (withQ && withQ !== ADMIN_ID.toLowerCase()) {
      a = req.user.email;
      b = withQ;
    } else {
      a = req.user.email;
      b = rootAdmin;
    }
    const messages = await getChatMessages(a, b, after);
    if (!after) await markChatRead(a, b);
    res.json({ messages });
  } catch (err) {
    console.error('[CHAT] messages error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// Mis conversaciones (SOLO las mias - privadas)
router.get('/api/tess/chat/my-threads', validateToken, async (req, res) => {
  try {
    res.json({ threads: await getMyThreads(req.user.email) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Limpiar TODO el historial del hilo abierto (solo participantes; borra tambien las imagenes)
router.post('/api/tess/chat/clear', validateToken, async (req, res) => {
  try {
    const me = String(req.user.email);
    const otherRaw = req.body && req.body.with ? String(req.body.with).trim() : '';
    const rootAdmin = (process.env.TESS_ADMIN_EMAIL || 'ChevyAdmin@tesseract.com').toLowerCase();
    const other = !otherRaw || otherRaw === ADMIN_ID.toLowerCase() ? rootAdmin : otherRaw;
    const r = await clearChatThread(me, other);
    console.log('[CHAT] clear por', me, 'hilo con', other, JSON.stringify(r));
    res.json({ success: true, ...r });
  } catch (err) {
    console.error('[CHAT] clear error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Directorio de usuarios para iniciar chats (campos minimos, sin datos sensibles)
router.get('/api/tess/chat/contacts', validateToken, async (req, res) => {
  try {
    const users = await getChatContacts();
    const me = String(req.user.email).toLowerCase();
    res.json({
      contacts: users
        .filter(u => String(u.email).toLowerCase() !== me)
        .map(u => ({
          email: u.email,
          name: u.display_name || u.email.split('@')[0],
          online: !!(u.last_activity && (Date.now() - u.last_activity) < ONLINE_MS),
          staff: !!(u.is_admin || u.is_developer || u.is_office_admin),
          pending: u.is_approved === 0
        }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista de hilos para el panel admin (moderacion)
router.get('/api/tess/chat/threads', validateToken, requireTesseractAdmin, async (req, res) => {
  try {
    res.json({ threads: await getAdminThreads() });
  } catch (err) {
    console.error('[CHAT] threads error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// Migracion one-shot: mensajes legacy donde el admin firmo con su email -> ADMIN
router.post('/api/tess/admin/chat/migrate-legacy', validateToken, requireTesseractAdmin, requireRootMaster, async (req, res) => {
  try {
    const root = (process.env.TESS_ADMIN_EMAIL || 'ChevyAdmin@tesseract.com').toLowerCase();
    const { getDb } = require('../db/tesseract.js');
    const db = getDb();
    const r1 = await db.collection('tess_chat').updateMany(
      { from: root, to: { $ne: ADMIN_ID } },
      { $set: { from: ADMIN_ID } }
    );
    const r2 = await db.collection('tess_chat').updateMany(
      { to: root, from: { $ne: ADMIN_ID } },
      { $set: { to: ADMIN_ID } }
    );
    res.json({ success: true, migrated: r1.modifiedCount + r2.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Migracion inversa: ADMIN -> email real del admin principal (para que el chat funcione entre todos los roles)
router.post('/api/tess/admin/chat/migrate-admin-to-email', validateToken, requireTesseractAdmin, requireRootMaster, async (req, res) => {
  try {
    const root = (process.env.TESS_ADMIN_EMAIL || 'ChevyAdmin@tesseract.com').toLowerCase();
    const { getDb } = require('../db/tesseract.js');
    const db = getDb();
    const r1 = await db.collection('tess_chat').updateMany(
      { from: ADMIN_ID },
      { $set: { from: root } }
    );
    const r2 = await db.collection('tess_chat').updateMany(
      { to: ADMIN_ID },
      { $set: { to: root } }
    );
    res.json({ success: true, migrated: r1.modifiedCount + r2.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar imagen (sube el media y crea el mensaje en una sola llamada)
router.post('/api/tess/chat/send-image', validateToken, async (req, res) => {
  try {
    const { to, dataUrl } = req.body;
    const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) return res.status(400).json({ error: 'Imagen inválida' });
    if (m[2].length > 2800000) return res.status(413).json({ error: 'Imagen demasiado grande (máx ~2MB)' });
    const rootAdmin = (process.env.TESS_ADMIN_EMAIL || 'ChevyAdmin@tesseract.com').toLowerCase();
    const rawTo = String(to || '').trim().toLowerCase();
    let fromId, target;
    if (!rawTo || rawTo === ADMIN_ID.toLowerCase()) {
      fromId = req.user.email;
      target = rootAdmin;
    } else {
      const dest = await findUserByEmail(rawTo);
      if (!dest) return res.status(404).json({ error: 'Usuario destino no encontrado' });
      target = String(dest.email).toLowerCase();
      fromId = req.user.email;
    }
    const media = await saveChatMedia({ data: m[2], mime: m[1], by: fromId, to: target });
    const msg = await saveChatMessage(fromId, target, '', { kind: 'image', mediaId: String(media.id), mime: m[1] });
    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[CHAT] send-image error:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// Descargar imagen de un chat. Solo participantes (o admin para moderar).
router.get('/api/tess/chat/media/:id', validateToken, async (req, res) => {
  try {
    const media = await getChatMedia(req.params.id);
    if (!media) return res.status(404).json({ error: 'Imagen no encontrada' });
    const me = String(req.user.email || '').toLowerCase();
    const isAdmin = !!(req.user.is_admin || req.user.is_developer);
    const allowed = isAdmin ||
      me === String(media.by).toLowerCase() ||
      me === String(media.to).toLowerCase();
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a esta imagen' });
    res.json({ mime: media.mime, data: media.data });
  } catch (err) {
    console.error('[CHAT] media error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Compartir media con otro operador (reenvía el mismo media sin re-subir)
router.post('/api/tess/chat/share-media', validateToken, async (req, res) => {
  try {
    const { mediaId, to } = req.body;
    if (!mediaId || !to) return res.status(400).json({ error: 'mediaId y to requeridos' });
    const me = String(req.user.email || '').toLowerCase();
    const media = await getChatMedia(String(mediaId));
    if (!media) return res.status(404).json({ error: 'Media no encontrado' });
    const allowed = me === String(media.by).toLowerCase() ||
      me === String(media.to).toLowerCase();
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a este media' });
    const rawTo = String(to).trim().toLowerCase();
    let fromId, target;
    if (rawTo === ADMIN_ID.toLowerCase()) {
      fromId = me; target = (process.env.TESS_ADMIN_EMAIL || 'ChevyAdmin@tesseract.com').toLowerCase();
    } else {
      const dest = await findUserByEmail(rawTo);
      if (!dest) return res.status(404).json({ error: 'Usuario destino no encontrado' });
      target = String(dest.email).toLowerCase();
      fromId = me;
    }
    const newMedia = await saveChatMedia({ data: media.data, mime: media.mime, by: fromId, to: target });
    const msg = await saveChatMessage(fromId, target, '', { kind: 'image', mediaId: String(newMedia.id), mime: media.mime });
    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[CHAT] share-media error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
