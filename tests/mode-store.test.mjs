import test from 'node:test';
import assert from 'node:assert/strict';
import { createModeStore } from '../plugin/mode-store.mjs';

function harness({ value = { defaultEnabled: true, sessionOverrides: {} }, base = { defaultEnabled: true, sessionOverrides: {} } } = {}) {
  const callbacks = new Set(), mirrorCallbacks = new Set(), mutations = [];
  let snapshot = { status: 'ready', writable: true, revision: 1, value, base };
  let mirrorSnapshot = { status: 'ready', error: null };
  let accept = true, delay, loads = 0, formDisposed = false;
  const emit = () => { for (const callback of callbacks) callback(); };
  const form = {
    getSnapshot: () => snapshot,
    subscribe(callback) { callbacks.add(callback); return () => callbacks.delete(callback); },
    async mutate(operations) {
      mutations.push(operations);
      await delay;
      if (!accept) return false;
      const overrides = { ...snapshot.value.sessionOverrides };
      for (const op of operations) {
        assert.equal(op.path[0], 'sessionOverrides');
        if (op.op === 'set') overrides[op.path[1]] = op.value;
        else if (Object.hasOwn(base.sessionOverrides, op.path[1])) overrides[op.path[1]] = base.sessionOverrides[op.path[1]];
        else delete overrides[op.path[1]];
      }
      snapshot = { ...snapshot, revision: snapshot.revision + 1, value: { ...snapshot.value, sessionOverrides: overrides } };
      emit(); return true;
    },
    dispose() { formDisposed = true; },
  };
  const mirror = {
    getSnapshot: () => mirrorSnapshot,
    subscribe(callback) { mirrorCallbacks.add(callback); return () => mirrorCallbacks.delete(callback); },
    async load() { loads++; mirrorSnapshot = { status: 'ready', error: null }; for (const callback of mirrorCallbacks) callback(); },
  };
  const store = createModeStore({ get(name) { assert.equal(name, 'dsh-intelligent-ui'); return form; }, describe: () => mirror });
  return {
    store, mutations, callbacks, mirrorCallbacks,
    get loads() { return loads; }, get formDisposed() { return formDisposed; },
    failWrites() { accept = false; }, delayWrites(promise) { delay = promise; },
    setSnapshot(next) { snapshot = { ...snapshot, ...next }; emit(); },
    setMirror(next) { mirrorSnapshot = next; for (const callback of mirrorCallbacks) callback(); },
  };
}

test('one click changes only the addressed conversation and default-on removes redundant overrides', async () => {
  const h = harness(), a = 'session-a', b = 'session-b';
  assert.equal(h.store.getSnapshot(a).enabled, true);
  assert.equal(h.store.getSnapshot(a), h.store.getSnapshot(a), 'React snapshots stay stable');
  assert.equal(await h.store.setEnabled(a, false), true);
  assert.equal(h.store.getSnapshot(a).enabled, false);
  assert.equal(h.store.getSnapshot(b).enabled, true);
  assert.deepEqual(h.mutations[0], [{ op: 'set', path: ['sessionOverrides', a], value: false }]);
  await h.store.setEnabled(a, true);
  assert.deepEqual(h.mutations[1], [{ op: 'unset', path: ['sessionOverrides', a] }]);
  assert.equal(h.store.getSnapshot(a).enabled, true);
  h.store.dispose();
});

test('pending writes keep confirmed state and repeated clicks cannot queue inverse writes', async () => {
  const h = harness(); let release;
  h.delayWrites(new Promise(resolve => { release = resolve; }));
  const pending = h.store.setEnabled('session-a', false);
  assert.equal(h.store.getSnapshot('session-a').pending, true);
  assert.equal(h.store.getSnapshot('session-a').enabled, true);
  assert.equal(h.store.setEnabled('session-a', true), pending);
  release(); await pending;
  assert.equal(h.mutations.length, 1);
  assert.deepEqual(h.store.getSnapshot('session-a'), { enabled: false, pending: false, error: null });
  h.store.dispose();
});

test('failed writes preserve host state and expose a retry without leaking RPC diagnostics', async () => {
  const h = harness(); h.failWrites();
  assert.equal(await h.store.setEnabled('session-a', false), false);
  assert.equal(h.store.getSnapshot('session-a').enabled, true);
  assert.match(h.store.getSnapshot('session-a').error, /未保存/);
  await h.store.refresh('session-a');
  assert.equal(h.loads, 1);
  assert.equal(h.store.getSnapshot('session-a').error, null);
  h.store.dispose();
});

