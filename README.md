# NEON / CRYPT

Eine kleine, komplett lokale PWA zum **Ver- und Entschlüsseln von Nachrichten**. Du gibst deinem Gegenüber denselben Schlüssel; derjenige verschlüsselt damit, du entschlüsselst damit. Die Kryptografie läuft zur Gänze im Browser – es gibt keine Server-Kommunikation, keine externen Bibliotheken und keine CDNs.

---

## Inhaltsverzeichnis

- [Benutzung](#benutzung)
  - [Starten](#starten)
  - [Installieren und offline nutzen](#installieren-und-offline-nutzen)
  - [Schlüssel erzeugen und teilen](#schlüssel-erzeugen-und-teilen)
  - [Nachricht verschlüsseln](#nachricht-verschlüsseln)
  - [Nachricht entschlüsseln](#nachricht-entschlüsseln)
- [Technische Basis](#technische-basis)
  - [Dateien](#dateien)
  - [Verschlüsselung](#verschlüsselung)
  - [Nachrichtenformat NC1](#nachrichtenformat-nc1)
  - [Service Worker & Offline-Betrieb](#service-worker--offline-betrieb)
  - [App-Manifest und Icons](#app-manifest-und-icons)
  - [Sicherheit und Datenschutz](#sicherheit-und-datenschutz)
  - [Updates](#updates)
- [Tests](#tests)
- [Grenzen](#grenzen)

---

## Benutzung

### Starten

Die App besteht nur aus statischen Dateien – es gibt keinen Build-Schritt und keine Paketinstallation. Da Web Crypto, Service Worker und PWA-Installation einen **sicheren Kontext** (`https://` oder `localhost`) voraussetzen, im Projektordner einen lokalen Server starten:

```bash
cd /home/pb/Work/neoncrypt
python3 -m http.server 8080
```

Danach `http://localhost:8080` im Browser öffnen. Für ein Deployment einfach den Ordner auf einen beliebigen statischen Webserver oder HTTPS-Host legen.

### Installieren und offline nutzen

- In Chrome/Edge erscheint nach dem Laden ein Button **„Installieren“** in der Kopfzeile. Er nutzt das `beforeinstallprompt`-Event.
- In Safari/iOS bzw. Browsern ohne dieses Event: **Teilen → Zum Home-Bildschirm hinzufügen**.
- Nach dem ersten Laden sind alle Dateien im Cache. Die installierte App funktioniert **ohne Internetverbindung** – Verschlüsseln und Entschlüsseln brauchen kein Netz.

### Schlüssel erzeugen und teilen

1. **Erzeugen** klicken. Es entsteht ein 256-Bit-Zufallsschlüssel im Format `NC-XXXXXXXXXXXXX-…` (Crockford-Base32, gut lesbar und per Copy/Paste teilbar).
2. Mit **Kopieren** den Schlüssel nehmen und **über einen anderen, sicheren Kanal** übermitteln (z. B. persönlich oder über einen vertrauenswürdigen Passwort-Manager) – nicht in derselben Nachricht wie der Geheimtext.
3. **Augen-Symbol** zeigt den Schlüssel an oder verbirgt ihn wieder. `Strg/Cmd + Umschalt + K` springt direkt ins Schlüsselfeld.

Der Schlüssel existiert nur im Arbeitsspeicher der offenen Seite. Er wird **nicht** in `localStorage`, Cookies oder irgendeinem Speicher abgelegt und beim Neuladen ist er weg. Für jeden Kontakt am besten einen eigenen Schlüssel erzeugen.

### Nachricht verschlüsseln

- Schlüssel einfügen, Klartext in das Feld **Eingabe** schreiben.
- Im Modus **Auto** wird der Text automatisch als Klartext erkannt. Alternativ **Klartext → NC1** wählen.
- **Verschlüsseln** klicken (oder `Strg/Cmd + Enter`).
- Ergebnis mit **Kopieren** übernehmen und versenden – zum Beispiel per Chat, Mail oder Notiz.

Das Ergebnis beginnt immer mit `NC1:`. Jeder Aufruf erzeugt ein neues Salt und eine neue IV, also sieht selbst der gleiche Text jedes Mal anders aus. Leerzeichen und Zeilenumbrüche, die beim Kopieren entstehen, werden beim Entschlüsseln ignoriert.

### Nachricht entschlüsseln

- `NC1:`-Geheimtext in die **Eingabe** einfügen – der Auto-Modus erkennt ihn selbst (`AUTO · NC1 ERKANNT`).
- **Entschlüsseln** klicken. Der Klartext erscheint in der **Ausgabe**.
- Mit **Tauschen** kann das Ergebnis wieder in die Eingabe übernommen werden (z. B. um es erneut zu verschlüsseln).

Ist der Schlüssel falsch oder wurde die Nachricht verändert, kommt eine klare Fehlermeldung – es wird dann kein Klartext ausgegeben.

| Tastenkürzel | Funktion |
| --- | --- |
| `Strg/Cmd + K` | Fokus in das Nachrichtenfeld |
| `Strg/Cmd + Umschalt + K` | Fokus in das Schlüsselfeld |
| `Strg/Cmd + Enter` | Verschlüsseln / Entschlüsseln ausführen |

---

## Technische Basis

### Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Markup, Sprachattribut `de`, CSP-Meta-Tag, Manifest- und Icon-Links |
| `styles.css` | Neon-Design, Responsive Layout, `prefers-reduced-motion` |
| `crypto.js` | Reine Kryptologie (`encrypt`, `decrypt`, `generateSecret`, `parseToken`), ohne Netzwerkzugriff, in Node testbar |
| `app.js` | UI-Verdrahtung, Modi, Schlüsselverwaltung, Kopieren, Tastenkürzel, Installation, Service Worker |
| `sw.js` | Service Worker mit Precache und Offline-Fallback |
| `manifest.webmanifest` | PWA-Metadaten, `display: standalone`, Icons |
| `icons/` | Lokale PNG-Icons (192/512, `any` und `maskable`) sowie `favicon.svg` – Schlossbügel/Schlüsselloch statt Hexagon |
| `scripts/make_icons.py` | Erzeugt die Icons neu (benötigt Pillow) |
| `tests/` | Logik-Test und Browser-Offline-Test |

Es gibt **kein Framework, keinen Bundler und keine externen Assets**. Alle Skripte sind klassische `<script>`-Tags.

### Verschlüsselung

- **Schlüsselableitung:** PBKDF2-HMAC-SHA-256 mit 310.000 Iterationen und 16 Byte zufälligem Salt. Der eingegebene Text wird als UTF-8-Rohmaterial importiert.
- **Verschlüsselung:** AES-256-GCM, 96-Bit-IV, 128-Bit-Authentication-Tag. Die Versionskennung `NC1|v1|AES-256-GCM|PBKDF2-SHA-256|310000` liegt in den authentifizierten Zusatzdaten (AAD).
- **Zufall:** Salt (16 Byte) und IV (12 Byte) werden pro Nachricht neu mit `crypto.getRandomValues()` erzeugt. Gleiche Klartexte ergeben damit unterschiedliche Geheimtexte.
- **Erzeugte Schlüssel:** 32 Zufallsbytes (256 Bit Entropie), Crockford-Base32, in Blöcken zu 13 Zeichen mit `NC-` als Präfix.
- **Zeichenkodierung:** `TextEncoder` / `TextDecoder('utf-8', { fatal: true })`; base64url in Blöcken von 32 KiB.

### Nachrichtenformat NC1

```text
NC1:<base64url( salt[16] | iv[12] | ciphertext+tag )>
```

Beispiel:

```text
NC1:SKT3MJhH9dXDEtrD-XDv9CBQ3gD15qvlU7Hiwl…
```

- Das Präfix erlaubt zuverlässige Auto-Erkennung – im Gegensatz zu Base64 ist ein Geheimtext nicht von selbst als solcher erkennbar.
- Beim Dekodieren werden Whitespace-Zeichen entfernt; das Alphabet ist base64url (`A–Z a–z 0–9 - _`).
- Der Container ist selbstbeschreibend: Salt und IV reisen mit der Nachricht, der Empfänger braucht nur den Schlüssel.
- Die AAD bindet die Nachricht an Format und Version. Ein veränderter Geheimtext oder ein falscher Schlüssel führt zur Authentifizierungsfehlermeldung.

### Service Worker & Offline-Betrieb

- Bei der **Installation** werden HTML, CSS, JS, Manifest und Icons in den Cache `neon-crypt-v2` gelegt, danach `skipWaiting()` und `clients.claim()`.
- Bei **Navigationen** wird `index.html` aus dem Cache ausgeliefert (App-Shell-Fallback).
- Für alle anderen GET-Requests gilt **Cache-first**, danach Netz mit Runtime-Cache.
- Cross-Origin-Requests werden ignoriert – es gibt ohnehin keine.
- Beim **Aktivieren** werden alte Cache-Versionen gelöscht.

Der Offline-Betrieb wurde im Headless-Browser geprüft: Service Worker `activated`, Netz simuliert offline, Reload erfolgreich, Verschlüsseln und anschließendes Entschlüsseln funktionieren.

### App-Manifest und Icons

`manifest.webmanifest` definiert Name, Beschreibung, `start_url`, `scope`, `display: standalone`, Theme-Farben und vier PNG-Icons plus SVG-Favicon. Das Logo ist ein Schlossbügel-Ring mit Schlüsselloch; die `maskable`-Varianten halten den Schriftbereich innerhalb der sicheren Zone.

### Sicherheit und Datenschutz

- Content-Security-Policy: `default-src 'self'`, `connect-src 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`. JavaScript kann **keine** Netzwerkverbindung öffnen.
- Kein Tracking, kein Analytics, kein CDN, keine externen Fonts.
- Schlüssel, Klartexte und Geheimtexte werden nur im DOM/Arbeitsspeicher gehalten und nie gespeichert oder gesendet.
- AES-GCM ist authentifiziert: Manipulationen an der Nachricht werden erkannt. Es gibt absichtlich keine „Wiederherstellung“ des Schlüssels.

### Updates

Wenn sich gecachte Dateien ändern, die Versionsnamen in `sw.js` erhöhen:

```js
const CACHE = 'neon-crypt-v3';
const RUNTIME = 'neon-crypt-runtime-v3';
```

Der neue Worker wird installiert, alte Caches beim Aktivieren entfernt. Für sofortige Übernahme im laufenden Tab einmal neu laden.

---

## Tests

```bash
# Reine Logik (Node): Roundtrip, falscher Schlüssel, Manipulation, Format
node tests/logic.test.js

# Syntax prüfen
node --check crypto.js
node --check app.js
node --check sw.js
python3 -m json.tool manifest.webmanifest > /dev/null
```

Der Browser-Test benötigt einen lokalen Server auf Port 8899 und Chromium mit Remote-Debugging auf Port 9222:

```bash
python3 -m http.server 8899 --bind 127.0.0.1
chromium --headless --no-sandbox --remote-debugging-port=9222 --user-data-dir=/tmp/opencode/chrome-neoncrypt about:blank
node tests/browser.test.js
```

Er prüft Service-Worker-Registrierung, Cache, Offline-Reload, Auto-Erkennung und den kompletten Verschlüsseln-/Entschlüsseln-Rückweg.

---

## Grenzen

- Die App verarbeitet **Text** (UTF-8), keine Binärdateien.
- PBKDF2 ist bewusst langsam. Bei sehr schwachen, selbstgewählten Passwörtern hilft auch die hohe Rundenzahl nur begrenzt – die erzeugten Zufallsschlüssel sind deutlich sicherer.
- Wer den Schlüssel vergisst, verliert den Zugriff auf alte Nachrichten endgültig. Es gibt kein Backup und keinen Server, der ihn ersetzen kann.
- Web Crypto, Service Worker und Installation funktionieren nur über `https://` oder `localhost`, nicht über eine normale `http://`-Domain.
