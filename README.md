# Social Print

Druckt neue Posts von **@calliopemini** auf einem Thermo-Bondrucker aus –
Mastodon, Facebook, Instagram und Threads.

Diese Erweiterung gehört zu [pxt-thermal-print](../pxt-thermal-print) und
braucht zusätzlich ein WiFi-Modul.

Gedacht für den **Calliope mini 3**.

## Warum ein Vermittlungsdienst dazwischen hängt

Der Calliope mini kann die vier Plattformen **nicht direkt** abfragen. Das ist
keine Bequemlichkeit, sondern hat vier harte Gründe:

| Hindernis | Folge |
| --- | --- |
| Facebook, Instagram und Threads verlangen ein OAuth-Token | Anmeldung und Token-Erneuerung sind auf dem Board nicht machbar |
| Alle vier sind ausschließlich über HTTPS erreichbar | WiFi-Module im AT-Modus können TLS nicht zuverlässig |
| Ein einzelner Mastodon-Post sind **4,8 KB JSON** | 
| Die Antworten enthalten HTML und UTF-8 | Der Drucker arbeitet mit einer Codepage, Umlaute kämen kaputt heraus |

Deshalb liegt zwischen Board und Plattformen ein kleiner Dienst
([`relay/`](relay/)), der die Arbeit übernimmt und mit **vier kurzen Zeilen
Klartext** über einfaches HTTP antwortet. Den Rest schafft das Board mühelos.

```
micro:bit  ──serielle Schnittstelle──  ESP8266  ──WLAN, HTTP──  Vermittlungsdienst  ──HTTPS──  Mastodon
    │                                                                                          Facebook
    └──serielle Schnittstelle──  Thermodrucker                                                 Instagram
                                                                                               Threads
```

## Was ohne Zugangsdaten funktioniert

**Mastodon** ist öffentlich und braucht kein Token – der Account
`@calliopemini@mastodon.social` ist in der Beispielkonfiguration bereits
eingetragen und getestet.

**Facebook, Instagram und Threads** brauchen jeweils ein Zugangstoken. Da die
Konten euch gehören, ist das möglich, aber es ist Einrichtungsarbeit:

* **Facebook** – ein langlebiges Page Access Token für die Seite, plus die
  numerische Seiten-ID.
* **Instagram** – ein Business- oder Creator-Konto, das mit der Facebook-Seite
  verknüpft ist, dann die Instagram-Account-ID und dasselbe Token.
  (Die alte Basic Display API wurde im Dezember 2024 abgeschaltet.)
* **Threads** – ein Token über die Threads API. Sie liest **nur das eigene
  Konto**, was hier genügt.

Alle drei werden in `relay/config.json` eingetragen und stehen damit **nur auf
dem Server**, nie auf dem Board oder im MakeCode-Projekt.

## Eine serielle Schnittstelle, zwei Geräte

Der Calliope mini hat **nur eine** serielle Schnittstelle, und Drucker *und*
WLAN-Modul brauchen sie. Die Erweiterung schaltet sie deshalb um: vor jeder
Abfrage zum Modul, danach zurück zum Drucker. Dafür muss sie beide kennen:

```blocks
thermalPrinter.connect(SerialPin.P8, BaudRate.BaudRate9600)
espWifi.useWifiModule(SerialPin.P1, SerialPin.P2, BaudRate.BaudRate115200)
espWifi.usePrinterPort(SerialPin.P8, BaudRate.BaudRate9600)
```

Die Werte im dritten Block müssen zu denen im ersten passen. Der TX-Pin des
Moduls dient beim Drucken als unbenutzter RX-Pin, es wird also kein weiterer
Pin verbraucht.

## Verkabelung

| Gerät | Anschluss | Calliope mini 3 |
| --- | --- | --- | --- |
| WLAN-Modul | RX | P1 | P1 oder **C17** (Grove A1 TX) |
| WLAN-Modul | TX | P2 | P2 oder **C16** (Grove A1 RX) |
| WLAN-Modul | VCC / CH_PD | 3,3 V – **siehe Stromversorgung** | dito |
| Drucker | RX | P8 | **C8** |
| alle | GND | GND, gemeinsam | GND, gemeinsam |

Auf dem Calliope mini 3 sind P0–P3 sowie C8, C9, C13–C15 freie I/O-Pins. Die
Voreinstellung P1/P2 funktioniert also auf beiden Boards. Wer ein
**Grove-WLAN-Modul** benutzt, steckt es in den rechten Grove-Anschluss **A1**
und stellt im Block C17 (TX) und C16 (RX) ein – dann entfällt jede Löterei.


### Stromversorgung – der kritische Punkt

