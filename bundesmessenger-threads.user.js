// ==UserScript==
// @name         BundesMessenger Web: Reply in thread
// @namespace    https://github.com/jkroepke/bundesmessenger-web-threads
// @version      0.2.0
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

    function threadIcon() {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "20");
        svg.setAttribute("height", "20");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.8");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", "M20 11.5a7.5 7.5 0 0 0-7.5-7.5H7a5 5 0 0 0 0 10h1v4l4.5-4h.5M14 10.5h3a4 4 0 0 1 0 8h-1v2.5l-3-2.5h-1");
        svg.appendChild(path);
        return svg;
    }

    function nativeThreadButton(toolbar) {
        // Do not duplicate a native action if the server/client later enables it.
        return toolbar.querySelector(
            '.mx_MessageActionBar_threadButton, [aria-label*="thread" i], [title*="thread" i]',
        );
    }

    function overflowItem(toolbar) {
        const options = toolbar.querySelector([
            ".mx_MessageActionBar_optionsButton",
            '[aria-label="Options"]',
            '[aria-label="Optionen"]',
            '[title="Options"]',
            '[title="Optionen"]',
        ].join(", "));
        let item = options;
        // New Element versions may wrap buttons in tooltip elements.
        while (item && item.parentElement !== toolbar) item = item.parentElement;
        return item;
    }

    function insertAction(toolbar) {
        if (!toolbar || toolbar.querySelector("." + BUTTON_CLASS)) return;
        if (nativeThreadButton(toolbar)) return;
        const tile = toolbar.closest(TILE_SELECTOR);
        if (!tile || toolbar.closest(".mx_ThreadView, .mx_ThreadPanel")) return;
        if (!runtime()) return;

        const button = document.createElement("button");
        button.type = "button";
        button.title = LABEL;
        button.setAttribute("aria-label", LABEL);
        // Copy a native peer's sizing/hover styles in newer Element builds.
        const peer = [...toolbar.querySelectorAll('button[data-presentation]')][0];
        if (peer) {
            button.className = peer.className + " " + BUTTON_CLASS;
            button.setAttribute("data-presentation", peer.getAttribute("data-presentation"));
        } else {
            button.className = "mx_MessageActionBar_iconButton mx_MessageActionBar_threadButton " + BUTTON_CLASS;
        }
        button.appendChild(threadIcon());
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openThread(tile);
        });
        button.addEventListener("contextmenu", (event) => event.stopPropagation());
        toolbar.insertBefore(button, overflowItem(toolbar));
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
