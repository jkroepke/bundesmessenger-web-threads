// ==UserScript==
// @name         BundesMessenger Web: Reply in thread
// @namespace    https://github.com/jkroepke/bundesmessenger-web-threads
// @version      0.3.0
// @description  Add a native-looking Reply in thread action to the existing message toolbar.
// @author       Jan-Otto Kröpke
// @match        https://your-bundesmessenger.example/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
    "use strict";

    // Replace @match with your deployment's exact hostname.
    // Reuse Element's authenticated Matrix client and native thread UI;
    // never read tokens or send Matrix requests from the userscript.
    const TOOLBAR_SELECTOR = ".mx_MessageActionBar";
    const TILE_SELECTOR = ".mx_EventTile[data-event-id]";
    const BUTTON_CLASS = "bm-threads-userscript-button";
    const LABEL = "In Thread antworten";
    let notification = null;

    function showMessage(message) {
        console.warn("[BundesMessenger Threads]", message);
        if (notification) notification.remove();
        notification = document.createElement("div");
        notification.textContent = message;
        notification.setAttribute("role", "status");
        notification.style.cssText = [
            "position:fixed", "bottom:16px", "right:16px", "z-index:1101",
            "max-width:360px", "padding:12px", "border-radius:6px",
            "background:#282c34", "color:#fff", "font:14px sans-serif",
        ].join(";");
        document.body.appendChild(notification);
        const shown = notification;
        setTimeout(() => {
            shown.remove();
            if (notification === shown) notification = null;
        }, 6000);
    }

    function runtime() {
        const peg = window.mxMatrixClientPeg;
        const dispatcher = window.mxDispatcher;
        if (typeof peg?.get !== "function" || typeof dispatcher?.dispatch !== "function") return null;
        try {
            const client = peg.get();
            return client && typeof client.getRoom === "function" ? { client, dispatcher } : null;
        } catch {
            return null;
        }
    }

    function currentRoomId() {
        // Element-style URLs: #/room/!room:server or #/room/%21room%3Aserver/...
        const match = window.location.hash.match(new RegExp("^#/room/([^/?]+)"));
        if (!match) return null;
        try {
            return decodeURIComponent(match[1]);
        } catch {
            return null;
        }
    }

    function findEvent(client, eventId) {
        const current = currentRoomId();
        const room = current ? client.getRoom(current) : null;
        const event = room?.findEventById?.(eventId);
        if (event) return event;
        // Also works if a deployment uses room aliases or a different URL structure.
        const rooms = typeof client.getRooms === "function" ? client.getRooms() : [];
        for (const candidate of rooms) {
            const found = candidate.findEventById?.(eventId);
            if (found) return found;
        }
        return null;
    }

    function openThread(tile) {
        if (!tile.isConnected) return;
        const eventId = tile.getAttribute("data-event-id");
        if (!eventId) return;
        const api = runtime();
        if (!api) return showMessage("Element-Dispatcher oder Matrix-Client nicht verfügbar.");
        const mxEvent = findEvent(api.client, eventId);
        if (!mxEvent) return showMessage("Nachricht nicht im lokalen Verlauf gefunden.");
        const relationType = mxEvent.getRelation?.()?.rel_type;
        if (relationType && relationType !== "m.thread") {
            return showMessage("Für diesen Ereignistyp kann Element keinen neuen Thread erstellen.");
        }

        const thread = mxEvent.getThread?.();
        const isReply = thread?.rootEvent && !mxEvent.isThreadRoot;
        api.dispatcher.dispatch({
            action: "show_thread",
            rootEvent: isReply ? thread.rootEvent : mxEvent,
            ...(isReply ? { initialEvent: mxEvent, highlighted: true, scrollIntoView: true } : {}),
        });
    }

    // Official Element Compound ThreadsIcon:
    // https://github.com/element-hq/compound-design-tokens/blob/main/icons/threads.svg
    // Copyright Element Creations Ltd; AGPL-3.0 licensed artwork.
    function threadIcon() {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        for (const [name, value] of Object.entries({
            width: "20", height: "20", viewBox: "0 0 24 24",
            fill: "currentColor", "aria-hidden": "true",
        })) svg.setAttribute(name, value);
        const paths = [
            "M7 10a.97.97 0 0 1-.713-.287A.97.97 0 0 1 6 9q0-.424.287-.713A.97.97 0 0 1 7 8h10q.424 0 .712.287Q18 8.576 18 9t-.288.713A.97.97 0 0 1 17 10zm0 4a.97.97 0 0 1-.713-.287A.97.97 0 0 1 6 13q0-.424.287-.713A.97.97 0 0 1 7 12h6q.424 0 .713.287.287.288.287.713 0 .424-.287.713A.97.97 0 0 1 13 14z",
            "M3.707 21.293c-.63.63-1.707.184-1.707-.707V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6zM6 17h14V5H4v13.172l.586-.586A2 2 0 0 1 6 17",
        ];
        for (const d of paths) {
            const path = document.createElementNS(ns, "path");
            path.setAttribute("d", d);
            svg.appendChild(path);
        }
        return svg;
    }

    function nativeThreadButton(toolbar) {
        // Do not duplicate a native action if the server/client later enables it.
        return toolbar.querySelector(
            '.mx_MessageActionBar_threadButton, [aria-label*="thread" i], [title*="thread" i]',
        );
    }

    function directToolbarItem(element, toolbar) {
        while (element && element.parentElement !== toolbar) element = element.parentElement;
        return element;
    }

    function insertionPoint(toolbar) {
        // Follow Element's own action order: Reply, then Reply in thread.
        const reply = [...toolbar.querySelectorAll("button")].find((button) => {
            const label = button.getAttribute("aria-label") || button.getAttribute("title") || "";
            return /^(reply|antworten)$/i.test(label.trim());
        });
        if (reply) {
            const slot = directToolbarItem(reply, toolbar);
            const items = [...toolbar.children];
            return items[items.indexOf(slot) + 1] || null;
        }

        // Locale-independent fallback for unknown translations.
        const options = toolbar.querySelector([
            ".mx_MessageActionBar_optionsButton",
            '[aria-label="Options"]', '[aria-label="Optionen"]',
            '[title="Options"]', '[title="Optionen"]',
        ].join(", "));
        return directToolbarItem(options, toolbar);
    }

    function insertAction(toolbar) {
        if (!toolbar || toolbar.querySelector("." + BUTTON_CLASS)) return;
        if (nativeThreadButton(toolbar)) return;
        const tile = toolbar.closest(TILE_SELECTOR);
        if (!tile || toolbar.closest(".mx_ThreadView, .mx_ThreadPanel")) return;
        if (!runtime()) return;

        // Shallow-clone a real action button: preserve its exact design-token
        // classes, data-kind, data-size, border/padding, and theme behaviour.
        // DOM cloneNode does NOT copy React's click listeners.
        const peer = toolbar.querySelector('button[data-presentation]') ||
            toolbar.querySelector(".mx_MessageActionBar_iconButton");
        const button = peer ? peer.cloneNode(false) : document.createElement("button");
        for (const attr of [
            "id", "data-testid", "aria-describedby", "aria-disabled",
            "aria-pressed", "aria-expanded", "disabled",
        ]) button.removeAttribute(attr);
        button.type = "button";
        button.className = (peer ? peer.className : "mx_MessageActionBar_iconButton") +
            " mx_MessageActionBar_threadButton " + BUTTON_CLASS;
        button.title = LABEL;
        button.setAttribute("aria-label", LABEL);
        button.setAttribute("tabindex", "0");
        // The legacy class supplies sizing; modern buttons inherit their peer's
        // full Compound CSS class set and data-presentation attributes.
        button.appendChild(threadIcon());
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openThread(tile);
        });
        button.addEventListener("contextmenu", (event) => event.stopPropagation());
        toolbar.insertBefore(button, insertionPoint(toolbar));
    }

    let scheduled = false;
    function scan() {
        for (const toolbar of document.querySelectorAll(TOOLBAR_SELECTOR)) insertAction(toolbar);
    }
    function scheduleScan() {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            scan();
        });
    }

    // React creates/removes the toolbar on hover and may rerender it at any time.
    // A microtask-coalesced observer restores only missing buttons and avoids duplicates.
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerover", (event) => {
        const tile = event.target.closest?.(TILE_SELECTOR);
        if (tile) {
            for (const toolbar of tile.querySelectorAll(TOOLBAR_SELECTOR)) insertAction(toolbar);
        }
    }, true);
    scan();
})();
