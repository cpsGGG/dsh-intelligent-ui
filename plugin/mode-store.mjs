import { isSessionId, MAX_SESSION_OVERRIDES, readMode } from './mode-policy.mjs';

/** Adapt the official Settings form; the host remains the source of truth. */
export function createModeStore(configForms, namespace = 'dsh-intelligent-ui') {
  const form = configForms.get(namespace);
  const mirror = configForms.describe();
  const listeners = new Map(), snapshots = new Map(), writes = new Map(), errors = new Map();
  let disposed = false, refreshing;
  const notify = () => {
    if (disposed) return;
    for (const set of listeners.values()) for (const listener of [...set]) listener();
  };
  const unsubscribe = form.subscribe(notify);
  const unsubscribeMirror = mirror.subscribe(notify);

  function getSnapshot(sessionId) {
    const current = form.getSnapshot(), mirrored = mirror.getSnapshot();
    const valid = isSessionId(sessionId);
    const ready = valid && current.status === 'ready';
    const error = errors.get(sessionId)
      ?? (mirrored.error ? '暂时无法同步，点击重试' : null)
      ?? (!valid ? '请先选择对话' : null)
      ?? (current.status === 'unavailable' ? '开关尚未就绪，点击重试' : null)
      ?? (ready && !current.writable ? '暂时无法保存，点击重试' : null);
    const next = {
      enabled: ready ? readMode(current.value, sessionId) : null,
      pending: writes.has(sessionId) || (!ready && !error),
      error,
    };
    const previous = snapshots.get(sessionId);
    if (previous && previous.enabled === next.enabled && previous.pending === next.pending && previous.error === next.error) return previous;
    snapshots.set(sessionId, next);
    return next;
  }

  function subscribe(sessionId, listener) {
    if (disposed) return () => {};
    const set = listeners.get(sessionId) ?? new Set();
    listeners.set(sessionId, set); set.add(listener);
    return () => {
      set.delete(listener);
      if (!set.size) { listeners.delete(sessionId); snapshots.delete(sessionId); }
    };
  }

  async function refresh(sessionId, { force = true } = {}) {
    if (disposed || !isSessionId(sessionId)) return;
    const current = form.getSnapshot(), mirrored = mirror.getSnapshot();
    // The host already refreshes this shared mirror on settings changes and
    // reconnects. Navigation must not reload every namespace: doing so can
    // make the theme runtime re-adopt its builtin preference over a live skin.
    // Leave a pending host read alone; explicit retries can still force a read.
    if (!force && (mirrored.status === 'loading' || (current.status === 'ready' && !mirrored.error))) return;
    errors.delete(sessionId); notify();
    if (!refreshing) {
      refreshing = Promise.resolve().then(() => mirror.load()).catch(() => {
        if (!disposed) errors.set(sessionId, '暂时无法同步，点击重试');
      }).finally(() => { refreshing = undefined; notify(); });
    }
    await refreshing;
  }

  function setEnabled(sessionId, enabled) {
    if (disposed) return Promise.resolve(false);
    if (writes.has(sessionId)) return writes.get(sessionId);
    const current = form.getSnapshot();
    if (!isSessionId(sessionId) || typeof enabled !== 'boolean' || current.status !== 'ready' || !current.writable) {
      errors.set(sessionId, '暂时无法保存，点击重试'); notify();
      return Promise.resolve(false);
    }
    const overrides = current.value?.sessionOverrides ?? {};
    const inherited = readMode({ ...current.value, sessionOverrides: current.base?.sessionOverrides ?? {} }, sessionId);
    const clearing = enabled === inherited;
    if (!clearing && !Object.hasOwn(overrides, sessionId) && Object.keys(overrides).length >= MAX_SESSION_OVERRIDES) {
      errors.set(sessionId, '保存的对话偏好已达上限'); notify();
      return Promise.resolve(false);
    }
    // Clear redundant overrides, but keep any inherited per-session setting intact.
    const operation = clearing ? { op: 'unset', path: ['sessionOverrides', sessionId] }
      : { op: 'set', path: ['sessionOverrides', sessionId], value: enabled };
    errors.delete(sessionId);
    const task = Promise.resolve().then(() => form.mutate([operation])).then(accepted => {
      if (!disposed && !accepted) errors.set(sessionId, '切换未保存，点击重试');
      return accepted === true;
    }).catch(() => {
      if (!disposed) errors.set(sessionId, '切换未保存，点击重试');
      return false;
    }).finally(() => { writes.delete(sessionId); notify(); });
    writes.set(sessionId, task); notify();
    return task;
  }

  return {
    getSnapshot, subscribe, refresh, setEnabled,
    dispose() {
      disposed = true; unsubscribe(); unsubscribeMirror();
      listeners.clear(); snapshots.clear(); errors.clear();
      // ConfigForms owns the shared form and its queue; never dispose it here.
    },
  };
}
