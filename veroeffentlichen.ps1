# =====================================================================
# NUR ASCII in dieser Datei. PowerShell 5.1 liest eine UTF-8-Datei ohne
# BOM als ANSI; aus einem Gedankenstrich wird dabei ein typografisches
# Anfuehrungszeichen, das eine Zeichenkette vorzeitig beendet - der
# Parser meldet dann eine fehlende Klammer an ganz anderer Stelle.
# =====================================================================
# veroeffentlichen.ps1 - den gebauten Stand oeffentlich stellen
# ---------------------------------------------------------------------
# ZWEI REPOS, ZWEI ROLLEN (Stand 13.09.2026, nach Daniels Ansage "mein
# Name soll nicht im Internet auftauchen"):
#
#   backup  -> dz-werkstatt/werkstatt-pipeline-projekt   PRIVAT
#              Die volle Entwicklungshistorie. Hierhin pusht dieses
#              Arbeitsverzeichnis.
#   .pub    -> dz-werkstatt/werkstatt-pipeline           OEFFENTLICH
#              Ein eigener kleiner Klon im Unterordner .pub (gitignored)
#              mit EIGENER, kurzer Historie. Er traegt nur den
#              ausgelieferten Stand; GitHub Pages liefert aus docs/ aus.
#
# WARUM getrennt: die ersten drei Commits des Projekts trugen Daniels
# private Mailadresse als Autor. In einem oeffentlichen Repo ist das fuer
# jeden lesbar und wird von Crawlern gesammelt. Das Umschreiben der
# Historie waere die andere Loesung gewesen; dieser Weg kommt ohne
# force-push aus, loescht nichts und haelt die oeffentliche Historie
# dauerhaft frei von personenbezogenen Daten. Das alte oeffentliche Repo
# liegt als dz-werkstatt/werkstatt-pipeline-historie privat weiter.
# Dasselbe Muster nutzt die Dreh-App (dz-cam gegen dz-cam-projekt).
#
# ABLAUF: bauen, pruefen, Dateien nach .pub spiegeln, dort committen und
# pushen. Jeder Push auf main ist das Deployment.
#
#   powershell -ExecutionPolicy Bypass -File veroeffentlichen.ps1
#   ... -Nachricht "kurzer Text fuer den Commit"
#
# Ist GitHub vom Heimnetz nicht erreichbar (kam am 09. und 13.09.2026
# vor, TLS-Zeitueberschreitung auf 443, kein Anmeldeproblem), wartet das
# Skript. Hilft das nicht, ist der bewaehrte Weg der Handy-Hotspot.
# =====================================================================
param(
  [string]$Nachricht = '',
  [switch]$OhnePruefung
)
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$konto = 'dz-werkstatt'
$name  = 'werkstatt-pipeline'
$url   = "https://$konto.github.io/$name/"
$pub   = Join-Path $PSScriptRoot '.pub'

function Erreichbar {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $ar = $c.BeginConnect('api.github.com', 443, $null, $null)
    $ok = $ar.AsyncWaitHandle.WaitOne(5000, $false)
    if ($ok) { $c.EndConnect($ar); return $true }
    return $false
  } catch { return $false } finally { $c.Close() }
}

# 1) Bauen und pruefen - nichts Ungeprueftes geht nach draussen.
Write-Output "Bauen ..."
& node bauen.js
if ($LASTEXITCODE -ne 0) { Write-Output "BAU FEHLGESCHLAGEN - nichts veroeffentlicht."; exit 1 }
if (-not $OhnePruefung) {
  Write-Output "Pruefstand ..."
  $p = & node pruefstand.js
  $p | Select-Object -Last 4
  if ($p -notmatch 'PRUEFSTAND BESTANDEN') { Write-Output "PRUEFSTAND NICHT BESTANDEN - nichts veroeffentlicht."; exit 1 }
}

# 2) Klon vorhanden?
if (-not (Test-Path (Join-Path $pub '.git'))) {
  Write-Output "Publikations-Klon fehlt. Einmalig anlegen mit:"
  Write-Output "  git clone https://github.com/$konto/$name.git .pub"
  exit 2
}

# 3) Dateien spiegeln: genau der Stand, den git kennt (keine Reste).
Write-Output "Spiegle den Arbeitsstand nach .pub ..."
Get-ChildItem -Path $pub -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
$tar = Join-Path $env:TEMP 'wp-pub.tar'
& git archive -o $tar HEAD
if ($LASTEXITCODE -ne 0) { Write-Output "git archive fehlgeschlagen."; exit 1 }
& tar -x -f $tar -C $pub
Remove-Item $tar -ErrorAction SilentlyContinue

# 4) Committen und pushen
Push-Location $pub
& git add -A
$offen = & git status --porcelain
if (-not $offen) { Write-Output "Nichts geaendert - kein Push noetig."; Pop-Location; exit 0 }
if ($Nachricht -eq '') { $Nachricht = 'Stand ' + (Get-Date -Format 'dd.MM.yyyy HH:mm') }
& git commit -q -m $Nachricht

Write-Output "Warte auf GitHub ..."
$versuch = 0
while (-not (Erreichbar)) {
  $versuch++
  if ($versuch % 10 -eq 1) { Write-Output ("  noch nicht erreichbar (Versuch {0}, {1})" -f $versuch, (Get-Date -Format HH:mm:ss)) }
  if ($versuch -gt 720) { Write-Output "Nach zwei Stunden aufgegeben. Handy-Hotspot versuchen."; Pop-Location; exit 1 }
  Start-Sleep -Seconds 10
}
for ($i = 1; $i -le 3; $i++) {
  & git push -q origin main
  if ($LASTEXITCODE -eq 0) { break }
  Write-Output ("  Push-Versuch {0} fehlgeschlagen, noch einmal ..." -f $i)
  Start-Sleep -Seconds 5
}
Pop-Location

# 5) Die Historie sichern (privat)
Write-Output "Sichere die Historie nach backup ..."
for ($i = 1; $i -le 3; $i++) {
  & git push -q backup --all
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 5
}

Write-Output ""
Write-Output "FERTIG. Die App liegt unter:"
Write-Output "  $url"
Write-Output "Nach dem ersten Einschalten dauert es ein bis zwei Minuten, bis Pages ausliefert."
