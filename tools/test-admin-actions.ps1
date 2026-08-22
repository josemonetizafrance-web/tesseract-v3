$ErrorActionPreference = 'Stop'
$API = 'https://tesseract-v3-production.up.railway.app'

function JsonPost($url, $obj, $tok) {
  $b = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))
  if ($tok) { return Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json; charset=utf-8' -Headers @{ Authorization = "Bearer $tok" } -Body $b -TimeoutSec 60 }
  return Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json; charset=utf-8' -Body $b -TimeoutSec 60
}
function TryLogin($email, $pass) {
  try { return JsonPost "$API/api/tess/auth/login" @{ email = $email; password = $pass } $null } catch { return @{ failed = $true; status = $_.Exception.Response.StatusCode.value__ } }
}

# 0) Admin
$admin = TryLogin 'ChevyAdmin@tesseract.com' 'AdminSegura2026*+'
if ($admin.failed) { Write-Output 'FALLO login admin'; exit 1 }
$tok = $admin.token
Write-Output '0) Login admin OK'

# 1) Crear operador de prueba (auto-registro)
$p1 = TryLogin 'prueba.acciones@tesseract.com' 'vieja123*+'
Write-Output "1) Operador creado/logeado: $(if ($p1.failed) { 'FALLO ' + $p1.status } else { 'OK' })"

function GetUser($email) {
  $users = (Invoke-RestMethod -Uri "$API/api/tess/admin/users" -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 60).users
  return $users | Where-Object { $_.email -eq $email }
}

# 2) PREMIUM
$null = JsonPost "$API/api/tess/admin/premium" @{ email = 'prueba.acciones@tesseract.com' } $tok
$u = GetUser 'prueba.acciones@tesseract.com'
Write-Output "2) PREMIUM -> is_premium: $($u.is_premium)"

# 3) BAN + intento de login baneado + UNBAN
$null = JsonPost "$API/api/tess/admin/ban" @{ email = 'prueba.acciones@tesseract.com' } $tok
$u = GetUser 'prueba.acciones@tesseract.com'
$bannedLogin = TryLogin 'prueba.acciones@tesseract.com' 'vieja123*+'
Write-Output "3a) BAN -> is_banned: $($u.is_banned) | login baneado bloqueado: $($bannedLogin.failed) (status $($bannedLogin.status))"
$null = JsonPost "$API/api/tess/admin/unban" @{ email = 'prueba.acciones@tesseract.com' } $tok
$u = GetUser 'prueba.acciones@tesseract.com'
Write-Output "3b) UNBAN -> is_banned: $($u.is_banned)"

# 4) CLAVE
$null = JsonPost "$API/api/tess/admin/set-password" @{ email = 'prueba.acciones@tesseract.com'; password = 'nueva456*+' } $tok
$oldTry = TryLogin 'prueba.acciones@tesseract.com' 'vieja123*+'
$newTry = TryLogin 'prueba.acciones@tesseract.com' 'nueva456*+'
Write-Output "4) CLAVE -> clave vieja rechazada: $($oldTry.failed) | clave nueva aceptada: $(-not $newTry.failed)"

# 5) CORREO
$null = JsonPost "$API/api/tess/admin/set-email" @{ email = 'prueba.acciones@tesseract.com'; newEmail = 'prueba.acciones2@tesseract.com' } $tok
$newMail = TryLogin 'prueba.acciones2@tesseract.com' 'nueva456*+'
Write-Output "5) CORREO -> login con nuevo correo: $(if ($newMail.failed) { 'FALLO ' + $newMail.status } else { 'OK' })"

# 6) DELETE
$del = Invoke-RestMethod -Method Delete -Uri "$API/api/tess/admin/users/prueba.acciones2%40tesseract.com" -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 60
$u = GetUser 'prueba.acciones2@tesseract.com'
Write-Output "6) DELETE -> servidor dice: $($del.success) | usuario restante: $(if ($u) { 'AUN EXISTE' } else { 'eliminado OK' })"
