# BundesMessenger Web Threads (Userscript)

Proof of concept: add a small **↪ In Thread antworten** button when hovering over a message in a BundesMessenger Web room. The button calls **Element Web's existing `show_thread` action**, which opens the normal thread panel and composer. This script does not implement a Matrix client, send requests, fetch tokens or perform encryption itself.

**Status:** tested with a mocked Element Web runtime, **not yet verified against a deployed BundesMessenger Web build**. The public GitLab fork did not expose the relevant source files through the retrieval tools used for this proof of concept. If a deployed build removes the `mxDispatcher` or `mxMatrixClientPeg` browser globals, or disables the thread composer elsewhere, the script cannot restore that removed functionality as-is.

## Install

1. Install a userscript manager such as Tampermonkey.
2. Open [`bundesmessenger-threads.user.js`](bundesmessenger-threads.user.js) and replace the placeholder metadata line `// @match https://your-bundesmessenger.example/*` with **your own BundesMessenger Web URL**. Use the exact hostname; avoid broad `*://*/*` permissions.
3. Copy the script into a new Tampermonkey script, then save and activate it. Make sure its configured `@match` covers the URL where you access BundesMessenger Web.
4. Reload BundesMessenger Web. Hover over an ordinary message in a room. Select the small **↪** button next to the message to open Element's existing thread panel.

The placeholder `@match` intentionally matches no real deployment. The published script does not use automatic updates from a private GitHub repository.

## How it works

The Element Web codebase exports `window.mxMatrixClientPeg` and `window.mxDispatcher`. On hover, the userscript checks for these globals and presents a temporary button. On click, it looks up the selected event in the existing Matrix client's loaded rooms, then calls:

```js
window.mxDispatcher.dispatch({ action: "show_thread", rootEvent: mxEvent });
```

For a message already in a thread it uses the existing thread root. Unsupported relations such as reactions and edits are deliberately rejected. Nothing is sent to the homeserver by this script: the normal Element thread composer handles any messages you choose to send.

Element's event tile uses `.mx_EventTile[data-event-id]` in upstream versions; the BundesMessenger fork or your deployment may differ.

## Troubleshooting

- **No button:** check the configured `@match`, make sure you are viewing a room and try hovering over an ordinary message. If the globals are absent, the fork is incompatible with this proof of concept.
- **Button, but no thread:** the fork may remove the dispatcher handler or thread composer. Open the browser developer console and inspect any application errors. Creating a thread might still be gated elsewhere; opening the panel does not bypass a server-side policy.
- **"Nachricht nicht im lokalen Verlauf gefunden":** the selected event is not in the Matrix client's current loaded timeline. Scroll in the original room and retry.
- **Security:** only use userscripts if local organizational policies allow them. Keep the userscript's `@match` restricted to your deployment.

Relevant upstream Element Web code: [`MessageContextMenu.tsx`](https://github.com/element-hq/element-web/blob/develop/apps/web/src/components/views/context_menus/MessageContextMenu.tsx), [`MatrixChat.tsx`](https://github.com/element-hq/element-web/blob/develop/apps/web/src/components/structures/MatrixChat.tsx), [`dispatcher.ts`](https://github.com/element-hq/element-web/blob/develop/apps/web/src/dispatcher/dispatcher.ts).

## Local tests

Requires Node.js with `node:test` support:

```sh
node --check bundesmessenger-threads.user.js
node --test tests/*.test.cjs
```

The test suite covers native thread dispatch, existing thread replies, unsupported event relations, and the missing-global fallback. It does **not** constitute an end-to-end test of an actual BundesMessenger instance.

## Source

- BundesMessenger fork: https://gitlab.opencode.de/bwi/bundesmessenger/clients/bundesmessenger-web
- This repository: https://github.com/jkroepke/bundesmessenger-web-threads