test('conversation navigation uses synchronized settings without global reloads or losing write errors', async () => {
  const h = harness({ value: { defaultEnabled: true, sessionOverrides: { 'session-b': false } } });
  for (const id of ['session-a', 'session-b', 'session-c', 'session-a']) {
    await h.store.refresh(id, { force: false });
    assert.equal(h.store.getSnapshot(id).enabled, id !== 'session-b');
  }
  assert.equal(h.loads, 0, 'a global reload can reset another plugin’s live theme');
  h.failWrites();
  await h.store.setEnabled('session-a', false);
  await h.store.refresh('session-a', { force: false });
  assert.match(h.store.getSnapshot('session-a').error, /未保存/);
  assert.equal(h.loads, 0);
  h.store.dispose();
});

test('navigation waits for host startup and receives subsequent external settings updates', async () => {
  const h = harness();
  h.setSnapshot({ status: 'loading', value: undefined });
  h.setMirror({ status: 'loading', error: null });
  await h.store.refresh('session-a', { force: false });
  await h.store.refresh('session-b', { force: false });
  assert.equal(h.loads, 0, 'do not enqueue a second host read during startup');
  assert.deepEqual(h.store.getSnapshot('session-b'), { enabled: null, pending: true, error: null });
  let updates = 0;
  h.store.subscribe('session-b', () => updates++);
  h.setSnapshot({ status: 'ready', value: { defaultEnabled: true, sessionOverrides: { 'session-b': false } } });
  h.setMirror({ status: 'ready', error: null });
  assert.deepEqual(h.store.getSnapshot('session-b'), { enabled: false, pending: false, error: null });
  h.setSnapshot({ value: { defaultEnabled: true, sessionOverrides: {} } });
  assert.equal(h.store.getSnapshot('session-b').enabled, true);
  assert.ok(updates >= 2, 'host notifications keep the switch fresh without navigation reloads');
  assert.equal(h.loads, 0);
  h.store.dispose();
});

test('an unanswered or failed settings read can still load, and an explicit retry forces a refresh', async () => {
  const h = harness();
  h.setSnapshot({ status: 'loading', value: undefined });
  h.setMirror({ status: 'idle', error: null });
  await Promise.all(['session-a', 'session-b'].map(id => h.store.refresh(id, { force: false })));
  assert.equal(h.loads, 1, 'concurrent first reads coalesce');
  h.setSnapshot({ status: 'ready', value: { defaultEnabled: true, sessionOverrides: {} } });
  h.setMirror({ status: 'ready', error: 'offline' });
  await h.store.refresh('session-a', { force: false });
  assert.equal(h.loads, 2);
  assert.equal(h.store.getSnapshot('session-a').error, null);
  await h.store.refresh('session-a');
  assert.equal(h.loads, 3, 'the retry button must still be able to refresh ready but stale settings');
  await h.store.refresh(undefined, { force: false });
  assert.equal(h.loads, 3, 'an unscoped composer must not refresh global settings');
  h.store.dispose();
  await h.store.refresh('session-a');
  assert.equal(h.loads, 3);
});

test('base overrides and a changed default cannot invert the requested state on reset', async () => {
  const h = harness({ value: { defaultEnabled: true, sessionOverrides: { 'session-a': false } }, base: { defaultEnabled: true, sessionOverrides: { 'session-a': false } } });
  await h.store.setEnabled('session-a', true);
  assert.deepEqual(h.mutations[0], [{ op: 'set', path: ['sessionOverrides', 'session-a'], value: true }]);
  assert.equal(h.store.getSnapshot('session-a').enabled, true);
  await h.store.setEnabled('session-a', false);
  assert.equal(h.mutations[1][0].op, 'unset');
  assert.equal(h.store.getSnapshot('session-a').enabled, false);
  h.store.dispose();
});

test('missing, loading, read-only and disconnected settings cannot masquerade as an enabled switch', async () => {
  const h = harness();
  h.setSnapshot({ status: 'loading', value: undefined });
  assert.deepEqual(h.store.getSnapshot('session-a'), { enabled: null, pending: true, error: null });
  h.setMirror({ status: 'idle', error: 'private network diagnostic' });
  assert.deepEqual(h.store.getSnapshot('session-a'), { enabled: null, pending: false, error: '暂时无法同步，点击重试' });
  h.setSnapshot({ status: 'unavailable' });
  assert.equal(await h.store.setEnabled('session-a', false), false);
  assert.equal(h.mutations.length, 0);
  h.store.dispose();
});

test('disposing removes listeners, preserves the shared settings service and ignores late completions', async () => {
  const h = harness(); let release, calls = 0;
  const off = h.store.subscribe('session-a', () => calls++);
  h.delayWrites(new Promise(resolve => { release = resolve; }));
  const pending = h.store.setEnabled('session-a', false);
  assert.ok(calls > 0); off(); h.store.dispose(); const before = calls;
  release(); await pending;
  assert.equal(calls, before);
  assert.equal(h.callbacks.size, 0); assert.equal(h.mirrorCallbacks.size, 0);
  assert.equal(h.formDisposed, false);
  assert.equal(await h.store.setEnabled('session-a', true), false);
});
