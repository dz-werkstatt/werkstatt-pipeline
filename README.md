# Werkstatt-Pipeline — Paket 1

STEP-Import und Angebotskalkulation für die Lohnfertigung. Eine Web-App,
die offline läuft: auf dem iPhone über die Verknüpfung auf dem
Home-Bildschirm, am Laptop per Doppelklick auf die HTML-Datei.

**Live:** https://dz-werkstatt.github.io/werkstatt-pipeline/

## Was sie tut

Eine STEP-Datei hineinziehen, und die App rechnet daraus Hüllquader,
Fertigteilvolumen, Oberfläche, Rotationsachse, Bohrungen und einen
Rohteilvorschlag. Daraus entsteht eine Angebotskalkulation mit
Staffelpreisen, bei der jeder Posten einzeln sichtbar und einzeln
überschreibbar ist.

## Wie genau die Zahlen sind

Das Volumen wurde gegen den OpenCascade-Kern von FreeCAD 1.1 geprüft,
über 127 echte STEP-Dateien:

| | |
|---|---|
| Volumen auf 0,5 % genau | 93 von 100 |
| Dateien ohne Freiformflächen | 85, davon 3 daneben |
| mittlere Abweichung dort | 0,05 % |
| größte Abweichung dort | 1,04 % |

Wo Freiformflächen im Spiel sind, näbert die App und **sagt es im
Blatt**, mit dem Anteil der genäherten Oberfläche. Reine Flächenmodelle
ohne geschlossenen Körper bekommen kein Volumen — die haben mit keinem
Programm eines.

## Zusammen mit DZ CAM

Die Pipeline rechnet den Preis; die beiden CAM-Apps kennen die echten Zeiten.
Drei JSON-Dateien verbinden sie, jede mit `format` und `version` im Kopf:
`dz-cam-zeit` (Laufzeit, Werkzeuge, Wechsel, Aufspannungen aus dem CAM in
Blatt 2 → überschriebene Posten mit Herkunft), `wp-werkstoffe` (die
Werkstoffliste aus Blatt 5 für die Dreh-App) und `euroturn-cam-programm`
(die Drehkontur aus dem STEP-Modell als Programm der Dreh-App). Anleitung
in der App: Kapitel 8.

Der Stand der Fassung steht oben rechts; `docs/` trägt einen Service-Worker
mit dem Stand im Cache-Namen (offline auf dem Home-Bildschirm).

## Bauen und prüfen

```
node bauen.js          quellen -> werkstatt-pipeline.html und docs/index.html
node bauen.js --pruefe stimmt die ausgelieferte Datei mit den Quellen?
node pruefstand.js     alle Haken
node gegenproben.js    fällt jeder Haken um, wenn man den Code verfälscht?
node symbol-bauen.js   Symbole und Manifest für den Home-Bildschirm
```

Bearbeitet werden **nur** die Quellmodule in `shared/`, `import/`,
`kalkulation/` und `ui/`. Die beiden HTML-Dateien sind Erzeugnisse;
Prüfabschnitt 0 bricht ab, wenn jemand darin editiert oder das Bauen
vergisst.

## Aufbau

```
shared/        Austauschformat, Stylesheet, Kopf
import/        STEP-Leser, Geometrie, DXF-Leser
kalkulation/   defaults.json (alle Startwerte) und die Rechnung
arbeitsplan/   Paket 4, noch leer
ui/            Oberfläche, 3D-Vorschau, Angebot
docs/          das, was GitHub Pages ausliefert
```

Alles Weitere steht in `CLAUDE.md`: das Lastenheft, die getroffenen
Entscheidungen und was bewusst nicht gebaut wurde.
