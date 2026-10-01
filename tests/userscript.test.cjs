const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'bundesmessenger-threads.user.js'), 'utf8');

class Element {
    constructor(tagName = 'div') {
        this.tagName = tagName.toLowerCase();
        this.children = [];
        this.parentElement = null;
        this.attributes = {};
        this.handlers = {};
        this.style = {};
        this.className = '';
    }
    get isConnected() {
        for (let node = this; node; node = node.parentElement) if (node.tagName === 'body') return true;
        return false;
    }
    appendChild(node) { return this.insertBefore(node, null); }
    insertBefore(node, anchor) {
        if (anchor && !this.children.includes(anchor)) throw Error('Invalid toolbar insertion');
        if (node.parentElement) node.remove();
        node.parentElement = this;
        this.children.splice(anchor ? this.children.indexOf(anchor) : this.children.length, 0, node);
        return node;
    }
    remove() {
        if (!this.parentElement) return;
        this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
        this.parentElement = null;
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    matches(selector) {
        if (selector === '.mx_EventTile[data-event-id]') {
            return this.className.split(/\s+/).includes('mx_EventTile') && this.getAttribute('data-event-id');
        }
        if (selector === 'button[data-presentation]') {
            return this.tagName === 'button' && this.getAttribute('data-presentation') !== null;
        }
        if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
        if (/^\[(aria-label|title)\*="thread" i\]$/.test(selector)) {
            return this.getAttribute(selector.slice(1).split('*')[0])?.toLowerCase().includes('thread');
        }
        const exact = selector.match(/^\[(aria-label|title)="([^"]+)"\]$/);
        if (exact) return this.getAttribute(exact[1]) === exact[2];
        return false;
    }
    closest(selectors) {
        const choices = selectors.split(',').map(s => s.trim());
        for (let node = this; node; node = node.parentElement) {
            if (choices.some(s => node.matches(s))) return node;
        }
        return null;
    }
    querySelectorAll(selectors) {
        const choices = selectors.split(',').map(s => s.trim());
        const found = [];
        const visit = node => {
            for (const child of node.children) {
                if (choices.some(s => child.matches(s))) found.push(child);
                visit(child);
            }
        };
        visit(this);
        return found;
    }
    querySelector(selectors) { return this.querySelectorAll(selectors)[0] ?? null; }
}

function setup({ event = null, roomId = '!room:example.org', exposeRuntime = true,
    variant = 'legacy', nativeThread = false, inThreadView = false } = {}) {
    const handlers = {};
    const dispatched = [];
    const body = new Element('body');
    const container = inThreadView ? new Element() : body;
    if (inThreadView) {
        container.className = 'mx_ThreadView';
        body.appendChild(container);
    }
    const tile = new Element();
    tile.className = 'mx_EventTile';
    tile.setAttribute('data-event-id', '$message:example.org');
    container.appendChild(tile);
    const toolbar = new Element();
    toolbar.className = 'mx_MessageActionBar';
    tile.appendChild(toolbar);
    const reply = new Element('button');
    reply.className = variant === 'modern' ? 'compound-toolbar_item compound-button' : 'mx_MessageActionBar_iconButton';
    if (variant === 'modern') reply.setAttribute('data-presentation', 'icon');
    toolbar.appendChild(reply);
    const options = new Element('button');
    options.className = variant === 'modern'
        ? 'compound-toolbar_item compound-button' : 'mx_MessageActionBar_iconButton mx_MessageActionBar_optionsButton';
    options.setAttribute('aria-label', 'Options');
    if (variant === 'modern') {
        options.setAttribute('data-presentation', 'icon');
        const tooltip = new Element();
        tooltip.appendChild(options);
        toolbar.appendChild(tooltip);
    } else toolbar.appendChild(options);
    if (nativeThread) {
        const native = new Element('button');
        native.className = 'mx_MessageActionBar_threadButton';
        toolbar.insertBefore(native, reply);
    }
    const room = { findEventById: () => event };
    const observerCallbacks = [];
    const microtasks = [];
    const document = {
        body,
        querySelectorAll: selector => body.querySelectorAll(selector),
        createElement: name => new Element(name),
        createElementNS: (_ns, name) => new Element(name),
        addEventListener: (type, handler) => { handlers[type] = handler; },
    };
    const window = {
        location: { hash: '#/room/' + roomId },
        ...(exposeRuntime ? {
            mxMatrixClientPeg: { get: () => ({ getRoom: () => room, getRooms: () => [room] }) },
            mxDispatcher: { dispatch: payload => dispatched.push(payload) },
        } : {}),
    };
    class MutationObserver {
        constructor(fn) { observerCallbacks.push(fn); }
        observe() {}
    }
    vm.runInNewContext(script, {
        document, window, MutationObserver, queueMicrotask: fn => microtasks.push(fn),
        setTimeout: () => {}, console,
    });
    return {
        dispatched, tile, toolbar, options,
        actions: () => toolbar.querySelectorAll('.bm-threads-userscript-button'),
        hover: () => handlers.pointerover({ target: tile }),
        click: () => {
            const button = toolbar.querySelector('.bm-threads-userscript-button');
            assert.ok(button);
            button.handlers.click({ preventDefault() {}, stopPropagation() {} });
        },
        update: () => {
            for (const callback of observerCallbacks) callback();
            while (microtasks.length) microtasks.shift()();
        },
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
    assert.equal(app.actions().length, 0);
});

test('legacy toolbar inserts the action immediately before Options', () => {
    const app = setup();
    assert.equal(app.actions().length, 1);
    const action = app.actions()[0];
    assert.equal(app.toolbar.children.indexOf(action), app.toolbar.children.indexOf(app.options) - 1);
    assert.match(action.className, /mx_MessageActionBar_iconButton/);
});

test('modern toolbar reuses Compound button styles and handles wrapped options', () => {
    const app = setup({ variant: 'modern' });
    const action = app.actions()[0];
    assert.equal(action.getAttribute('data-presentation'), 'icon');
    assert.match(action.className, /compound-toolbar_item/);
    assert.equal(app.toolbar.children.indexOf(action), app.toolbar.children.length - 2);
});

test('does not duplicate an existing native thread button or inject into thread view', () => {
    assert.equal(setup({ nativeThread: true }).actions().length, 0);
    assert.equal(setup({ inThreadView: true }).actions().length, 0);
});

test('React toolbar mutations are idempotent and restore missing buttons', () => {
    const app = setup();
    app.hover();
    app.update();
    assert.equal(app.actions().length, 1);
    app.actions()[0].remove();
    app.update();
    assert.equal(app.actions().length, 1);
});
