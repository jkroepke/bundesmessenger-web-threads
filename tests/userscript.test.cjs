const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'bundesmessenger-threads.user.js'), 'utf8');

function setup({ event = null, roomId = '!room:example.org', exposeRuntime = true } = {}) {
    const listeners = {};
    const dispatched = [];
    const elements = [];
    const tile = {
        isConnected: true,
        closest: () => tile,
        contains: (target) => target === tile,
        getAttribute: (key) => key === 'data-event-id' ? '$message:example.org' : null,
        getBoundingClientRect: () => ({ top: 20, bottom: 100, right: 800 }),
    };
    const buttonListeners = {};
    const document = {
        body: { appendChild: (element) => elements.push(element) },
        createElement: (tag) => ({
            tag, style: {}, setAttribute() {}, contains: () => false,
            addEventListener: (type, handler) => { buttonListeners[type] = handler; },
            remove() {},
        }),
        addEventListener: (type, handler) => { listeners[type] = handler; },
    };
    const room = { findEventById: () => event };
    const window = {
        innerWidth: 1000, innerHeight: 700,
        location: { hash: "#/room/" + roomId },
        addEventListener() {},
        ...(exposeRuntime ? {
            mxMatrixClientPeg: { get: () => ({ getRoom: () => room, getRooms: () => [room] }) },
            mxDispatcher: { dispatch: (payload) => dispatched.push(payload) },
        } : {}),
    };
    vm.runInNewContext(script, { document, window, setTimeout: () => {}, console });
    return {
        dispatched, elements,
        hover: () => listeners.pointerover({ target: tile }),
        click: () => buttonListeners.click({ preventDefault() {}, stopPropagation() {} }),
    };
}

test('opens the native Element thread for an ordinary message', () => {
    const original = { getRelation: () => null, getThread: () => null };
    const app = setup({ event: original });
    app.hover(); app.click();
    assert.equal(app.dispatched.length, 1);
    assert.equal(app.dispatched[0].action, 'show_thread');
    assert.equal(app.dispatched[0].rootEvent, original);
});

test('routes a thread reply to its existing root', () => {
    const rootEvent = { isThreadRoot: true };
    const reply = { getRelation: () => ({ rel_type: 'm.thread' }), getThread: () => ({ rootEvent }) };
    const app = setup({ event: reply });
    app.hover(); app.click();
    assert.equal(app.dispatched.length, 1);
    assert.equal(app.dispatched[0].rootEvent, rootEvent);
    assert.equal(app.dispatched[0].initialEvent, reply);
});

test('rejects unsupported relation events instead of opening a new thread', () => {
    const annotation = { getRelation: () => ({ rel_type: 'm.annotation' }) };
    const app = setup({ event: annotation });
    app.hover(); app.click();
    assert.equal(app.dispatched.length, 0);
});

test('does not attach an action if native globals are unavailable', () => {
    const app = setup({ exposeRuntime: false });
    app.hover(); app.click();
    assert.equal(app.dispatched.length, 0);
    assert.equal(app.elements[0].style.display, 'none');
});
