# BundesMessenger Web Threads (Userscript)

Add **In Thread antworten** to BundesMessenger Web's **existing message action toolbar**. The script calls Element Web's native `show_thread` action, opening its built-in thread panel and composer. It does not send Matrix requests, access authentication tokens, or implement encryption.

**Status:** DOM/dispatch behaviour tested with mocked legacy and modern Element Web toolbar structures. Successfully opening threads with the earlier floating-button prototype was reported by the project user; **this integrated-toolbar version still needs verification against a deployed BundesMessenger Web instance**. Public access to the relevant BundesMessenger GitLab source files was unavailable during development.

## Install

1. Install a userscript manager such as Tampermonkey.
2. Open [`bundesmessenger-threads.user.js`](bundesmessenger-threads.user.js). Replace the placeholder line `// @match https://your-bundesmessenger.example/*` with **your exact BundesMessenger Web hostname**. Avoid broad URL permissions.
3. Copy the script into Tampermonkey, save it, and reload BundesMessenger Web.
4. Hover over a room message. The **In Thread antworten** action appears **inside the existing message toolbar**, just before the Options (three-dot) action. It opens Element's native thread panel.

The placeholder `@match` deliberately matches no real deployment. The private GitHub repository is not configured as an automatic userscript update source.

## How it works

Element exposes `window.mxMatrixClientPeg` and `window.mxDispatcher` in its upstream browser builds. The userscript finds `.mx_MessageActionBar` inside `.mx_EventTile[data-event-id]` and inserts a small action using the **existing toolbar's styling**:

- **Legacy Element Web:** use `.mx_MessageActionBar_iconButton` and `.mx_MessageActionBar_threadButton`.
- **Newer Element Web:** copy the style classes and `data-presentation` of a native toolbar button.
- **React rerenders:** a coalesced `MutationObserver` restores the action if the toolbar is replaced or rebuilt, without adding duplicates.
- **Native threads enabled:** if the toolbar already has a native thread action, no extra button is inserted.
- **Existing thread view:** the action is not inserted into the thread view itself.

When clicked, it resolves the selected message through the already-authenticated Matrix client and dispatches:

```js
window.mxDispatcher.dispatch({ action: "show_thread", rootEvent: mxEvent });
```

Replies already belonging to a thread open the existing thread root. Reactions and other unsupported event relations cannot start new threads.

## Troubleshooting

- **No button:** verify `@match` and confirm the existing toolbar appears when hovering a message. The build must expose Element's `mxMatrixClientPeg` and `mxDispatcher` browser globals.
- **Button not aligned:** the branded build may use different toolbar classes or extra wrappers. Inspect the existing toolbar HTML around `.mx_MessageActionBar`. The script intentionally avoids a separate floating action.
- **Click has no effect:** open the browser developer console and check for errors. The fork may alter or remove the `show_thread` dispatcher handler or thread composer.
- **Event not found:** scroll to the original message in its room so the Matrix client loads the corresponding event.
- **Security:** use userscripts only where your organization's policies allow them, and limit `@match` to your deployment.

## Local tests

Requires Node.js with built-in `node:test` support:

```sh
node --check bundesmessenger-threads.user.js
node --test tests/*.test.cjs
```

The suite covers legacy/modern toolbar placement, native dispatch, existing thread replies, unsupported relations, missing runtime globals, avoiding duplicate actions and existing thread views, and React toolbar rerenders. It is **not** an end-to-end test against a deployed BundesMessenger build.

## References

- [BundesMessenger Web upstream fork](https://gitlab.opencode.de/bwi/bundesmessenger/clients/bundesmessenger-web)
- [Legacy Element Web MessageActionBar](https://github.com/element-hq/element-web/blob/v1.11.87/src/components/views/messages/MessageActionBar.tsx)
- [Element Web modern ActionBarView](https://github.com/element-hq/element-web/blob/develop/packages/shared-components/src/room/timeline/event-tile/actions/ActionBarView/ActionBarView.tsx)
- [Element Web native dispatcher](https://github.com/element-hq/element-web/blob/develop/apps/web/src/dispatcher/dispatcher.ts)
