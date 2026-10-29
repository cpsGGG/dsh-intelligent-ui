import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPluginEnabled, watchPluginEnabled } from '../plugin/client-lifecycle.mjs';
import { createModeStore } from '../plugin/mode-store.mjs';

const ID = 'dsh-intelligent-ui';
const identity = { bundleName: ID };
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function snapshot({ bundle = true, component = true, entryId = 'include:dsh-intelligent-ui' } = {}) {
  return [
    [{ name: ID, enabled: bundle, rows: [{ rowId: ID, moduleName: ID, entryId }] }],
    [{ entryId, moduleName: ID, enabled: component, fiberPhase: 'active' }],
  ];
}
function bus() {
  const listeners = new Map();
  return {
    on(name, callback) {
      const set = listeners.get(name) ?? new Set(); listeners.set(name, set); set.add(callback);
      return () => { set.delete(callback); };
    },
    emit(name) { for (const callback of [...listeners.get(name) ?? []]) callback(); },
    count() { return [...listeners.values()].reduce((total, set) => total + set.size, 0); },
  };
}
function remoteHarness() {
  const events = bus(), requests = [];
  return {
    events, requests,
    remote: {
      $on: events.on,
      pluginManager: {
        listBundles() { const request = { bundles: deferred(), plugins: deferred() }; requests.push(request); return request.bundles.promise; },
        listPlugins() { return requests.at(-1).plugins.promise; },
      },
    },
    answer(index, state = snapshot()) {
      requests[index].bundles.resolve({ ok: true, value: state[0] });
      requests[index].plugins.resolve({ ok: true, value: state[1] });
    },
  };
}
function harness({ cleanup } = {}) {
  const remote = remoteHarness(), local = bus();
  const state = { mounted: false, mounts: 0, releases: 0, errors: [] };
  const dispose = watchPluginEnabled({ remote: remote.remote, on: local.on }, {
    ...identity,
    mount() {
      assert.equal(state.mounted, false, 'never register the same interface twice');
      state.mounted = true; ++state.mounts;
      return () => { state.mounted = false; ++state.releases; return cleanup?.(); };
    },
    onError: error => state.errors.push(error),
  });
  return { ...remote, local, state, dispose };
}

test('enablement requires the selected bundle and its exact enabled runtime component', () => {
  assert.equal(isPluginEnabled(...snapshot(), identity), true);
  assert.equal(isPluginEnabled(...snapshot({ bundle: false }), identity), false);
  assert.equal(isPluginEnabled(...snapshot({ component: false }), identity), false);
  const [bundles, plugins] = snapshot();
  assert.equal(isPluginEnabled(bundles, [{ ...plugins[0], entryId: 'another-copy' }], identity), false);
  assert.equal(isPluginEnabled(bundles, [{ ...plugins[0], moduleName: 'other-plugin' }], identity), false);
  assert.equal(isPluginEnabled([{ ...bundles[0], rows: [] }], plugins, identity), false);
  assert.equal(isPluginEnabled(undefined, plugins, identity), false);
  assert.equal(isPluginEnabled(bundles, null, identity), false);
});

test('initially unmounted; bundle/component disabling removes UI and each re-enable mounts once', async () => {
  const h = harness();
  assert.equal(h.state.mounted, false);
  h.answer(0); await tick(); assert.equal(h.state.mounts, 1);
  h.events.emit('plugin-manager/changed'); h.answer(1); await tick();
  assert.equal(h.state.mounts, 1, 'an unrelated plugin change preserves control state');
  h.events.emit('plugin-manager/changed'); h.answer(2, snapshot({ component: false })); await tick();
  assert.equal(h.state.mounted, false);
  h.events.emit('plugin-manager/changed'); h.answer(3); await tick();
  assert.equal(h.state.mounts, 2);
  h.events.emit('plugin-manager/changed'); h.answer(4, snapshot({ bundle: false })); await tick();
  assert.equal(h.state.mounted, false);
  h.events.emit('plugin-manager/changed'); h.answer(5); await tick();
  assert.equal(h.state.mounts, 3);
  await h.dispose(); await h.dispose();
  assert.equal(h.state.releases, 3);
  assert.equal(h.events.count() + h.local.count(), 0);
});

