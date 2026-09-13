# Werkstatt-Pipeline – Paket 1: STEP-Import & Angebotskalkulation

Übergabedokument für Claude Code. Dieses Dokument als `CLAUDE.md` ins Repo legen und den Chat mit „Lies CLAUDE.md und setze Paket 1 um" starten.

---

## 0. Sitzungs-Setup (zuerst, bevor Code geschrieben wird)

**Eigene Claude-Code-Sitzung** – nicht im Chat der Dreh-/Fräs-App. Neues Projektverzeichnis `werkstatt-pipeline`.

**Git & Veröffentlichung (gleiches Muster wie Dreh- und Fräs-App):**
1. `git init`, `.gitignore` (node_modules, dist, .env), erster Commit mit dieser CLAUDE.md
2. GitHub-Repo `werkstatt-pipeline` anlegen (privat), `main` pushen
3. Auto-Deploy über **GitHub Pages** (wie bei Dreh- und Fräs-App): Pages in den Repo-Einstellungen auf `main` (oder Branch `gh-pages` per Action) stellen. Jeder Push → Live-URL `https://<user>.github.io/werkstatt-pipeline/`. URL in README und hier eintragen: `Live: ______`
   Hinweis: OpenCascade.js ist eine WASM-Datei (>10 MB) – bei Pages kein Problem, aber Ladezeit auf dem iPhone beim ersten Öffnen einplanen; Ladebalken anzeigen
4. Nach jedem abgeschlossenen Schritt: Commit mit sprechender Nachricht + Push. Kein Arbeitsstand bleibt nur lokal
5. Fernsteuerung: Sitzung so anlegen, dass sie aus der Claude-Mobile-App weitergeführt werden kann (Daniel arbeitet am iPhone und am Windows-Laptop). Am Anfang der Sitzung bestätigen, dass Remote-Zugriff aktiv ist

**Modellstufe je Arbeitsschritt** (im Chat mit `/model` wechseln):
| Schritt | Modell | Grund |
|---|---|---|
| Repo, Deployment, Modulstruktur, Schema (Abschnitt 6) | Opus | Architektur, wenig Tokens, hohe Fehlerkosten |
| 1a: OpenCascade.js einbinden, STEP-Parsing, Rotationserkennung, Rohteilvorschlag | Opus | schwierigste Technik im Paket |
| 1a: 3D-Vorschau, Tabelle, Klassifikations-UI | Sonnet | Standard-UI |
| 1b: Kalkulationslogik + defaults.json | Sonnet | Formeln stehen fertig in Abschnitt 4 |
| 1b: Eingabemasken, Staffelpreise, Überschreiben-Funktion | Sonnet | Standard-UI |
| 1b: Angebots-PDF, JSON-Export/Import | Sonnet | Standard |
| Fehlersuche, wenn Sonnet nach 2 Anläufen nicht weiterkommt | Opus | gezielt eskalieren |

Fable nur, wenn Opus an der STEP-Erkennung scheitert (z. B. Rotationsachse bei unsauberen STEP-Dateien). Standard ist Sonnet; Opus gezielt, nicht dauerhaft.

---

## 1. Gesamtziel (Kontext, nicht Teil von Paket 1)

Von Kundenanfrage bis produktionsbereit in ~5 Minuten:
Zeichnung/STEP rein → Angebot → NC-Programm → Arbeitsplan → Maschinenbelegung.

Bestehende, **nicht anzufassende** Schwesterprojekte:
- Dreh-CAM-App (Monforts 1000 MTC-K / 1500 EuroTurn), Single-File-Web-App
- Fräs-CAM-App (Siemens 840D Powerline), Single-File-Web-App
- Kapazitätsplaner (separates SaaS-Projekt)

Anbindung erfolgt später über das Austauschformat in Abschnitt 6. Paket 1 baut nur Import + Kalkulation.

---

## 2. Technische Rahmenbedingungen

