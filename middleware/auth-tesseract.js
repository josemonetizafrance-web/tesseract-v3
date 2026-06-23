const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.TESS_JWT_SECRET || 'fallback_secret';

function validateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireTesseractAdmin(req, res, next) {
  if (!req.user?.isAdmin && !req.user?.isDeveloper) {
    return res.status(403).json({ error: 'Acceso denegado: se requiere rol admin' });
  }
  next();
}

function requireMasterAdmin(req, res, next) {
  if (!req.user?.isDeveloper) {
    return res.status(403).json({ error: 'Acceso denegado: solo master admin' });
  }
  next();
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

module.exports = { validateToken, requireTesseractAdmin, requireMasterAdmin, checkSubscription };
