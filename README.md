# hellocash-sumup-extension

**Kartenzahlung für helloCash mit SumUp Solo**

Eine Browser-Erweiterung für **Firefox und Chrome**, die die Webkasse [helloCash](https://myhellocash.com) mit einem **SumUp-Solo**-Kartenterminal verbindet.

Klickt man in helloCash auf **„Zahlung“**, fragt die Erweiterung zuerst: **Bar oder Karte?**

- **Bar:** helloCash macht ganz normal weiter. Das Terminal wird nicht angesprochen.
- **Karte:** Der Gesamtbetrag geht automatisch ans SumUp-Terminal, danach macht helloCash normal weiter. Unten rechts siehst du live den Status.

Ursprünglich gebaut für einen kleinen Spielzeugladen, damit an der Kasse niemand mehr Beträge von Hand ins Terminal tippen muss.

> ⚠️ **Inoffizielles Projekt.** Weder helloCash noch SumUp stehen dahinter oder unterstützen es. Bitte vor dem Einsatz den [Haftungsausschluss](DISCLAIMER.md) lesen.

---

## Funktionen

- Bar/Karte-Abfrage beim Klick auf „Zahlung“, bedienbar per Tastatur: **B** = Bar, **K** = Karte, **Esc** = Abbrechen
- Erkennt den Gesamtbetrag automatisch, egal wie viele Artikel im Warenkorb sind
- Schickt den Betrag über die [SumUp Cloud API](https://developer.sumup.com/terminal-payments/cloud-api) an den Solo
- Zeigt den Status live an: wartet auf Karte, PIN-Eingabe, **bezahlt** oder **nicht bezahlt**
- Zeigt nach der Zahlung die Kartenart an, z. B. *Girocard*, *Visa (Debit)*, *Mastercard (Kredit)*, *American Express*, dazu die letzten 4 Ziffern und die Zahlart (kontaktlos, Apple Pay …)
- Lässt sich direkt in der Statusanzeige abbrechen und neu senden
- Kopplung des Solo direkt in den Einstellungen
- Verändert helloCash nicht: keine Buchungen, keine Belege, keine Zugriffe auf die helloCash-API

## So sieht der Ablauf aus

```
Warenkorb in helloCash
        │
   [ ZAHLUNG ]  ──►  Pop-up: „Wie wird bezahlt?  59,97 €“
                          │
            ┌─────────────┴─────────────┐
          [Bar]                      [Karte]
            │                           │
   helloCash wie gewohnt      Betrag → SumUp Solo
                                        │
                              helloCash wie gewohnt
                              + Statusanzeige unten rechts
                                (grün = bezahlt / rot = nicht bezahlt)
```

Den Beleg schließt du in helloCash wie gewohnt selbst ab. Bei Karte wählst du dort die Zahlungsart erst, wenn die Anzeige **grün** ist.

## Voraussetzungen

| Was | Hinweis |
|---|---|
| **Firefox** ab 128 oder **Chrome** (bzw. Edge, Brave …) | |
| **helloCash** im Browser | Kassenansicht unter `myhellocash.com` |
| **SumUp Solo** | Andere SumUp-Leser (Air, Solo Lite …) können die Cloud API **nicht** |
| **SumUp-API-Key** | SumUp-Dashboard → Entwickler-Einstellungen → API-Keys |
| **SumUp-Händlercode** | Steht im SumUp-Dashboard |
| **Affiliate Key + App-ID** | SumUp-Dashboard → Entwickler-Einstellungen → Affiliate Keys. Die Cloud API verlangt das. |
| Internet | Für Kassenrechner **und** Solo |

## Installation

### Firefox
**Fertige Version (empfohlen):**
1. Unter [Releases](../../releases) die neueste `.xpi`-Datei herunterladen.
2. Die Datei ins Firefox-Fenster ziehen und die Installation bestätigen.

Die Releases sind von Mozilla signiert. Die Erweiterung bleibt also dauerhaft installiert, auch nach einem Neustart.

**Aus dem Quellcode (nur zum Testen):** `about:debugging` → „Dieser Firefox“ → „Temporäres Add-on laden“ → `manifest.json`. Nach einem Neustart von Firefox ist sie wieder weg, inklusive Einstellungen.

### Chrome (und Edge, Brave …)
1. Repository klonen oder unter [Releases](../../releases) das Quellcode-ZIP herunterladen und entpacken:
   ```
   git clone https://github.com/AnyCubical/hellocash-sumup-extension.git
   ```
2. `chrome://extensions` öffnen und oben rechts den **Entwicklermodus** einschalten.
3. **„Entpackte Erweiterung laden“** → den entpackten Ordner auswählen (den mit der `manifest.json`).

Die Erweiterung bleibt auch nach einem Neustart installiert. Chrome weist aber gelegentlich darauf hin, dass Erweiterungen im Entwicklermodus aktiv sind. Den Ordner nicht löschen oder verschieben, Chrome lädt die Erweiterung direkt von dort.

## Einrichtung

1. **Einstellungen öffnen:** Erweiterungs-Symbol in der Symbolleiste → „Einstellungen (SumUp)“.
2. **SumUp-Daten eintragen:** API-Key, Händlercode, Affiliate App-ID und Affiliate Key, dann **Speichern**.
3. **Solo koppeln:**
   - Am Solo vom SumUp-Konto **abmelden**: Menü nach unten ziehen → Einstellungen → Info → Abmelden.
   - Menü → Verbindungen → API → Verbinden. Der Solo zeigt einen Kopplungscode an, der nach 5 Minuten abläuft.
   - Den Code in den Einstellungen bei „Kopplungscode“ eintragen → **Terminal koppeln**.
   - Die Reader-ID trägt sich danach automatisch ein.
4. **helloCash neu laden**, fertig.

Der Gesamtbetrag wird automatisch erkannt. Nur falls helloCash die Oberfläche geändert hat und das nicht mehr klappt: Erweiterungs-Symbol → „Gesamtbetrag auswählen“ und auf den Gesamtbetrag klicken. Genauso geht's beim Zahlung-Button.

### Wichtig zum Solo im API-Modus
Solange der Solo über die Cloud API gekoppelt ist, ist am Gerät kein Konto angemeldet. Beträge kann man dann **nicht direkt am Solo eintippen**, sie kommen nur über die Erweiterung.

**Für den Notfall** (Rechner oder Internet weg): Am Solo wieder normal mit dem SumUp-Konto anmelden, dann geht die Betragseingabe wie früher. Danach muss der Solo meist neu gekoppelt werden. Alternativ die SumUp-App auf dem Handy mit „Tap to Pay“ nutzen.

## Erst testen: Sandbox

SumUp bietet ein **Sandbox-Händlerkonto** und einen **[Virtual Solo](https://virtual-solo.sumup.com)** an. Damit kannst du alles durchspielen, ohne dass echtes Geld fließt.

1. Im SumUp-Dashboard ein Sandbox-Konto anlegen und dort API-Key, Händlercode und Affiliate Key erzeugen.
2. Diese Daten in der Erweiterung eintragen.
3. Den Virtual Solo öffnen, Kopplungscode holen und in der Erweiterung koppeln.
4. In helloCash einen Artikel in den Warenkorb legen → Zahlung → Karte. Im Virtual Solo bestätigen.
5. Den Testbeleg in helloCash **nicht abschließen**, sondern leeren oder parken.

Für den Echtbetrieb danach die Daten des echten Kontos eintragen und den echten Solo koppeln.

## Grenzen & bekannte Einschränkungen

- **Die Erweiterung hängt an der Oberfläche von helloCash.** Baut helloCash Buttons oder Layout um, kann die Erkennung brechen. Dann kommt kein Pop-up mehr, und die Kasse funktioniert ganz normal ohne Terminal-Anbindung. Abhilfe: Elemente über das Erweiterungs-Symbol neu auswählen.
- **Tastenkürzel:** Löst helloCash die Zahlung per Tastenkürzel aus statt per Klick, kommt keine Abfrage.
- **Schnelldruck** wird nicht abgefangen.
- **Firmenkarten** erkennt die Erweiterung nicht, weil die SumUp-API dafür kein Kennzeichen liefert.
- **„Abgebrochen“** kann bis zu 75 Sekunden dauern, wenn der Solo seinen Gerätestatus nicht meldet (ältere Firmware).
- helloCash erfährt nichts von der Kartenzahlung. Die Zahlungsart im Beleg wählst du selbst.

## Datenschutz & Sicherheit

- **Was wird gesendet?** Nur an `api.sumup.com`: Betrag, Währung, eine kurze Beschreibung („Kartenzahlung“) und eine zufällige Vorgangs-ID. Keine Artikel, keine Kundendaten.
- **Was wird abgefragt?** Status der Zahlung und des Terminals, nach der Zahlung Kartennetz, Debit/Kredit, die letzten 4 Ziffern und die Zahlart. Das wird nur angezeigt, nicht gespeichert.
- **Wo liegen die Zugangsdaten?** Nur lokal im Browser-Profil (Erweiterungsspeicher `storage.local`). Sie werden nirgendwo anders hin übertragen.
- **Empfehlung:** Den Kassenrechner mit einem eigenen Benutzerkonto und Passwort schützen. Wer am Rechner sitzt, kann die Einstellungen der Erweiterung sehen.

## Entwicklung

```
projekt/
├── manifest.json     # Manifest V3, ein Manifest für Firefox und Chrome
├── background.js     # Alle Aufrufe der SumUp-API (Firefox: Hintergrundskript, Chrome: Service Worker)
├── content.js        # Läuft auf helloCash: Pop-up, Statusanzeige, Element-Auswahl
├── content.css       # Aussehen von Pop-up und Statusanzeige
├── popup.html/.js    # Menü des Erweiterungs-Symbols
└── options.html/.js  # Einstellungsseite
```

Prüfen, testen, signieren mit [web-ext](https://github.com/mozilla/web-ext):

```
npx web-ext lint
npx web-ext run
npx web-ext sign --channel=unlisted --api-key="…" --api-secret="…"
```

- `lint`: prüft Manifest und Code auf Fehler
- `run`: startet ein frisches Firefox mit der Erweiterung
- `sign --channel=unlisted`: lässt die Erweiterung von Mozilla signieren, ohne sie im Add-on-Store zu veröffentlichen
- `--api-key` / `--api-secret`: JWT-Aussteller und JWT-Schlüssel aus dem [Developer Hub](https://addons.mozilla.org/developers/addon/api/key/)

Vor jedem neuen Signieren die `version` in `manifest.json` erhöhen, sonst lehnt Mozilla ab.

`web-ext lint` warnt, dass `background.service_worker` nicht unterstützt wird. Das ist gewollt: Firefox nimmt `background.scripts`, Chrome den `service_worker`, jeder Browser ignoriert den anderen Eintrag. In Chrome testest du über „Entpackte Erweiterung laden“ und nach Änderungen den Neu-laden-Pfeil in `chrome://extensions`.

## Haftung

Nutzung auf eigene Verantwortung. Details im [Haftungsausschluss](DISCLAIMER.md).

## Marken

helloCash ist eine Marke der helloCash GmbH, SumUp eine Marke der SumUp Limited bzw. ihrer Konzerngesellschaften, Firefox eine Marke der Mozilla Foundation, Chrome eine Marke der Google LLC. Die Namen dienen hier nur dazu, zu beschreiben, mit welchen Diensten die Erweiterung zusammenarbeitet.

## Lizenz

Copyright (C) 2026 AnyCubical

Dieses Programm ist freie Software. Du kannst es unter den Bedingungen der **GNU General Public License**, wie von der Free Software Foundation veröffentlicht, weitergeben und/oder verändern, entweder gemäß **Version 3** der Lizenz oder (nach deiner Wahl) jeder späteren Version (`GPL-3.0-or-later`).

Die Veröffentlichung erfolgt in der Hoffnung, dass es nützlich ist, aber **ohne jede Gewährleistung**, sogar ohne die implizite Gewährleistung der Marktreife oder der Eignung für einen bestimmten Zweck. Details stehen in der [GNU General Public License](LICENSE).

Kurz gesagt: Du darfst die Erweiterung frei nutzen, verändern und weitergeben, auch kommerziell. Gibst du eine veränderte Version weiter, muss auch sie unter der GPL stehen und ihr Quellcode offen sein.
