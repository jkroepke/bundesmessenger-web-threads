# Threads für BundesMessenger Web

Dieses Userscript ergänzt in der Webversion des BundesMessengers den Button **„In Thread antworten“**. Er erscheint direkt in der vorhandenen Nachrichten-Toolbar neben „Antworten“.

Das Script verwendet die bereits vorhandene Thread-Funktion des Clients. Es benötigt keinen eigenen Matrix-Server und liest keine Zugangstokens aus.

## Installation

1. Installiere eine Userscript-Erweiterung, zum Beispiel [Tampermonkey](https://www.tampermonkey.net/).
2. Öffne [bundesmessenger-threads.user.js](bundesmessenger-threads.user.js) und kopiere den Inhalt in ein neues Tampermonkey-Script.
3. Ersetze die Zeile `// @match https://your-bundesmessenger.example/*` durch die URL deiner BundesMessenger-Webinstanz.
4. Speichere das Script und lade BundesMessenger Web neu.

## Verwendung

Bewege die Maus über eine Nachricht und klicke in der Nachrichten-Toolbar auf **„In Thread antworten“**. Der normale Thread-Bereich des BundesMessengers öffnet sich.

## Hinweise

- Das Script ist ein inoffizieller Workaround und kein Bestandteil des BundesMessengers.
- Es setzt voraus, dass die verwendete Webversion die internen Element-Funktionen `mxMatrixClientPeg` und `mxDispatcher` bereitstellt. Nach einem Update kann eine Anpassung notwendig sein.
- Verwende Userscripts nur, wenn dies bei dir erlaubt ist. Begrenze `@match` auf deine BundesMessenger-Instanz.
- Das verwendete Thread-Icon stammt aus den [Element Compound Design Tokens](https://github.com/element-hq/compound-design-tokens/blob/main/icons/threads.svg) (© Element Creations Ltd., AGPL-3.0).

## Entwicklung

Lokale Tests mit Node.js ausführen:

```sh
node --check bundesmessenger-threads.user.js
node --test tests/*.test.cjs
```

[Quellcode des BundesMessengers](https://gitlab.opencode.de/bwi/bundesmessenger/clients/bundesmessenger-web)