- Web-App, muss auf iPhone (Safari) und Windows-Laptop laufen
- UI: hell, flach, präzise. Akzentfarbe `#1858a0`. Keine Dark-Dashboard-Optik
- Sprache der Oberfläche: Deutsch, Dezimalkomma in der Anzeige, Punkt intern
- Repo-Struktur modular von Anfang an:
  ```
  /import        STEP/DXF/PDF einlesen → Geometriedaten (JSON)
  /kalkulation   Geometrie + Parameter → Angebot
  /arbeitsplan   (Paket 4, leer anlegen)
  /shared        Datenformate, Typen, Hilfsfunktionen
  /ui            Oberfläche
  ```
- STEP-Verarbeitung: OpenCascade.js (WASM) im Browser bevorzugt. Falls Performance auf iPhone nicht reicht: kleines Backend (Python, pythonocc/cadquery) als Fallback – Entscheidung nach erstem Test dokumentieren
- Deployment: GitHub-Repo + Vercel oder Netlify, Auto-Deploy bei jedem Push auf `main`. Live-URL in README eintragen
- Keine Datenbank in Paket 1. Alle Einstellungen (Stundensätze, Werkstoffe, Zuschläge) als editierbares JSON, im Browser gespeichert und als Datei exportier-/importierbar

---

## 3. Paket 1a – STEP-Import → Geometriedaten

### Eingabe
- STEP (AP203/AP214/AP242), Drag & Drop oder Dateiauswahl
- Optional DXF (2D) – Bounding Box und Flächeninhalt reichen
- PDF-Zeichnung: in Paket 1 nur ablegen und anzeigen, keine Auswertung

### Ausgabe (Geometrie-JSON, siehe Abschnitt 6)
Pflichtwerte je Teil:
| Wert | Einheit | Bemerkung |
|---|---|---|
| Bounding Box X/Y/Z | mm | |
| Fertigteilvolumen | cm³ | |
| Oberfläche gesamt | cm² | |
| Rotationssymmetrisch ja/nein | – | Achse und Symmetriegrad erkennen |
| Max. Durchmesser, Länge | mm | nur bei Rotationsteil |
| Rohteilvorschlag | – | Rund/Flach/Sechskant, Abmessung mit Aufmaß (Standard 3 mm ⌀, 2 mm Länge, änderbar) |
| Rohteilvolumen | cm³ | |
| Spanvolumen | cm³ | Rohteil − Fertigteil |
| Anzahl Bohrungen, Durchmesser | – | zylindrische Flächen erkennen |
| Anzahl Flächen / Kanten | – | Komplexitätsindikator |
| Innenbearbeitung ja/nein | – | bei Rotationsteil |

### Klassifikation (automatisch, vom Nutzer überschreibbar)
- **Drehteil einfach** (rotationssymmetrisch, keine Nebenformen)
- **Drehteil mit Fräsanteil** (rotationssymmetrisch + Querbohrungen/Flächen)
- **Frästeil 3-Achs** (prismatisch, alle Flächen von oben/seitlich erreichbar)
- **Frästeil komplex** (Rest)

### Anzeige
3D-Vorschau (drehbar, zoombar), Rohteil halbtransparent um das Fertigteil. Geometriewerte als Tabelle daneben/darunter.

---

## 4. Paket 1b – Angebotskalkulation

### Grundsatz
Komplettpreis für den Kunden: Material + Bearbeitung + Rüsten + Nebenkosten + Verpackung/Versand + Gewinn. Jeder Posten einzeln sichtbar und einzeln überschreibbar.

### Parameter (alle editierbar, mit Startwerten)
**Maschinen / Stundensätze**
| Maschine | Startwert |
|---|---|
| Drehen (Monforts) | 60 €/h |
| Fräsen | 70 €/h |
| Rüstzeit-Satz | = Maschinensatz |
| Handarbeit (Entgraten, Prüfen, Verpacken) | 45 €/h |

