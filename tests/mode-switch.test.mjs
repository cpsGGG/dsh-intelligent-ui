import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createModeStore } from '../plugin/mode-store.mjs';

const localRequire = createRequire(import.meta.url);
const dependency = name => process.env.DSH_BUILD_DEPS
  ? localRequire(join(process.env.DSH_BUILD_DEPS, name)) : localRequire(name);
let dependencies;
try {
  dependencies = {
    React: dependency('react'), jsx: dependency('react/jsx-runtime'),
    esbuild: dependency('esbuild'), JSDOM: dependency('jsdom').JSDOM,
    SlotCore: dependency('@deepseek-ai/dsh-client-ui-slots').SlotCore,
  };
} catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const domTest = (name, body) => test(name, {
  skip: dependencies ? false : 'Requires React, esbuild, jsdom and SlotCore via DSH_BUILD_DEPS.',
}, body);
const ready = enabled => ({ enabled, pending: false, error: null });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function storeFixture(initial = ready(true)) {
  const values = new Map([['a', initial], ['b', ready(false)]]), subscriptions = new Map();
  const changes = [], refreshes = [];
  const store = {
    changes, refreshes, subscriptions,
    getSnapshot: id => values.get(id),
    subscribe(id, listener) {
      const set = subscriptions.get(id) ?? new Set(); subscriptions.set(id, set); set.add(listener);
      return () => { set.delete(listener); };
    },
    refresh(id) { refreshes.push(id); },
    publish(id, patch) {
      values.set(id, { ...values.get(id), ...patch });
      for (const listener of [...subscriptions.get(id) ?? []]) listener();
    },
    setEnabled(id, enabled) {
      const work = deferred();
      changes.push({ id, enabled, work });
      store.publish(id, { pending: true, error: null });
      return work.promise;
    },
    finish(index, error = null) {
      const change = changes[index];
      store.publish(change.id, { ...error === null ? { enabled: change.enabled } : {}, pending: false, error });
      change.work.resolve();
    },
  };
  return store;
}

