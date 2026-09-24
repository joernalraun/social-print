# Vermittlungsdienst für Social Print

Holt den neuesten Post von Mastodon, Facebook, Instagram und Threads und gibt
ihn als kurzen Klartext über einfaches HTTP aus, damit ein Calliope mini mit einem
WiFi-Modul ihn lesen kann.

Braucht **Node 18 oder neuer** (wegen `fetch`), sonst nichts – keine
Abhängigkeiten, keine Installation.

## Start

```bash
cp config.example.json config.json
node server.js
```

Anderer Pfad für die Konfiguration: `SOCIAL_PRINT_CONFIG=/pfad/config.json`.

## Schnittstelle

| Aufruf | Bedeutung |
| --- | --- |
| `GET /latest?platform=mastodon` | neuester Mastodon-Post |
| `GET /latest?platform=all` | neuester Post über alle aktiven Plattformen |
| `GET /latest?platform=all&since=<ID>` | nur, wenn es etwas Neueres als `<ID>` gibt |
| `GET /health` | Lebenszeichen |

Antwort, `text/plain`:

```
<Post-ID>
<Plattform>
<JJJJ-MM-TT HH:MM>
<Text, mehrzeilig>
```

Gibt es nichts Neues, steht in Zeile 1 ein `-`.

## Konfiguration

```json
{
    "port": 8080,
    "maxChars": 280,
    "cacheSeconds": 60,
    "asciiFold": true,
    "platforms": { ... }
}
```

* `maxChars` – Länge, auf die der Text gekürzt wird. Nicht viel höher setzen,
  der Empfangspuffer des Calliope mini ist klein.
* `asciiFold` – schreibt Umlaute um (`ä` → `ae`) und wirft übrige
  Nicht-ASCII-Zeichen weg. Thermodrucker arbeiten mit einer Codepage und
  stellen UTF-8 sonst falsch dar. Für einen Drucker, der mit UTF-8 umgehen
  kann, auf `false` setzen.
* `cacheSeconds` – so lange wird dieselbe Antwort wiederverwendet, statt die
  API erneut zu fragen. Schützt vor API-Limits, wenn das Board oft nachfragt.

### Zugangsdaten

**Mastodon** braucht keine. `instance` und `handle` genügen.

**Facebook** braucht die numerische Seiten-ID und ein langlebiges *Page Access
Token* (Meta-App mit `pages_read_engagement`).

**Instagram** braucht ein Business- oder Creator-Konto, das mit der
Facebook-Seite verknüpft ist, dessen Instagram-Account-ID und dasselbe Token
(`instagram_basic`). Die frühere Basic Display API wurde im Dezember 2024
abgeschaltet und funktioniert nicht mehr.

**Threads** braucht ein Token der Threads API. Diese liest ausschließlich das
**eigene** Konto – für diesen Zweck reicht das.

`config.json` enthält damit Geheimnisse. Sie ist in `.gitignore` eingetragen;
bitte nicht einchecken.

## Fehlersuche

Schlägt eine Plattform fehl, schreibt der Dienst die Meldung auf die Konsole
und liefert weiter die letzte gute Antwort aus, statt zu verstummen. Eine
einzelne kaputte Plattform legt den Rest also nicht lahm.