**Werkstoffe** (Liste erweiterbar: Name, Dichte, €/kg, Bearbeitbarkeitsfaktor)
Startliste: S235, C45, 42CrMo4, 1.4301, 1.4571, AlMg3 / AlMgSi1, POM, PA6, PE-HD, PTFE. Preise als Platzhalter eintragen und im UI klar als „zu pflegen" markieren.

**Zuschläge**
| Posten | Startwert |
|---|---|
| Materialverschnitt | 10 % |
| Toleranzklasse mittel (IT8–IT10) | 1,0 |
| Toleranzklasse fein (≤ IT7 / Passungen) | 1,4 |
| Oberflächenzuschlag Ra ≤ 0,8 | 1,3 |
| Prüfaufwand je Teil | 2 min |
| Entgraten je Teil | Formel unten |
| Verpackung je Auftrag | 8 € + 0,5 €/Teil |
| Versand | 12 € Pauschale, editierbar, Option „Abholung" |
| Gewinnaufschlag | 20 % |
| Mindestauftragswert | 80 € |

### Zeitmodell (erste Näherung, später mit echten Zeiten kalibrieren)
- **Hauptzeit Zerspanung** = Spanvolumen / Q_eff
  - Q_eff je Werkstoff/Maschine als Tabelle (cm³/min), z. B. Stahl Drehen 60, Alu Drehen 150, Kunststoff Drehen 200, Stahl Fräsen 40, Alu Fräsen 120 – editierbar
- **Nebenzeit** = 25 % der Hauptzeit + 0,3 min je Bohrung + 0,2 min je zusätzlicher Bearbeitungsseite
- **Entgraten** = 0,02 min je Kante, min. 1 min
- **Rüstzeit** je Auftrag: Drehteil einfach 20 min, mit Fräsanteil 40 min, Frästeil 45 min, komplex 90 min – editierbar
- **Stückzeit** = (Hauptzeit + Nebenzeit) × Toleranzfaktor × Oberflächenfaktor + Prüfen + Entgraten
- **Einzelpreis** = Material + Stückzeit × Satz + Rüstzeit × Satz / Stückzahl + Verpackung/Stück + Versand/Stückzahl, dann × (1 + Gewinn)

### Ausgabe
- Staffelpreise automatisch für 1 / 5 / 10 / 25 / 50 / 100 Stück (Staffel editierbar)
- Aufschlüsselung je Posten sichtbar, jeder Wert per Klick überschreibbar, überschriebene Werte farblich markiert
- Angebots-PDF: Kopf mit Firmendaten (editierbar), Positionsliste, Staffelpreise, Lieferzeit-Feld, Gültigkeit 30 Tage
- Speichern als Angebots-JSON (enthält Geometrie-JSON + alle Parameter + Ergebnis), damit später Rückrechnung mit Ist-Zeiten möglich

### Kalibrierung (vorbereiten, nicht ausbauen)
Feld „Ist-Zeit" je gespeichertem Angebot. Anzeige Soll/Ist-Abweichung. Kein automatisches Nachlernen in Paket 1.

---

## 5. Nicht Teil von Paket 1
- Auswertung von PDF-Zeichnungen (Toleranzen, Oberflächen) → Paket 6
- Konturableitung für die Dreh-App → Paket 3
- Arbeitsplan → Paket 4
- Anbindung Kapazitätsplaner → Paket 5
- Nutzerverwaltung, Kundenstamm, Datenbank

---

## 6. Austauschformat (verbindlich, in `/shared/schema`)