async function withDom(store, body) {
  const { React, jsx, esbuild, JSDOM, SlotCore } = dependencies;
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = {};
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  const code = esbuild.transformSync(readFileSync(new URL('../plugin/mode-switch.jsx', import.meta.url), 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return jsx;
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  const core = new SlotCore();
  core.register({ name: 'root', children: { 'conversation.input.left': { kind: 'list', scope: 'session' } } }, () => null);
  const native = () => null;
  core.register({ name: 'conversation.input.left', id: 'native-control', order: 5 }, native);
  const dispose = module.exports.registerModeSwitch({ slots: {
    inject: (slot, callback) => { assert.equal(slot, 'conversation.input.left'); return callback(); },
    register: (options, component) => core.register(options, component),
  } }, store);
  const entry = core.entriesOfSlot('conversation.input.left').find(item => item.options.id === 'dsh-intelligent-ui:mode');
  const root = dependency('react-dom/client').createRoot(document.getElementById('root'));
  const { act } = React;
  const render = async id => act(async () => root.render(React.createElement(entry.component, { sessionId: id })));
  const click = async element => act(async () => { element.click(); });
  const toggle = () => document.querySelector('[role="switch"]');
  try {
    await render('a');
    await body({ store, core, entry, native, dispose, render, click, toggle, act, root });
  } finally {
    await act(async () => root.unmount()); dispose(); dom.window.close();
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

domTest('visible composer switch toggles the current conversation with one click and blocks repeated submissions', async () => {
  await withDom(storeFixture(), async ({ store, toggle, click, act }) => {
    assert.deepEqual(store.refreshes, ['a']);
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
    assert.match(toggle().textContent, /Intelligent UI.*开/);
    assert.match(toggle().title, /当前对话.*后续回复.*历史回答/);
    assert.equal(document.querySelector('[role="menu"]'), null);
    await click(toggle());
    assert.deepEqual(store.changes.map(({ id, enabled }) => ({ id, enabled })), [{ id: 'a', enabled: false }]);
    assert.equal(toggle().disabled, true);
    assert.equal(toggle().getAttribute('aria-busy'), 'true');
    await click(toggle()); assert.equal(store.changes.length, 1);
    await act(async () => store.finish(0));
    assert.equal(toggle().disabled, false);
    assert.equal(toggle().getAttribute('aria-checked'), 'false');
    assert.match(toggle().textContent, /关/);
    await click(toggle());
    assert.equal(store.changes[1].enabled, true);
    await act(async () => store.finish(1));
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
  });
});

domTest('unknown state cannot change the mode and a visible retry refreshes a failed initial read', async () => {
  await withDom(storeFixture({ enabled: null, pending: true, error: null }), async ({ store, toggle, click, act }) => {
    assert.equal(toggle().disabled, true); assert.match(toggle().textContent, /待同步/);
    await click(toggle()); assert.equal(store.changes.length, 0);
    await act(async () => store.publish('a', { pending: false, error: 'offline' }));
    assert.match(document.querySelector('[role="alert"]').textContent, /未能同步.*重试/);
    await click(document.querySelector('.diui-mode-retry'));
    assert.deepEqual(store.refreshes, ['a', 'a']);
    await act(async () => store.publish('a', ready(true)));
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(toggle().disabled, false);
  });
});

domTest('failed changes retain the confirmed state and retry the same intended value in one click', async () => {
  await withDom(storeFixture(), async ({ store, toggle, click, act }) => {
    await click(toggle());
    await act(async () => store.finish(0, 'save failed'));
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
    await click(document.querySelector('.diui-mode-retry'));
    assert.equal(store.changes[1].enabled, false);
    assert.equal(document.querySelector('.diui-mode-retry'), null, 'store clears the error while retrying');
    await act(async () => store.finish(1));
    assert.equal(toggle().getAttribute('aria-checked'), 'false');
  });
});

domTest('switching conversations releases the old subscription and isolates outstanding changes', async () => {
  await withDom(storeFixture(), async ({ store, toggle, click, render, act }) => {
    await click(toggle());
    await render('b');
    assert.equal(store.subscriptions.get('a').size, 0);
    assert.equal(store.subscriptions.get('b').size, 1);
    assert.deepEqual(store.refreshes, ['a', 'b']);
    assert.equal(toggle().getAttribute('aria-checked'), 'false');
    await click(toggle()); assert.equal(store.changes[1].id, 'b');
    await act(async () => store.finish(0, 'old conversation failed'));
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(toggle().disabled, true);
    await act(async () => store.finish(1));
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
    await act(async () => store.publish('b', { error: 'fresh status failure' }));
    await click(document.querySelector('.diui-mode-retry'));
    assert.deepEqual(store.refreshes, ['a', 'b', 'b']);
    assert.equal(store.changes.length, 2, 'an old conversation intent is never replayed');
  });
});

domTest('public list registration preserves existing controls and disposal removes only Intelligent UI', async () => {
  const store = storeFixture();
  await withDom(store, async ({ core, entry, native, dispose }) => {
    assert.equal(entry.options.order, 40);
    assert.equal(core.entriesOfSlot('conversation.input.left').length, 2);
    dispose();
    assert.deepEqual(core.entriesOfSlot('conversation.input.left').map(item => item.component), [native]);
  });
  assert.equal(store.subscriptions.get('a').size, 0);
});

domTest('the mounted composer navigates between conversations without reloading unrelated host preferences', async () => {
  const listeners = new Set(), mirrorListeners = new Set();
  let value = { defaultEnabled: true, sessionOverrides: { b: false } }, loads = 0;
  let mirrored = { status: 'ready', error: null };
  const form = {
    getSnapshot: () => ({ status: 'ready', writable: true, value }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const mirror = {
    getSnapshot: () => mirrored,
    subscribe(listener) { mirrorListeners.add(listener); return () => mirrorListeners.delete(listener); },
    async load() {
      loads++;
      mirrored = { status: 'ready', error: null };
      for (const listener of mirrorListeners) listener();
    },
  };
  const store = createModeStore({ get: () => form, describe: () => mirror });
  try {
    await withDom(store, async ({ render, toggle, act, click }) => {
      for (const id of ['a', 'b', 'c', 'a', 'b', 'a', 'c', 'b']) {
        await render(id);
        assert.equal(toggle().getAttribute('aria-checked'), String(id !== 'b'));
        assert.equal(toggle().disabled, false);
      }
      assert.equal(loads, 0, 'mounting and switching sessions must not invalidate global settings');
      await act(async () => {
        value = { ...value, sessionOverrides: {} };
        for (const listener of listeners) listener();
      });
      assert.equal(toggle().getAttribute('aria-checked'), 'true', 'external updates remain live');
      await act(async () => {
        mirrored = { status: 'ready', error: 'connection lost' };
        for (const listener of mirrorListeners) listener();
      });
      await click(document.querySelector('.diui-mode-retry'));
      assert.equal(loads, 1, 'an explicit retry is still wired to a real settings read');
      assert.equal(document.querySelector('[role="alert"]'), null);
    });
  } finally { store.dispose(); }
  assert.equal(listeners.size, 0);
  assert.equal(mirrorListeners.size, 0);
});
