import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

const SLOT = 'conversation.input.left';
const DESCRIPTION = '仅影响当前对话的后续回复，历史回答保持原样。';

function ModeSwitch({ sessionId, modeStore }) {
  const subscribe = useCallback(listener => modeStore.subscribe(sessionId, listener), [modeStore, sessionId]);
  const read = useCallback(() => modeStore.getSnapshot(sessionId), [modeStore, sessionId]);
  const { enabled, pending, error } = useSyncExternalStore(subscribe, read, read);
  const request = useRef(null);
  const retryTarget = useRef(null);

  useEffect(() => {
    request.current = null;
    retryTarget.current = null;
    modeStore.refresh(sessionId, { force: false });
    return () => {
      request.current = null;
      retryTarget.current = null;
    };
  }, [modeStore, sessionId]);

  const change = async target => {
    if (pending || request.current !== null) return;
    const attempt = { sessionId, target };
    request.current = attempt;
    retryTarget.current = attempt;
    try {
      // The store owns optimistic state, transport errors and rollback.
      await modeStore.setEnabled(sessionId, target);
    } finally {
      if (request.current === attempt) {
        request.current = null;
        if (modeStore.getSnapshot(sessionId).error === null) retryTarget.current = null;
      }
    }
  };
  const retry = () => {
    if (pending || request.current !== null) return;
    const previous = retryTarget.current;
    if (previous?.sessionId === sessionId) void change(previous.target);
    else modeStore.refresh(sessionId);
  };
  const unknown = enabled === null;
  const state = unknown ? 'unknown' : enabled ? 'on' : 'off';

  return <div className="diui-mode" data-intelligent-ui-mode={state} data-pending={pending || undefined}>
    <button type="button" className="diui-mode-toggle" role="switch" aria-label="Intelligent UI"
      aria-checked={enabled === true} aria-busy={pending || undefined} disabled={pending || unknown}
      title={DESCRIPTION} onClick={() => { void change(!enabled); }}>
      <span className="diui-mode-label">Intelligent UI</span>
      <span className="diui-mode-track" aria-hidden="true"><span className="diui-mode-thumb"/></span>
      <span className="diui-mode-state">{unknown ? '待同步' : enabled ? '开' : '关'}</span>
    </button>
    {error !== null && <span className="diui-mode-error" role="alert">
      <span>未能同步</span>
      <button type="button" className="diui-mode-retry" disabled={pending} onClick={retry}
        title="重试当前对话的 Intelligent UI 设置">重试</button>
    </span>}
  </div>;
}

/** Add one visible control beside DSH's native permission/Plan controls. */
export function registerModeSwitch(ctx, modeStore) {
  return ctx.slots.inject(SLOT, () => ctx.slots.register({
    name: SLOT,
    id: 'dsh-intelligent-ui:mode',
    order: 40,
  }, props => <ModeSwitch {...props} modeStore={modeStore}/>));
}