```json
{
  "version": "1.0",
  "teil": {
    "name": "", "zeichnungsnr": "", "revision": "",
    "klasse": "drehteil_einfach | drehteil_fraes | fraesteil_3ax | fraesteil_komplex",
    "werkstoff": "",
    "bbox": {"x":0,"y":0,"z":0},
    "volumen_cm3": 0, "oberflaeche_cm2": 0,
    "rotation": {"ja":false,"achse":"Z","dmax":0,"laenge":0,"innen":false},
    "bohrungen": [{"d":0,"tiefe":0,"durch":true}],
    "flaechen":0,"kanten":0
  },
  "rohteil": {"form":"rund|flach|sechskant","masse":{},"volumen_cm3":0},
  "kalkulation": {"parameter":{},"zeiten":{},"preise":{}},
  "quelle": {"step":"dateiname","pdf":"dateiname"}
}
```
Spätere Pakete ergänzen `kontur` (Halbschnitt für Dreh-App), `arbeitsplan`, `belegung`. Bestehende Felder werden nie umbenannt.

---

## 7. Arbeitsregeln für Claude Code
- Erst Repo, Deployment und leere Modulstruktur, dann 1a, dann 1b. Nach jedem Schritt Push und Live-URL prüfen
- Jeder Startwert aus diesem Dokument landet in `/kalkulation/defaults.json`, nicht im Code
- Bei Unsicherheit über Zerspanungskennwerte: Wert als Platzhalter eintragen, im UI als „Schätzwert" markieren, nicht raten und verschweigen
- Keine Änderungen an den Schwesterprojekten
- CLAUDE.md bei jeder Architekturentscheidung fortschreiben (Abschnitt „Entscheidungen" unten)

## 8. Entscheidungen (fortlaufend)
- 2026-09-13: Projekt gestartet. STEP-Verarbeitung im Browser (OpenCascade.js), Backend nur bei Performanceproblemen.

---

## 9. Übergabe aus der Dreh-/Fräs-Sitzung (13.09.2026, vor dem ersten Commit angehängt)

Dieser Abschnitt stammt aus der Sitzung des Schwesterprojekts, die das Lastenheft entgegengenommen und dieses Verzeichnis angelegt hat. Er korrigiert drei Angaben oben und nennt, was am Rechner schon vorhanden ist. Entscheidungen daraus trifft Daniel.

**Korrekturen zum Abschnitt 1:**
- Die Fräs-CAM-App (`dz-cam-fraesen.html`) ist auf **Heidenhain iTNC 530 Klartext** gebaut und am Programmierplatz getestet. Siemens 840D powerline ist dort als zweites Profil geplant, nicht gebaut.
- Abschnitt 0 sagt GitHub Pages, Abschnitt 2 sagt Vercel oder Netlify. Die beiden Schwesterprojekte laufen auf GitHub Pages (Konto `dz-werkstatt`, gh-CLI ist am Rechner eingeloggt). Vorschlag: GitHub Pages.

**Was am Rechner schon vorhanden ist und wiederverwendet werden kann (kopieren, nicht verlinken; die Schwesterprojekte bleiben unangetastet):**
- **Eigener STEP-Leser ohne OpenCascade**, DOM-frei, in `Dokumente euroturn/quellen/F10-kern.js` (Funktionen `fStepSaetze` bis `fStepSollfeld`, ca. Zeile 2590 bis 3100): liest AP203/AP214 (mm, Zoll, Meter), liefert Flächen mit Art (Ebene, Zylinder, Kegel, Torus, Freiform), Achsen, Randkurven, Hüllquader, Kanten und einen Achsenvorschlag. An 143 von 145 echten Modellen ohne Ausnahme gelaufen, größte Datei 176 ms. Er liefert **kein Volumen und keine Oberfläche**; Bohrungen erkennt er als Zylinderflächen. Rotationssymmetrie erkennt er nicht.
- **Eigener DXF-Leser** in derselben Datei (`fDxfLesen`, `fDxfKonturen`), an 102 echten Zeichnungen geprüft, mit Blockauflösung.
- **Angebotskalkulation** der Dreh-App in `quellen/97-bericht-kalk.js` (`kalkRechnen`, `kalkMerge`, ab Zeile 1355): Zuschlagskalkulation mit Materialgewicht aus Rohteilmaßen, Rüstumlage, Staffel 1/5/10/25/50, Werkstoffdichten in `WERKSTOFFE` (`quellen/85-planer.js`). Prüfung 137 rechnet ein Handbeispiel nach.
- **Testfundus**: 41 STEP- und 87 DXF-Dateien in Daniels Desktop-Ordnern (Kundenarchive, eigene CAM- und FreeCAD-Ordner), tiefer verschachtelt noch mehr. Die Auftraggeber werden hier bewusst NICHT genannt — dieses Repo ist oeffentlich, und wofuer er arbeitet, geht niemanden etwas an. Dieselbe Regel gilt fuer Wohnort und Anschrift.

**Offene Architekturfrage, vor 1a zu entscheiden:** OpenCascade.js (WASM, über 10 MB, Ladezeit am iPhone) liefert Volumen, Oberfläche und saubere Topologie. Der eigene Leser ist klein und offline, müsste aber um Volumen (Divergenzsatz über die abgetasteten Flächen) und Rotationserkennung (alle Zylinder-/Kegelachsen kollinear) erweitert werden. Für rein prismatische und rotationssymmetrische Teile reicht der eigene Leser vermutlich; bei Freiformflächen wird das Volumen dann nur genähert.

**Umgebung:** Node liegt in `C:\Users\1rm1\nodejs` und ist nicht im PATH (`export PATH="/c/Users/1rm1/nodejs:$PATH"`). Die Sitzung, die dieses Verzeichnis angelegt hat, lief mit dem Modell Fable; die Modelltabelle in Abschnitt 0 sieht Sonnet und Opus vor.

~~**Noch nicht getan (gehört in die eigene Sitzung):** GitHub-Repo anlegen, Pages einrichten, Modulstruktur anlegen.~~ — **ERLEDIGT am 13.09.2026**, aus der euroturn-Sitzung heraus, auf Daniels Frage nach dem Home-Bildschirm-Link:

| | |
|---|---|
| App (Pages, `main /docs`) | https://dz-werkstatt.github.io/werkstatt-pipeline/ |
| öffentliches Repo | `dz-werkstatt/werkstatt-pipeline` (Remote `origin`) |
| privates Repo, Historie | `dz-werkstatt/werkstatt-pipeline-projekt` (Remote `backup`) |
| Name auf dem Home-Bildschirm | **Angebot** |

Vor dem Veröffentlichen liefen Bau-Wache und Prüfstand (95 Haken grün). Veröffentlicht wird mit `veroeffentlichen.ps1`; es ist idempotent und wartet auf GitHub. **Vor dem ersten Lauf musste es repariert werden:** es enthielt drei Gedankenstriche, und PowerShell 5.1 liest eine UTF-8-Datei **ohne BOM** als ANSI — aus den Bytes `E2 80 94` wird dabei unter anderem `0x94`, ein typografisches Anführungszeichen, das PowerShell als Zeichenketten-Begrenzer akzeptiert. Die Zeichenkette in Zeile 47 brach dort ab, der Rest wurde als Code gelesen, und der Parser meldete eine fehlende Klammer in Zeile 46. **Nur ASCII in PowerShell-Skripten** — die Warnung steht jetzt im Kopf der Datei. Aufgefallen war es nie, weil das Skript nie laufen konnte: GitHub war vom Heimnetz aus nicht erreichbar (und der erste Push ans Backup brach auch an diesem Abend nach 21 s ab, der zweite ging durch).
- 2026-09-13: **Kein OpenCascade.js.** Der eigene STEP-Leser der Fraes-App wird uebernommen und um Volumen, Oberflaeche, Rotation und Bohrungen erweitert. GEMESSEN an 127 echten STEP-Dateien von Daniels Rechner, bevor entschieden wurde: 102 tragen einen echten Koerper (MANIFOLD_SOLID_BREP), 25 sind Flaechen- oder Skizzenmodelle und haben mit KEINEM Werkzeug ein Volumen. Von den 127 sind 85 zu 100 Prozent aus Ebene, Zylinder, Kegel, Torus und Kugel aufgebaut, 9 weitere zu mindestens 80 Prozent. Fuer diese Flaechenarten rechnet der eigene Leser exakt; alles andere (B-Spline, Rotations- und Extrusionsflaechen) wird ueber den Flaechenrand genaehert. Der Anteil der genaeherten Flaeche wird IM BLATT ausgewiesen, damit ein Preis nie auf einer stillen Schaetzung steht. Damit entfaellt die 10-MB-WASM-Datei und die Ladezeit am iPhone; die Offline-Doktrin der Schwester-Apps bleibt.
- 2026-09-13: **Bauweise der Schwester-Apps.** Quellmodule in den Ordnern des Lastenhefts, `bauen.js` verkettet sie zu GENAU EINER HTML-Datei, `pruefstand.js` haelt die Haken. Eine einzige Umformung beim Bauen: `kalkulation/defaults.json` wird als Konstante eingebettet, weil eine offline geoeffnete Datei nichts nachladen kann. Die JSON-Datei bleibt die einzige Quelle der Startwerte (Regel 7).
- 2026-09-13: **Zwei Ziele, gleiche Bytes.** `werkstatt-pipeline.html` zum Doppelklicken und `docs/index.html` fuer GitHub Pages. Pages liest den Ordner `docs/` auf `main`, damit ist jeder Push das Deployment — ohne Action, ohne fremden Dienst. Vercel und Netlify entfallen (Abschnitt 2 nannte sie, Abschnitt 0 nannte Pages; Pages ist das Muster der beiden Schwester-Apps).
- 2026-09-13: **Zwei Repos wie bei dz-cam.** Daniels GitHub-Konto ist ein freies; Pages braucht dort ein OEFFENTLICHES Repo. Deshalb oeffentlich `werkstatt-pipeline` fuer die laufende App und privat `werkstatt-pipeline-projekt` fuer die Historie — dasselbe Paar wie `dz-cam` und `dz-cam-projekt`. Im oeffentlichen Repo stehen nur Platzhalterpreise; die echten Saetze liegen im Browser und in den gesicherten Dateien, nie im Repo.
- 2026-09-13: **Werkstoffliste.** Das Lastenheft fuehrt "AlMg3 / AlMgSi1" als eine Zeile. Daraus sind zwei Eintraege geworden, weil Dichte und Preis sich unterscheiden und die Liste ohnehin erweiterbar sein soll.
- 2026-09-13 abends: **Die Stundensaetze stehen BEWUSST im oeffentlichen Repo** (Daniels Entscheid auf ausdrueckliche Rueckfrage: "So veroeffentlichen, wie es ist"). Damit ist der Halbsatz der Zeile darueber praeziser zu lesen: Platzhalter sind die MATERIALPREISE (so verlangt es das Lastenheft, Abschnitt 4 — "Preise als Platzhalter eintragen und im UI klar als zu pflegen markieren"; der Pruefstand haelt fest, dass alle 11 so gekennzeichnet sind). Die STUNDENSAETZE 60/70/45 EUR/h, der Gewinnaufschlag 20 % und der Mindestauftrag 80 EUR stammen dagegen aus Daniels eigener Parametertabelle im Lastenheft und liegen in `kalkulation/defaults.json` — im oeffentlichen Repo lesbar. Ich hatte angeboten, sie durch runde Platzhalter zu ersetzen und die echten nur im Browserspeicher zu halten; er wollte es nicht. Dieselbe Lage besteht seit dem 01.09. in der oeffentlichen Dreh-App (Satz 55 EUR/h, Gewinn 10 %). **Wer das aendern will, aendert defaults.json — nicht den Code (Regel 7).**
