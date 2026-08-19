require('dotenv').config();
const express = require('express');
const cors = require('cors');

if (!process.env.TESS_JWT_SECRET || process.env.TESS_JWT_SECRET === 'REEMPLAZA_ESTO_CON_CLAVE_GENERADA' || process.env.TESS_JWT_SECRET === 'cambia_esto_por_una_clave_generada_con_npm_run_keygen') {
  console.error('Configura TESS_JWT_SECRET en .env');
  process.exit(1);
}

const { securityHeaders, requestLogger, rateLimitMiddleware, globalErrorHandler } = require('./middleware/index.js');
const { validateToken, requireTesseractAdmin, requireMasterAdmin, checkSubscription } = require('./middleware/auth-tesseract.js');

const authRoutes = require('./routes/auth-tesseract.js');
const adminRoutes = require('./routes/admin-tesseract.js');
const metricsRoutes = require('./routes/metrics-tesseract.js');
const aiProxyRoutes = require('./routes/ai-proxy.js');
const mailingRoutes = require('./routes/mailing-tesseract.js');
const supportRoutes = require('./routes/support-tesseract.js');
const notesRoutes = require('./routes/notes-tesseract.js');
const cribsRoutes = require('./routes/cribs-tesseract.js');
const setupRoutes = require('./routes/setup.js');

const { initDb } = require('./db/tesseract.js');
const { runMigrations } = require('./db/migrator.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^edge-extension:\/\//,
      /^http:\/\/localhost:/,
      /^https:\/\/(.*\.)?talkytimes\.com$/
    ];
    if (allowed.some(r => r.test(origin))) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(securityHeaders);
app.use(requestLogger);
app.use(rateLimitMiddleware);

app.get('/api/health', async (req, res) => {
  let dbStatus = 'down';
  try {
    const { getDb } = require('./db/tesseract.js');
    const db = getDb();
    await Promise.race([
      db.command({ ping: 1 }),
      new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout ping')); }, 6000); })
    ]);
    dbStatus = 'ok';
  } catch (e) { dbStatus = 'down'; }
  const uri = process.env.MONGODB_URI || '';
  const m = uri.match(/@([^/?]+)/);
  res.json({
    status: 'ok',
    version: '3.0.0',
    timestamp: Date.now(),
    db: dbStatus,
    mongoHost: m ? m[1] : 'no configurada',
    groq: process.env.GROQ_API_KEY ? 'configurada' : 'no configurada',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'TESSERACT Server',
    version: '3.0.0',
    endpoints: [
      'POST /api/tess/auth/login',
      'GET  /api/tess/auth/verify',
      'GET  /api/tess/auth/users',
      'POST /api/tess/admin/create-office',
      'GET  /api/tess/admin/offices',
      'DELETE /api/tess/admin/offices/:name',
      'POST /api/tess/admin/set-office-admin',
      'POST /api/tess/admin/create-user',
      'POST /api/tess/admin/set-office',
      'GET  /api/tess/admin/users',
      'GET  /api/tess/admin/metrics',
      'GET  /api/tess/admin/activity-log',
      'GET  /api/tess/admin/metrics-daily',
      'GET  /api/tess/admin/metrics-by-user',
      'POST /api/tess/admin/premium',
      'POST /api/tess/admin/ban',
      'POST /api/tess/admin/unban',
      'POST /api/tess/admin/developer',
      'POST /api/tess/admin/set-password',
      'POST /api/tess/admin/set-plan',
      'POST /api/tess/metrics/sync',
      'GET  /api/tess/metrics/my',
      'POST /api/chatgpt/chat',
      'POST /api/openai/translate',
      'POST /api/deepl/translate',
      'GET  /api/tess/mailing/config',
      'POST /api/tess/mailing/config',
      'POST /api/tess/mailing/increment',
      'GET  /api/tess/mailing/stats',
      'POST /api/tess/notes',
      'GET  /api/tess/notes',
      'PUT  /api/tess/notes/:id',
      'DELETE /api/tess/notes/:id',
      'POST /api/tess/notes/:id/share',
      'POST /api/tess/notes/:id/unshare',
      'GET  /api/tess/notes/shared',
      'GET  /api/tess/notes/users',
      'GET  /api/health'
    ]
  });
});

app.use(authRoutes);
app.use(adminRoutes);
app.use(metricsRoutes);
app.use(aiProxyRoutes);
app.use(mailingRoutes);
app.use(supportRoutes);
app.use(notesRoutes);
app.use(cribsRoutes);
app.use(setupRoutes);

app.use(globalErrorHandler);

(async () => {
  try {
    const db = await initDb();
    app.locals.db = db;
    await runMigrations(db);
    app.listen(PORT, () => {
      console.log(`TESSERACT Server corriendo en http://localhost:${PORT}`);
      console.log(`Admin: ${process.env.TESS_ADMIN_EMAIL || 'ChevyAdmin@tesseract.com'}`);
    });
  } catch (err) {
    console.error('Error al iniciar servidor:', err);
    process.exit(1);
  }
})();
