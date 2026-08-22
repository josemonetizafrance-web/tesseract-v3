const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const JWT_SECRET = process.env.TESS_JWT_SECRET || 'fallback_secret';

function generateToken(userId) {
  return jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: '7d' });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function validateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  try {
    const { findUserById } = require('../db/tesseract.js');
    const user = await findUserById(decoded.sub);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = user;
    return next();
  } catch (err) {
    console.warn('[AUTH] DB no disponible, autenticando por JWT:', err.message);
  }
  req.user = {
    _id: decoded.sub,
    email: decoded.email || null,
    is_admin: 0, is_developer: 0, is_office_admin: 0,
    is_banned: 0, is_approved: 1, is_premium: 1
  };
  next();
}

function requireTesseractAdmin(req, res, next) {
  if (!req.user?.is_admin && !req.user?.is_developer && !req.user?.is_office_admin) {
    return res.status(403).json({ error: 'Acceso denegado: se requiere rol admin' });
  }
  next();
}

function requireMasterAdmin(req, res, next) {
  if (!req.user?.is_developer) {
    return res.status(403).json({ error: 'Acceso denegado: solo master admin' });
  }
  next();
}

// Solo la cuenta raiz (TESS_ADMIN_EMAIL) puede gestionar staff.
// Los masters/admins creados NO pueden usar estas funciones.
function requireRootMaster(req, res, next) {
  const root = (process.env.TESS_ADMIN_EMAIL || 'ChevyAdmin@tesseract.com').toLowerCase();
  if ((req.user?.email || '').toLowerCase() !== root) {
    return res.status(403).json({ error: 'Solo el administrador raíz puede gestionar staff' });
  }
  next();
}

function enforceOfficeFilter(req, res, next) {
  const user = req.user;
  if (user?.is_developer || user?.is_admin) return next();
  if (user?.is_office_admin && user?.office) {
    req.query.office = user.office;
    return next();
  }
  return res.status(403).json({ error: 'Acceso denegado: no tienes permisos' });
}

async function requireOfficeScoped(req, res, next) {
  try {
    const user = req.user;
    if (user?.is_developer || user?.is_admin) return next();
    if (user?.is_office_admin && user?.office) {
      const email = req.body?.email || req.params?.email;
      if (!email) return res.status(400).json({ error: 'Email requerido' });
      const { findUserByEmail } = require('../db/tesseract.js');
      const target = await findUserByEmail(email);
      if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (String(target.office || '') !== String(user.office)) {
        return res.status(403).json({ error: 'No puedes operar sobre usuarios de otra oficina' });
      }
      return next();
    }
    return res.status(403).json({ error: 'Acceso denegado' });
  } catch (err) {
    return res.status(500).json({ error: 'Error de autorización' });
  }
}

function checkSubscription(req, res, next) {
  const db = req.app.locals.db;
  if (!db) return res.status(500).json({ error: 'DB no disponible' });

  db.collection('tess_users').findOne({ email: req.user.email.toLowerCase() })
    .then(user => {
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (user.is_banned) return res.status(403).json({ error: 'Usuario suspendido' });
      if (user.is_approved === 0) return res.status(403).json({ error: 'Usuario pendiente de aprobación' });

      const now = Date.now();
      if (user.demo_expiry && user.demo_expiry < now && !user.is_premium && !user.is_admin) {
        return res.status(403).json({ error: 'Periodo de demo expirado' });
      }
      if (user.premium_expiry && user.premium_expiry < now && user.is_premium) {
        return res.status(403).json({ error: 'Suscripción premium expirada' });
      }

      req.tessUser = user;
      next();
    })
    .catch(err => {
      console.error('[AUTH] checkSubscription error:', err);
      res.status(500).json({ error: 'Error al verificar suscripción' });
    });
}

module.exports = {
  validateToken, requireTesseractAdmin, requireMasterAdmin, checkSubscription,
  generateToken, generateRefreshToken, hashRefreshToken,
  enforceOfficeFilter, requireOfficeScoped, requireRootMaster
};