// TESSERACT - Shared Configuration
// Single source of truth for all configurable values.
// Content scripts use Tesseract.API instead (state-manager.js).
// Page scripts (popup, login, dashboard, admin) and service worker (background.js)
// should reference this file for consistent values.

var TESSERACT_CONFIG = {
  API: (typeof TESSERACT_API_OVERRIDE !== 'undefined') ? TESSERACT_API_OVERRIDE : 'https://tesseract-v3-production.up.railway.app',
  APP_NAME: 'TESSERACT',
  APP_VERSION: '3.0.0',
  ALLOWED_DOMAIN: 'talkytimes.com',
  SYNC_TIMEOUT: 15000,
  API_TIMEOUT: 20000
};

// Backward-compatible aliases
var TESSERACT_API = TESSERACT_CONFIG.API;