test('late enabled reads cannot revive a newer disabled state or a disposed watcher', async () => {
  const h = harness();
  h.events.emit('plugin-manager/changed');
  h.answer(1, snapshot({ component: false })); await tick();
  h.answer(0); await tick(); assert.equal(h.state.mounts, 0);
  h.events.emit('plugin-manager/changed');
  await h.dispose();
  h.answer(2); await tick();
  assert.equal(h.state.mounts, 0);
  assert.equal(h.events.count() + h.local.count(), 0);
});

test('connection reset removes UI immediately and discards pre-reset reads', async () => {
  const h = harness();
  h.answer(0); await tick();
  h.events.emit('plugin-manager/changed');
  h.local.emit('connection/reset');
  assert.equal(h.state.mounted, false, 'do not trust the previous host while reconnecting');
  h.answer(1); await tick(); assert.equal(h.state.mounted, false);
  h.answer(2); await tick(); assert.equal(h.state.mounts, 2);
  await h.dispose();
});

test('RPC failure and missing host rows fail closed, then later official invalidations recover', async () => {
  const h = harness();
  h.answer(0); await tick();
  h.events.emit('plugin-manager/changed');
  h.requests[1].bundles.resolve({ ok: false, error: { code: 'disconnected' } });
  h.requests[1].plugins.resolve({ ok: true, value: snapshot()[1] });
  await tick(); assert.equal(h.state.mounted, false);
  h.events.emit('plugin-manager/changed'); h.answer(2); await tick();
  h.events.emit('plugin-manager/changed'); h.requests[3].bundles.reject(new Error('connection reset'));
  await tick(); assert.equal(h.state.mounted, false); assert.equal(h.state.errors.length, 1);
  h.events.emit('plugin-manager/changed'); h.answer(4, [snapshot()[0], []]); await tick();
  assert.equal(h.state.mounted, false);
  h.events.emit('plugin-manager/changed'); h.answer(5); await tick();
  assert.equal(h.state.mounted, true);
  await h.dispose();
});

test('a stale RPC rejection does not remove an interface confirmed by a newer read', async () => {
  const h = harness();
  h.events.emit('plugin-manager/changed'); h.answer(1); await tick();
  h.requests[0].bundles.reject(new Error('old request'));
  await tick(); assert.equal(h.state.mounted, true); assert.equal(h.state.errors.length, 0);
  await h.dispose();
});

test('re-enable waits for asynchronous cleanup and disposal cancels the pending remount', async () => {
  const cleanup = deferred();
  const h = harness({ cleanup: () => cleanup.promise });
  h.answer(0); await tick();
  h.local.emit('connection/reset'); h.answer(1); await tick();
  assert.equal(h.state.mounts, 1);
  let stopped = false;
  const stopping = h.dispose().then(() => { stopped = true; });
  await tick(); assert.equal(stopped, false);
  cleanup.resolve(); await stopping; await tick();
  assert.equal(h.state.mounts, 1);
  assert.equal(h.state.releases, 1);
});

const localRequire = createRequire(import.meta.url);
const dependency = name => process.env.DSH_BUILD_DEPS
  ? localRequire(join(process.env.DSH_BUILD_DEPS, name)) : localRequire(name);
let dependencies;
try {
  dependencies = {
    React: dependency('react'), jsx: dependency('react/jsx-runtime'),
    esbuild: dependency('esbuild'), JSDOM: dependency('jsdom').JSDOM,
    Context: dependency('@deepseek-ai/cordis').Context,
    SlotCore: dependency('@deepseek-ai/dsh-client-ui-slots').SlotCore,
  };
} catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }

test('production client uses Cordis cleanup to remove styles, sidebar, panel, and assistant shadow together', {
  skip: dependencies ? false : 'Set DSH_BUILD_DEPS to the installed DSH plugin node_modules.',
}, async () => {
  const { React, jsx, esbuild, JSDOM, Context, SlotCore } = dependencies;
  const dom = new JSDOM('<!doctype html><head></head><body></body>');
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  const ctx = new Context(), core = new SlotCore(), remote = remoteHarness();
  const compile = (path, modules) => {
    const code = esbuild.transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => {
      if (Object.hasOwn(modules, name)) return modules[name];
      throw new Error('Unexpected dependency: ' + name);
    }, module, module.exports);
    return module.exports;
  };
  const common = { react: React, 'react/jsx-runtime': jsx };
  const primitives = Object.fromEntries(['DisclosureRow', 'IconThinkOutlineRegular', 'TextShimmer', 'MarkdownText', 'JsonBlock'].map(name => [name, () => null]));
  const adapter = compile('../plugin/assistant-node.jsx', { ...common, '@deepseek-ai/dsh-client-ui-primitives': primitives });
  const modeSwitch = compile('../plugin/mode-switch.jsx', common);
  const client = compile('../plugin/client.jsx', {
    ...common, './assistant-node.jsx': adapter, './client-lifecycle.mjs': { watchPluginEnabled },
    './mode-switch.jsx': modeSwitch, './mode-store.mjs': { createModeStore },
    './blocks.jsx': { RichAnswer: () => null, Attachment: () => null },
    './copy-controls.jsx': { ImageCopyLayer: React.Fragment },
    './samples.mjs': { inlineSamples: [] }, './reader.css': '/* test styles */',
  });
  core.register({ name: 'root', children: {
    'conversation.chat.node': { kind: 'keyed', scope: 'session' },
    'conversation.input.left': { kind: 'list', scope: 'session' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
    main: { kind: 'keyed', scope: 'root' },
  } }, () => null);
  const native = () => null;
  core.register({ name: 'conversation.chat.node', key: 'assistant-step' }, native);
  const slots = {
    entries: name => core.entries(name),
    inject: (_name, callback) => callback(),
    register: (options, component) => core.register(options, component),
  };
  ctx.provide('remote', remote.remote); ctx.provide('slots', slots);
  ctx.provide('configForms', {
    get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ status: 'ready', writable: true, value: {} }) }),
    describe: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ status: 'ready', error: null }), load: async () => {} }),
  });
  const enabled = () => {
    assert.equal(document.querySelectorAll('style[data-plugin="dsh-intelligent-ui"]').length, 1);
    assert.equal(core.entriesOfSlot('conversation.chat.node')[0].options.priority, -20);
    assert.equal(core.entriesOfSlot('sidebar.panellist').length, 1);
    assert.equal(core.entriesOfSlot('main').length, 1);
    assert.equal(core.entriesOfSlot('conversation.input.left').length, 1);
  };
  const disabled = () => {
    assert.equal(document.querySelectorAll('style[data-plugin="dsh-intelligent-ui"]').length, 0);
    assert.equal(core.entriesOfSlot('conversation.chat.node')[0].component, native);
    assert.equal(core.entriesOfSlot('sidebar.panellist').length, 0);
    assert.equal(core.entriesOfSlot('main').length, 0);
    assert.equal(core.entriesOfSlot('conversation.input.left').length, 0);
  };
  let dispose;
  try {
    assert.ok(client.inject.includes('remote.pluginManager'));
    dispose = client.apply(ctx);
    disabled(); remote.answer(0); await tick(); enabled();
    remote.events.emit('plugin-manager/changed'); remote.answer(1, snapshot({ component: false })); await tick(); disabled();
    remote.events.emit('plugin-manager/changed'); remote.answer(2); await tick(); enabled();
    await dispose(); disabled(); assert.equal(remote.events.count(), 0);
    ctx.emit('connection/reset'); assert.equal(remote.requests.length, 3);
    // A later registration failure must also undo earlier effects in the group.
    slots.register = (options, component) => {
      if (options.name === 'main') throw new Error('test panel conflict');
      return core.register(options, component);
    };
    dispose = client.apply(ctx);
    remote.answer(3); await tick(); disabled();
  } finally {
    await dispose?.(); await ctx.fiber.dispose(); dom.window.close();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
