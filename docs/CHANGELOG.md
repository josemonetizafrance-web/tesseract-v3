# Changelog — Tesseract 2.0

## [2026-06-13] — Mailing Pagination, Blocked/Deleted Skip & Icebreakers Fix

### Added
- **Mailing**: `isBlockedOrDeletedUser()` detection — skips contacts with "Deleted User" name or "User has blocked you" message within 2s instead of waiting 6s for input (`smart-mailing.js:553`)
- **Mailing**: Pre-click check in main loop — scans contact element text for "deleted user" / "has blocked you" before opening conversation (`smart-mailing.js:687-690`)
- **Mailing**: Pagination snapshot comparison — detects actual page change after clicking "next"; breaks only if content unchanged after 3 attempts (`smart-mailing.js:716-726`)
- **Mailing**: `PAGINATOR_CONTAINER` selector as fallback for next-button detection (`dom-selectors.js:116`)
- **Mailing**: `pageLetterCount()` — reads letter count from page to enforce `maxLetterCount` limit before sending (`smart-mailing.js:618`)
- **Saludo Push**: `spTranslate()` ES→EN translation function, `traducir` checkbox in UI, per-profile contacted history (`talky-saludo-push.js`)
- **DOM Selectors**: `BLOCKED_USER_CONTAINER`, `DELETED_USER_SELECTOR`, `DELETED_USER_TEXT` (`dom-selectors.js:119-121`)

### Changed
- **Groq model**: `llama-3.3-70b-versatile` → `llama-3.1-8b-instant` (higher rate limits); `max_tokens` 4000→1500 (`routes/ai-proxy.js`)
- **Icebreaker mood chip logic**: removed `data-isselected` attribute check (doesn't exist in DOM) — now clicks directly (`talky-core-state.js`)
- **Icebreaker category ordering**: enforced send order friendship→real_love→hot_talks→mail (`talky-core-state.js`)
- **Icebreaker "create new" selector**: XPath → `label.chip-root[data-test-id*="create-icebreaker"]` (`dom-selectors.js:149`)
- **Saludo Push API URL**: `window.TESSERACT_API` → `Tesseract.API` (the former is never defined) (`talky-saludo-push.js`)
- **Pagination limit removed**: `stuckCount > 5` break condition eliminated — goes through all available pages (`smart-mailing.js:672`)

### Fixed
- **Restored missing routes**: `routes/ai-proxy.js` and all server route files overwritten by bad deploy — restored from old commit
- **server.js BOM**: Removed UTF-8 Byte Order Mark causing "Invalid or unexpected token" on Render
- **server `__tests__`**: Moved into `server/` directory to fix Chrome extension "filenames starting with _ are reserved" error
- **AI JSON parsing**: Handles markdown code fences in AI response, adds explicit JSON format instruction, logs raw response (`talky-core-state.js`)
- **Icebreaker textarea selectors**: Now match by `placeholder` + `maxlength` instead of fragile class names (`dom-selectors.js:150-151`)
- **Icebreaker "create new" XPath**: Was `//p[...]/..` (targeted inner `<p>`) — changed to `//label[.//p[...]]` (targets wrapping `<label>`)

### Project
- Git repos initialized and pushed to GitHub (`josemonetizafrance-web/tesseract-extension` and `tesseract-server`)
- `auto-answer.js` and `auto-answer-panel.js` replaced from `Tesseract_DEV.zip`

## [2026-06-03] — Logo, Auth Removal & Bugfixes

### Changed
- **Logo reemplazado**: Se reemplazó el inline SVG (rectángulo + checkmark) por `Tesseract_Logo.svg` externo en dashboard, login, admin y panel flotante.
- **Animación del logo**: El spin del dashboard cambió de 2D (`rotate`) a 3D horizontal (`perspective + rotateY`).
- **Tamaño del logo**: Dashboard 280px → 340px. Login 200px → 280px.
- **Admin layout**: Eliminado `<h1>TESSERACT ADMIN</h1>`, el logo se movió dentro de `.header-info`.
- **Eliminado `<h1>TESSERACT</h1>`** de dashboard, login, popup y admin.
- **Icono de extensión**: Reemplazados `icon16/48/128.png` con `descarga.png` redimensionado.

### Fixed
- **btnClose no funcionaba**: El CSS tenía `display:block !important` que sobreescribía `style.display='none'`. Se cambió a `toggleMin()` que funciona correctamente.
- **Dist desactualizado**: Los archivos `dist/` aún tenían los inline SVGs viejos. Se sincronizaron con `src/`.
- **Reminder.js**: Se eliminó todo el sistema de recordatorios (alarma audible + notificación visual "TASA DE RESPUESTA EN RIESGO"). Reemplazado con stubs vacíos.
- **talky-sweep.js**: Removidas llamadas a `onOperatorResponded()`.

### Removed
- **Autenticación del bot panel**: Eliminado completamente:
  - Login screen HTML (formulario email/clave)
  - Funciones `doLogin()` y `doLogout()`
  - `tryRefreshToken()`
  - CSS de autenticación (`.auth-section`, `.auth-form`, etc.)
  - `tess_auth` de `saveAllStates()` / `loadAllStates()`
  - `isAuthenticated` ahora es `true` por defecto
  - `currentUser` tiene valor default `'agente@tesseract.com'`
  - `startPeriodicSync()` se inicia automáticamente al cargar el panel

### Project
- Carpeta renombrada a `Tesseract 2.0` y movida a la raíz de Downloads.
