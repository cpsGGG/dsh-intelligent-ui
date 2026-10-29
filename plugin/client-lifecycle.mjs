/**
 * The public Plugin Manager contract distinguishes a selected bundle from its
 * individual runtime entries. Match the declared row's runtime identity, just
 * as DSH's own Plugin Manager does, rather than trusting a module-name match.
 */
export function isPluginEnabled(bundles, plugins, { bundleName, componentId = bundleName, moduleName = bundleName }) {
  if (!Array.isArray(bundles) || !Array.isArray(plugins)) return false;
  const bundle = bundles.find(item => item?.name === bundleName);
  if (bundle?.enabled !== true || !Array.isArray(bundle.rows)) return false;
  const row = bundle.rows.find(item => item?.rowId === componentId && item.moduleName === moduleName);
  if (typeof row?.entryId !== 'string') return false;
  return plugins.some(item => item?.entryId === row.entryId && item.moduleName === moduleName && item.enabled === true);
}

/**
 * Keep one UI effect mounted while the host explicitly enables both the bundle
 * and its component. The callbacks are public remote invalidations used by
 * DSH's own Plugin Manager; no private controller or host configuration access.
 *
 * A connection reset invalidates the old permission immediately. Ordinary
 * invalidations retain mounted controls while reading, so unrelated plugin
 * changes do not reset user input. Failed/unknown reads always unmount them.
 */
export function watchPluginEnabled(ctx, { mount, onError = () => {}, ...identity }) {
  let disposed = false;
  let generation = 0;
  let release;
  let cleanupPending = Promise.resolve();
  const listeners = [];

  const unmount = () => {
    const cleanup = release;
    release = undefined;
    if (cleanup) {
      try {
        cleanupPending = Promise.all([cleanupPending, cleanup()]).then(() => {}, onError);
      } catch (error) {
        onError(error);
      }
    }
    return cleanupPending;
  };

  const refresh = async (reset = false) => {
    if (disposed) return;
    const current = ++generation;
    if (reset) unmount();
    try {
      const [bundles, plugins] = await Promise.all([
        ctx.remote.pluginManager.listBundles(),
        ctx.remote.pluginManager.listPlugins(),
      ]);
      if (disposed || current !== generation) return;
      if (bundles?.ok !== true || plugins?.ok !== true
        || !isPluginEnabled(bundles.value, plugins.value, identity)) {
        await unmount();
        return;
      }
      if (release) return;
      await cleanupPending;
      if (disposed || current !== generation) return;
      release = mount();
    } catch (error) {
      if (disposed || current !== generation) return;
      await unmount();
      onError(error);
    }
  };

  const dispose = () => {
    if (disposed) return cleanupPending;
    disposed = true;
    ++generation;
    for (const unsubscribe of listeners.splice(0).reverse()) {
      try { unsubscribe(); } catch (error) { onError(error); }
    }
    return unmount();
  };

  try {
    listeners.push(ctx.remote.$on('plugin-manager/changed', () => { void refresh(); }));
    listeners.push(ctx.on('connection/reset', () => { void refresh(true); }));
    void refresh();
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
