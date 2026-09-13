# =====================================================================
# NUR ASCII in dieser Datei. PowerShell 5.1 liest eine UTF-8-Datei ohne
# BOM als ANSI; aus einem Gedankenstrich wird dabei ein typografisches
# Anfuehrungszeichen, das eine Zeichenkette vorzeitig beendet - der
# Parser meldet dann eine fehlende Klammer an ganz anderer Stelle.
# veroeffentlichen.ps1 - Repo anlegen, pushen, GitHub Pages einschalten
# ---------------------------------------------------------------------
# Warum als Skript und nicht von Hand: GitHub war am 09.09.2026 und
# wieder am 13.09.2026 vom Heimnetz aus nicht erreichbar (TLS-Zeit-
# ueberschreitung auf 443, kein Anmeldeproblem). Das Skript wartet
# darauf und macht weiter, sobald die Verbindung steht. Es laesst sich
# beliebig oft starten: was schon erledigt ist, ueberspringt es.
#
#   powershell -ExecutionPolicy Bypass -File veroeffentlichen.ps1
#
# Hilft das Warten nicht, ist der bewaehrte Weg der Handy-Hotspot.
# =====================================================================
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$konto = 'danielziliack-collab'
$name  = 'werkstatt-pipeline'
$url   = "https://$konto.github.io/$name/"

function Erreichbar {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $ar = $c.BeginConnect('api.github.com', 443, $null, $null)
    $ok = $ar.AsyncWaitHandle.WaitOne(5000, $false)
    if ($ok) { $c.EndConnect($ar); return $true }
    return $false
  } catch { return $false } finally { $c.Close() }
}

Write-Output "Warte auf GitHub ..."
$versuch = 0
while (-not (Erreichbar)) {
  $versuch++
  if ($versuch % 10 -eq 1) { Write-Output ("  noch nicht erreichbar (Versuch {0}, {1})" -f $versuch, (Get-Date -Format HH:mm:ss)) }
  if ($versuch -gt 720) { Write-Output "Nach zwei Stunden aufgegeben. Handy-Hotspot versuchen."; exit 1 }
  Start-Sleep -Seconds 10
}
Write-Output "GitHub ist erreichbar."

# 1) Oeffentliches Repo fuer die laufende App (Pages braucht bei einem
#    freien Konto ein oeffentliches Repo)
$da = (gh repo view "$konto/$name" --json name 2>$null)
if (-not $da) {
  Write-Output "Lege $name an (oeffentlich) ..."
  gh repo create $name --public --source=. --remote=origin --push --description "Werkstatt-Pipeline: STEP-Import und Angebotskalkulation fuer die Lohnfertigung"
} else {
  Write-Output "$name gibt es schon - pushe nur."
  if (-not (git remote | Select-String -Quiet '^origin$')) { git remote add origin "https://github.com/$konto/$name.git" }
  git push -u origin main
}

# 2) Pages auf main /docs. Jeder Push ist damit das Deployment.
Write-Output "Schalte GitHub Pages ein (main /docs) ..."
# ACHTUNG: PowerShell 5.1 kennt kein "<<<" - der Rumpf geht ueber eine
# Datei an gh, sonst bricht das Skript schon beim Einlesen ab.
$tmp = Join-Path $env:TEMP 'pages-quelle.json'
'{"source":{"branch":"main","path":"/docs"}}' | Out-File -FilePath $tmp -Encoding ascii -NoNewline
gh api "repos/$konto/$name/pages" -X POST -H "Accept: application/vnd.github+json" --input $tmp 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  # Schon eingeschaltet? Dann nur die Quelle setzen.
  gh api "repos/$konto/$name/pages" -X PUT -H "Accept: application/vnd.github+json" --input $tmp 2>&1 | Out-Null
}
Remove-Item $tmp -ErrorAction SilentlyContinue
gh api "repos/$konto/$name/pages" --jq '.status + "  " + .html_url' 2>$null

# 3) Privates Repo fuer die Historie, wie dz-cam-projekt
$dap = (gh repo view "$konto/$name-projekt" --json name 2>$null)
if (-not $dap) {
  Write-Output "Lege $name-projekt an (privat, Sicherung der Historie) ..."
  gh repo create "$name-projekt" --private --description "Sicherung der Historie der Werkstatt-Pipeline"
}
if (-not (git remote | Select-String -Quiet '^backup$')) { git remote add backup "https://github.com/$konto/$name-projekt.git" }
git push backup --all
git push backup --tags

Write-Output ""
Write-Output "FERTIG. Die App liegt unter:"
Write-Output "  $url"
Write-Output "Es dauert nach dem ersten Einschalten ein bis zwei Minuten, bis Pages ausliefert."