Der Calliope mini 3 gibt laut Datenblatt **insgesamt 200 mA** an externe
Verbraucher ab (bei ausgeschalteten RGB-LEDs), pro GPIO-Pin nur 5 mA.

Ein ESP8266 zieht beim Senden kurzzeitig **300 mA und mehr**. Er lässt sich
daher **nicht zuverlässig vom Board versorgen** – das Modul stürzt unter Last
ab oder der mini startet neu. Selbst ein Grove-WLAN-Modul liegt mit rund
240 mA Spitze über dem Budget.

Der Drucker braucht ohnehin ein eigenes Netzteil mit 5–9 V und 2 A. Der
einfachste Weg ist deshalb, aus diesem Netzteil per kleinem 3,3-V-Regler auch
das WLAN-Modul zu speisen:

```
Netzteil 5-9 V, 2 A ──┬── Drucker VH
                      └── 3,3-V-Regler ── WLAN-Modul VCC + CH_PD

GND von Netzteil, Drucker, WLAN-Modul und Calliope mini alle verbunden
```

Nur die **Datenleitungen** gehen an den Calliope mini, nicht die Versorgung. Die
Logikpegel passen: Der Calliope mini 3 gibt bis zu 3,3 V aus, genau was der ESP8266 erwartet.


### Nur eine serielle Schnittstelle

Auch der nRF52833 stellt in MakeCode **einen** umschaltbaren seriellen Port
bereit, obwohl der Chip zwei UART-Einheiten hätte. Drucker und WLAN-Modul
teilen ihn sich also auch auf dem mini 3, und das Umschalten dieser Erweiterung
bleibt nötig.

## Vermittlungsdienst einrichten

Braucht Node 18 oder neuer, läuft auf einem Raspberry Pi, einem NAS oder
irgendeinem Rechner im selben Netz.

```bash
cd relay && cp config.example.json config.json && node server.js
```

Prüfen:

```bash
curl "http://localhost:8080/latest?platform=mastodon"
```

Antwort:

```
117251497347471011
mastodon
2026-09-11 10:37
Der Calliope mini zu Gast bei der Maus!
Am Samstag, den 12. September, ist der Calliope mini zu Gast ...
```

Zeile 1 ist die Post-ID, Zeile 2 die Plattform, Zeile 3 der Zeitpunkt, ab
Zeile 4 der Text. Ist nichts Neues da, steht in Zeile 1 nur `-`.

Der Dienst kümmert sich außerdem um:

* **HTML entfernen** und Entities auflösen,
* **Umlaute umschreiben** (`ä` → `ae`), damit der Drucker sie darstellen kann –
  abschaltbar mit `"asciiFold": false`,
* **Kürzen** auf `maxChars` Zeichen,
* **Zwischenspeichern** für `cacheSeconds` Sekunden, damit häufiges Abfragen
  nicht in die API-Limits läuft.

## Programm

```blocks
socialFeed.setRelay("192.168.1.10", 8080)
espWifi.connectToNetwork("MEIN-WLAN", "passwort")

// nicht bei jedem Einschalten den letzten alten Post drucken
socialFeed.ignorePostsUpToNow(SocialPlatform.Any)

basic.forever(function () {
    if (socialFeed.checkForNewPost(SocialPlatform.Any)) {
        thermalPrinter.printLine(socialFeed.postPlatform())
        thermalPrinter.printLine(socialFeed.postTime())
        thermalPrinter.printLine(socialFeed.postText())
        thermalPrinter.feedLines(3)
    }
    basic.pause(60000)
})
```

Das vollständige Beispiel steht in [test.ts](test.ts).

Jeder Post wird **genau einmal** gemeldet: Das Board merkt sich die zuletzt
gesehene ID und schickt sie bei der nächsten Abfrage mit, der Dienst vergleicht.

## Grenzen

* **Nur HTTP, kein HTTPS** zwischen Board und Dienst. Der Dienst gehört
  deshalb ins eigene Netz, nicht ins offene Internet.
* **Antworten müssen klein bleiben.** Der Empfangspuffer des micro:bit fasst
  254 Zeichen am Stück; bei 115200 Baud kann mehr verlorengehen. `maxChars`
  auf 280 zu lassen ist sicher. Wenn Zeichen fehlen, das Modul mit
  `AT+UART_DEF=9600,8,1,0,0` dauerhaft auf 9600 Baud stellen.
* **Keine Bilder.** Bei Instagram wird die Bildunterschrift gedruckt, nicht
  das Bild.
* **Kein Push.** Das Board fragt in einem Intervall nach; neue Posts kommen
  entsprechend verzögert.

## Lizenz

MIT.
