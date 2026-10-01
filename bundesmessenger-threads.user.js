// ==UserScript==
// @name         BundesMessenger Web: Reply in thread
// @namespace    https://github.com/jkroepke/bundesmessenger-web-threads
// @version      0.1.0
// @description  Open Element's existing thread UI for a selected BundesMessenger message.
// @author       Jan-Otto Kröpke
// @match        https://your-bundesmessenger.example/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
    "use strict";

    // Replace the @match hostname above with YOUR deployment's exact origin.
    // This script neither sends Matrix requests nor reads authentication tokens.
    const TILE_SELECTOR = ".mx_EventTile[data-event-id]";
    const LABEL = "In Thread antworten";
    let activeTile = null;
    let notification = null;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "bm-threads-userscript-button";
    button.textContent = "↪";
    button.title = LABEL;
    button.setAttribute("aria-label", LABEL);
    button.style.cssText = [
        "position:fixed", "z-index:1100", "display:none", "width:32px", "height:32px",
        "border:1px solid #888", "border-radius:6px", "background:#fff", "color:#222",
        "font-size:22px", "line-height:1", "cursor:pointer", "box-shadow:0 2px 8px #0002",
    ].join(";");
    document.body.appendChild(button);

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

    function hideButton() {
        activeTile = null;
        button.style.display = "none";
    }

    function positionButton() {
        if (!activeTile) return;
        if (!activeTile.isConnected) return hideButton();
        const rect = activeTile.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return hideButton();
        button.style.top = String(Math.max(8, rect.top + 6)) + "px";
        button.style.right = String(Math.max(8, window.innerWidth - rect.right + 8)) + "px";
        button.style.display = "block";
    }

    document.addEventListener("pointerover", (event) => {
        if (button.contains(event.target)) return;
        const tile = event.target.closest?.(TILE_SELECTOR);
        if (!tile || tile === activeTile) return;
        // Fail closed if the branded build does not expose Element's native API.
        if (!runtime()) return;
        activeTile = tile;
        positionButton();
    });

    document.addEventListener("pointerout", (event) => {
        if (!activeTile || !activeTile.contains(event.target)) return;
        const next = event.relatedTarget;
        if (next && (activeTile.contains(next) || button.contains(next))) return;
        hideButton();
    });

    button.addEventListener("pointerleave", (event) => {
        if (!activeTile?.contains(event.relatedTarget)) hideButton();
    });

    document.addEventListener("scroll", positionButton, true);
    window.addEventListener("resize", positionButton);

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const eventId = activeTile?.getAttribute("data-event-id");
        if (!eventId) return hideButton();
        const api = runtime();
        if (!api) {
            hideButton();
            return showMessage("Element-Dispatcher oder Matrix-Client nicht verfügbar. Dieser Build wird noch nicht unterstützt.");
        }

        const mxEvent = findEvent(api.client, eventId);
        if (!mxEvent) return showMessage("Nachricht nicht im lokalen Verlauf gefunden. Bitte im Raum weiter zu ihr scrollen.");
        const relationType = mxEvent.getRelation?.()?.rel_type;
        if (relationType && relationType !== "m.thread") {
            return showMessage("Für diesen Ereignistyp kann Element keinen neuen Thread erstellen.");
        }

        const thread = mxEvent.getThread?.();
        const isReply = thread?.rootEvent && !mxEvent.isThreadRoot;
        const rootEvent = isReply ? thread.rootEvent : mxEvent;
        // This is the SAME action Element uses internally for "Reply in thread".
        api.dispatcher.dispatch({
            action: "show_thread",
            rootEvent,
            ...(isReply ? { initialEvent: mxEvent, highlighted: true, scrollIntoView: true } : {}),
        });
        hideButton();
    });
})();
